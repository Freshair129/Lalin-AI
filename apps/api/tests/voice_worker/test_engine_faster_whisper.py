# @req FR-19.3 (candidate, CR-005) — Slice B ASR: faster-whisper engine ผ่าน supervisor/runtime จริง (cpu int8, large-v3-turbo)
"""ต้องรันใน venv ที่มี speech stack (apps/api/.venv-speech) และมี weights ที่ pin ไว้ใน apps/api/models/faster-whisper/
ถ้าไม่มีอย่างใดอย่างหนึ่ง → SKIP (ไม่ใช่ PASS): venv หลักไม่ลง faster-whisper โดยเจตนา

fixture เสียง: tests/voice_worker/fixtures/en-short.wav (Windows SAPI "Testing the voice worker. One two three." 16 kHz mono)
ภาษาไทยยังไม่มี fixture — คุณภาพไทย = NOT_RUN จนกว่าจะมีคลิปที่มีสิทธิ์ใช้
"""
from __future__ import annotations

import hashlib
import io
import json
import math
import random
import wave
from pathlib import Path

import pytest

from app.voice_worker.profile import ProfileError, load_manifest
from tests.voice_worker.conftest import auth, write_manifest
from app.voice_worker.supervisor import EngineStartError, EngineSupervisor

faster_whisper = pytest.importorskip("faster_whisper", reason="speech stack not installed in this venv (use .venv-speech)")

API_ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = API_ROOT / "models" / "faster-whisper" / "large-v3-turbo"
PINS = API_ROOT / "models" / "faster-whisper" / "PINS.json"
FIXTURE = Path(__file__).parent / "fixtures" / "en-short.wav"

pytestmark = pytest.mark.skipif(not (MODEL_DIR / "model.bin").is_file() or not PINS.is_file(),
                                reason="pinned faster-whisper large-v3-turbo weights not present (models/ is gitignored)")


def _assets() -> list[dict]:
    pins = json.loads(PINS.read_text(encoding="utf-8"))["large-v3-turbo"]["files"]
    return [{"role": name, "path": str(MODEL_DIR / name), "sha256": meta["sha256"]} for name, meta in pins.items()]


def _installed_vad_sha256() -> str:
    from faster_whisper.utils import get_assets_path

    return hashlib.sha256((Path(get_assets_path()) / "silero_vad_v6.onnx").read_bytes()).hexdigest()


def _manifest_overrides(*, vad: bool = True) -> dict:
    # ตรงกับ asr-th-en-01 ที่ ship จริง: VAD เปิด (D14)
    options = {"compute_type": "int8", "beam_size": 1, "heartbeat_seconds": 0.2, "warmup": False}
    if vad:
        options.update({"vad_filter": True, "vad_min_silence_ms": 700, "vad_model_sha256": _installed_vad_sha256()})
    return {
        "profile_id": "asr-fw-test",
        "runtime_id": "speech-asr-fw-test",
        "engine": "faster-whisper",
        "device": "cpu",
        "engine_options": options,
        "assets": _assets(),
    }


