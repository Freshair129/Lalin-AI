# @req FR-19.3 (candidate, CR-005) — Slice B TTS: F5-TTS-THAI engine + manifest validation (D9 approve 2026-09-22)
"""manifest/chunker รันได้ทุก venv · engine จริงรันเฉพาะเมื่อมี torch + CUDA + weights (``.venv-tts`` บนเครื่อง dev)"""
from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import wave
from pathlib import Path

import pytest

from app.voice_worker.engine_f5 import chunk_text
from app.voice_worker.profile import ProfileError, load_manifest, manifest_from_dict

from .conftest import auth

API = Path(__file__).resolve().parents[2]
SHIPPED = API / "profiles" / "voice-worker" / "tts-th-preset-01.json"


def _shipped() -> dict:
    return json.loads(SHIPPED.read_text(encoding="utf-8"))


def _weights_present() -> bool:
    return all((SHIPPED.parent / a["path"]).is_file() for a in _shipped()["assets"])


def _cuda() -> bool:
    if importlib.util.find_spec("torch") is None:
        return False
    import torch

    return torch.cuda.is_available()


# ── manifest ────────────────────────────────────────────────
def test_shipped_manifest_loads_and_pins_every_file():
    if not _weights_present():
        pytest.skip("F5 weights not present on this box")
    manifest = load_manifest(SHIPPED)
    assert manifest.engine == "f5-tts" and manifest.kind == "tts"
    voice = manifest.voices[0]
    assert voice.rights_status == "dev-only", "the model's own sample must never be labelled approved"
    assert Path(voice.ref_audio).name == "ref_audio.wav"


@pytest.mark.parametrize("mutate, message", [
    (lambda m: m.update(kind="asr"), "kind=tts"),
    (lambda m: m.update(assets=[a for a in m["assets"] if a["role"] != "vocos.weights"]), "vocos.weights"),
    (lambda m: m["voices"][0].update(ref_audio="f5.ckpt"), "voice.*"),
    (lambda m: m["voices"][0].update(ref_audio="/some/unpinned/file.wav"), "voice.*"),
    (lambda m: m["engine_options"].update(nfe_step=0), "nfe_step"),
    (lambda m: m["engine_options"].update(cfg_strength=9), "cfg_strength"),
    (lambda m: m["engine_options"].update(seed=-1), "seed"),
    (lambda m: m["voices"][0].update(rights_status="probably-fine"), "rights_status"),
])
def test_f5_manifest_validation(mutate, message):
    data = copy.deepcopy(_shipped())
    mutate(data)
    with pytest.raises(ProfileError, match=message.replace("*", r"\*").replace(".", r"\.")):
        manifest_from_dict(data, verify_assets=False)


def test_voice_audio_resolves_to_its_pinned_asset():
    manifest = manifest_from_dict(_shipped(), verify_assets=False)
    pinned = {a.role: a.path for a in manifest.assets}
    assert manifest.voices[0].ref_audio == pinned["voice.sample-th-dev"]


# ── chunker ────────────────────────────────────────────────
def test_chunker_splits_on_punctuation_like_upstream():
    assert chunk_text("Hello world. This is a test, okay?", 20) == ["Hello world.", "This is a test,", "okay?"]


def test_chunker_splits_long_thai_at_spaces_and_keeps_them():
    text = "สวัสดีครับ วันนี้อากาศดีมาก เราจะไปเที่ยวทะเลกัน แล้วกลับบ้านตอนเย็น"
    chunks = chunk_text(text, 100)  # ทั้งประโยค ~190 byte: ต้องแตก และแต่ละก้อนรวมได้ 2 วลี (ทดสอบการต่อด้วยช่องว่าง)
    assert len(chunks) > 1 and all(len(c.encode("utf-8")) <= 100 for c in chunks)
    assert any(" " in c for c in chunks), "phrases inside a chunk must stay separated by a space"
    assert " ".join(chunks) == text, "no text may be lost or glued together"


def test_chunker_keeps_short_text_whole():
    assert chunk_text("สั้นๆ", 60) == ["สั้นๆ"]


