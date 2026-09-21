# @req FR-19.3 (candidate, CR-005) — Slice B ASR: faster-whisper engine ผ่าน supervisor/runtime จริง (cpu int8, large-v3-turbo)
"""ต้องรันใน venv ที่มี speech stack (apps/api/.venv-speech) และมี weights ที่ pin ไว้ใน apps/api/models/faster-whisper/
ถ้าไม่มีอย่างใดอย่างหนึ่ง → SKIP (ไม่ใช่ PASS): venv หลักไม่ลง faster-whisper โดยเจตนา

fixture เสียง: tests/voice_worker/fixtures/en-short.wav (Windows SAPI "Testing the voice worker. One two three." 16 kHz mono)
ภาษาไทยยังไม่มี fixture — คุณภาพไทย = NOT_RUN จนกว่าจะมีคลิปที่มีสิทธิ์ใช้
"""
from __future__ import annotations

import json
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


def _manifest_overrides() -> dict:
    return {
        "profile_id": "asr-fw-test",
        "runtime_id": "speech-asr-fw-test",
        "engine": "faster-whisper",
        "device": "cpu",
        "engine_options": {"compute_type": "int8", "beam_size": 1, "heartbeat_seconds": 0.2, "warmup": False},
        "assets": _assets(),
    }


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