def _wav(samples: list[float], rate: int = 16000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(b"".join(int(max(-1.0, min(1.0, x)) * 32767).to_bytes(2, "little", signed=True) for x in samples))
    return buf.getvalue()


def _silence(seconds: float = 6.0) -> bytes:
    return _wav([0.0] * int(16000 * seconds))


def _white_noise(seconds: float = 6.0) -> bytes:
    rng = random.Random(7)
    return _wav([rng.gauss(0.0, 0.05) for _ in range(int(16000 * seconds))])


def _hum(seconds: float = 6.0, hz: float = 50.0) -> bytes:
    return _wav([0.2 * math.sin(2 * math.pi * hz * i / 16000) for i in range(int(16000 * seconds))])


@pytest.fixture(scope="module")
def fw_worker(worker_factory_module):
    return worker_factory_module("asr", manifest=_manifest_overrides(), settings={"engine_hello_timeout_seconds": 120.0})


def test_describe_reports_real_engine_not_stub(fw_worker):
    body = fw_worker.client.get("/worker/v1/describe", headers=auth()).json()
    assert body["engine"]["name"] == "faster-whisper"
    assert body["engine"]["labeled_stub"] is False
    assert body["profiles"][0]["engine"] == "faster-whisper"
    assert body["profiles"][0]["state"]["qualified"] is False  # ยังไม่มี Thai/GPU evidence


def test_transcribes_english_fixture(fw_worker):
    audio = FIXTURE.read_bytes()
    env = fw_worker.envelope("fw-en-1")
    env["input"]["language"] = "en"
    response = fw_worker.post_asr(env, audio=audio)
    assert response.status_code == 202, response.text
    final = fw_worker.wait_terminal("fw-en-1", timeout=120.0)
    assert final["execution_status"] == "FINISHED"
    assert final["operation_outcome"] == "SUCCEEDED", final
    result = final["result"]
    assert result["engine"] == "faster-whisper" and result["provenance"] == "measured"
    assert "testing" in result["text"].lower() and ("three" in result["text"].lower() or "3" in result["text"])
    assert result["language"] == "en" and result["duration_seconds"] > 1.0
    assert result["segments"] and all({"start", "end", "text"} <= set(s) for s in result["segments"])
    assert final["usage"]["audio_input_seconds"] == pytest.approx(result["duration_seconds"], abs=0.01)
    assert final["usage"]["provenance"] == "measured"


def test_auto_language_detects_english(fw_worker):
    env = fw_worker.envelope("fw-auto-1")
    env["input"]["language"] = "auto"
    assert fw_worker.post_asr(env, audio=FIXTURE.read_bytes()).status_code == 202
    final = fw_worker.wait_terminal("fw-auto-1", timeout=120.0)
    assert final["operation_outcome"] == "SUCCEEDED", final
    assert final["result"]["language"] == "en"


def test_garbage_bytes_fail_closed_not_hallucinated(fw_worker):
    env = fw_worker.envelope("fw-bad-1")
    assert fw_worker.post_asr(env, audio=b"RIFF" + bytes(range(256)) * 8).status_code == 202
    final = fw_worker.wait_terminal("fw-bad-1", timeout=120.0)
    assert final["execution_status"] == "FINISHED" and final["operation_outcome"] == "FAILED"
    assert final["error"]["code"] in {"AUDIO_FORMAT_UNSUPPORTED", "RUNTIME_FAILED", "NO_SPEECH"}
    assert final["result"] is None


def test_missing_cuda_device_fails_closed(tmp_path):
    """device=cuda:9 ไม่มีจริง → engine child exit ไม่ส่ง hello → EngineStartError (ไม่ fallback cpu)."""

    path = write_manifest(tmp_path, "asr", **{**_manifest_overrides(), "device": "cuda:9",
                                              "engine_options": {"compute_type": "int8", "warmup": False}})
    manifest = load_manifest(path)
    supervisor = EngineSupervisor(manifest, hello_timeout_seconds=60.0)
    with pytest.raises(EngineStartError):
        supervisor.start()
    assert supervisor.alive is False


@pytest.mark.parametrize(
    "overrides, message_part",
    [
        ({"engine_options": {"compute_type": "auto"}}, "compute_type"),
        ({"device": "cpu", "engine_options": {"compute_type": "float16"}}, "cpu"),
        ({"engine_options": {"compute_type": "int8", "beam_size": 0}}, "beam_size"),
        ({"assets": []}, "pin assets"),
    ],
)
def test_faster_whisper_manifest_validation(tmp_path, overrides, message_part):

    base = _manifest_overrides()
    merged = {**base, **overrides}
    if "engine_options" in overrides:
        merged["engine_options"] = {**base["engine_options"], **overrides["engine_options"]}
    path = write_manifest(tmp_path, "asr", **merged)
    with pytest.raises(ProfileError) as exc:
        load_manifest(path)
    assert message_part in str(exc.value)


# ── D14: input ที่ไม่มีคำพูดต้องได้ NO_SPEECH ไม่ใช่ประโยคที่แต่งขึ้น ─────────────────────────
# ก่อน D14 (VAD ปิด) ทั้งสามกรณีนี้ตอบ SUCCEEDED พร้อมประโยคไทยที่ดูเหมือนจริง เช่น "ขอบคุณครับ"
@pytest.mark.parametrize("name, make", [("silence", _silence), ("white-noise", _white_noise), ("hum-50hz", _hum)])
def test_non_speech_returns_no_speech_not_fabricated_text(fw_worker, name, make):
    attempt = f"fw-nonspeech-{name}"
    env = fw_worker.envelope(attempt)
    env["input"]["language"] = "th"
    assert fw_worker.post_asr(env, audio=make()).status_code == 202
    final = fw_worker.wait_terminal(attempt, timeout=120.0)
    assert final["execution_status"] == "FINISHED"
    assert final["operation_outcome"] == "FAILED", f"{name} was transcribed as speech: {final.get('result')}"
    assert final["error"]["code"] == "NO_SPEECH"
    assert final["result"] is None


def test_vad_keeps_real_speech(fw_worker):
    """VAD ต้องไม่กินเสียงพูดจริง — fixture อังกฤษยังถอดได้ครบ"""
    env = fw_worker.envelope("fw-vad-speech")
    env["input"]["language"] = "en"
    assert fw_worker.post_asr(env, audio=FIXTURE.read_bytes()).status_code == 202
    final = fw_worker.wait_terminal("fw-vad-speech", timeout=120.0)
    assert final["operation_outcome"] == "SUCCEEDED", final
    assert "testing" in final["result"]["text"].lower()


def test_vad_model_hash_mismatch_fails_closed(tmp_path):
    """sha256 ของ VAD ไม่ตรง → engine ไม่ส่ง hello → worker ไม่ขึ้น (ไม่ fallback เป็น VAD ปิด)"""
    overrides = _manifest_overrides()
    overrides["engine_options"]["vad_model_sha256"] = "0" * 64
    manifest = load_manifest(write_manifest(tmp_path, "asr", **overrides))
    supervisor = EngineSupervisor(manifest, hello_timeout_seconds=60.0)
    with pytest.raises(EngineStartError):
        supervisor.start()
    assert supervisor.alive is False


def test_shipped_manifest_pins_the_installed_vad_model():
    """กันการอัปเกรด faster-whisper ที่เปลี่ยน VAD เงียบ ๆ: hash ใน manifest ที่ ship ต้องตรงกับไฟล์ใน wheel"""
    shipped = json.loads((API_ROOT / "profiles" / "voice-worker" / "asr-th-en-01.json").read_text(encoding="utf-8"))
    assert shipped["engine_options"]["vad_filter"] is True
    assert shipped["engine_options"]["vad_model_sha256"] == _installed_vad_sha256()


@pytest.mark.parametrize(
    "options, message_part",
    [
        ({"vad_filter": "yes"}, "vad_filter"),
        ({"vad_filter": True, "vad_model_sha256": None}, "vad_model_sha256"),
        ({"vad_filter": True, "vad_model_sha256": "abc"}, "vad_model_sha256"),
        ({"vad_min_silence_ms": 50}, "vad_min_silence_ms"),
        ({"vad_min_silence_ms": True}, "vad_min_silence_ms"),
    ],
)
def test_vad_manifest_validation(tmp_path, options, message_part):
    overrides = _manifest_overrides(vad=False)
    overrides["engine_options"] = {**overrides["engine_options"], **options}
    with pytest.raises(ProfileError) as exc:
        load_manifest(write_manifest(tmp_path, "asr", **overrides))
    assert message_part in str(exc.value)