# ── real engine ────────────────────────────────────────────
@pytest.fixture(scope="module")
def f5_worker(worker_factory_module):
    if not (_weights_present() and _cuda()):
        pytest.skip("needs torch + CUDA + F5 weights (.venv-tts on the dev box)")
    data = _shipped()
    for asset in data["assets"]:  # manifest ถูกเขียนไป tmp — ทำ path ให้เป็น absolute
        asset["path"] = str((SHIPPED.parent / asset["path"]).resolve())
    overrides = {k: v for k, v in data.items() if not k.startswith("_") and k != "kind"}
    return worker_factory_module("tts", manifest=overrides, settings={"engine_hello_timeout_seconds": 180.0})


def test_describe_reports_the_real_engine_and_dev_voice(f5_worker):
    body = f5_worker.client.get("/worker/v1/describe", headers=auth()).json()
    assert body["engine"]["name"] == "f5-tts" and body["engine"]["labeled_stub"] is False
    assert body["profiles"][0]["voices"][0]["rights_status"] == "dev-only"
    assert "ref_text" not in json.dumps(body), "reference transcript must not leak through describe"


def test_synthesizes_thai_to_a_valid_wav(f5_worker):
    f5_worker.wait_ready(timeout=180)
    env = f5_worker.envelope("f5-th-1", kind="tts", deadline_in=300)
    env["input"] = {"text": "สวัสดีครับ ยินดีต้อนรับสู่ระบบเสียง", "voice_preset_id": "sample-th-dev",
                    "voice_revision": "vizintzor-af023c7", "response_format": "wav"}
    assert f5_worker.post_tts(env).status_code == 202
    final = f5_worker.wait_terminal("f5-th-1", timeout=300)
    assert final["operation_outcome"] == "SUCCEEDED", final
    result = final["result"]
    assert result["engine"] == "f5-tts" and result["provenance"] == "measured"
    assert result["sample_rate"] == 24000 and result["channels"] == 1 and 0.8 < result["duration_seconds"] < 10
    got = f5_worker.client.get("/worker/v1/operations/f5-th-1/output", headers=auth())
    assert got.status_code == 200 and hashlib.sha256(got.content).hexdigest() == result["sha256"]
    with wave.open(__import__("io").BytesIO(got.content)) as handle:
        assert handle.getsampwidth() == 2 and handle.getnframes() > 0


# ── reference preparation (A/B 2026-09-22: pooled round-trip CER 0.137 → 0.097, first syllables no longer clipped) ──
@pytest.mark.parametrize("raw, expected", [
    ("ฉันไปเชียงใหม่", "ฉันไปเชียงใหม่. "),
    ("Hello there.", "Hello there. "),
    ("  ข้อความ  ", "ข้อความ. "),
    ("中文。", "中文。"),
])
def test_reference_text_gets_a_sentence_boundary(raw, expected):
    from app.voice_worker.engine_f5 import prepare_ref_text

    assert prepare_ref_text(raw) == expected


def test_reference_silence_is_trimmed_from_both_edges():
    import numpy as np

    from app.voice_worker.engine_f5 import trim_silence_edges

    sr = 24000
    tone = 0.3 * np.sin(np.linspace(0, 2 * np.pi * 440, sr // 2)).astype(np.float32)
    padded = np.concatenate([np.zeros(sr, np.float32), tone, np.zeros(sr, np.float32)])
    trimmed = trim_silence_edges(padded, sr)
    assert abs(len(trimmed) - len(tone)) <= sr // 100 * 2  # ภายในสองช่วง 10 ms
    assert len(trim_silence_edges(np.zeros(sr, np.float32), sr)) == sr, "all-silent input is returned unchanged"


def test_worker_does_not_need_encodec():
    """encodec ไม่มี wheel — engine ต้อง import vocos ได้ด้วย stub (ติดตั้งแบบ --only-binary ได้)"""
    import sys

    from app.voice_worker.engine_f5 import _install_import_stubs

    _install_import_stubs()
    assert "encodec" in sys.modules
