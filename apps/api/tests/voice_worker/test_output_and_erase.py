# @req FR-19.10/FR-19.12/FR-19.14 (candidate) — LVP-AT-015/019/025/026: results, validated output, scoped artifacts, erase fence
from __future__ import annotations

import hashlib
import io
import json
import time
import wave

from app.voice_worker.engine_stub import STUB_TRANSCRIPT

from .conftest import OTHER_TOKEN, auth


def _output(worker, attempt_id, token=None):
    return worker.client.get(f"/worker/v1/operations/{attempt_id}/output", headers=auth(token) if token else auth())


def test_tts_success_publishes_validated_wav_without_leaking_paths(worker_factory):
    worker = worker_factory("tts")
    assert worker.post_tts(worker.envelope("tts-ok")).status_code == 202
    final = worker.wait_terminal("tts-ok")
    assert final["execution_status"] == "FINISHED" and final["operation_outcome"] == "SUCCEEDED"
    result = final["result"]
    assert result["format"] == "wav" and result["sample_rate"] == 24000 and result["duration_seconds"] == 0.5
    assert result["engine"] == "stub" and result["provenance"] == "stub"
    assert "output_path" not in result
    assert str(worker.settings.data_dir) not in json.dumps(final)
    assert final["payload_state"] == "AVAILABLE" and final["compute_stopped"] is True
    assert final["usage"]["provenance"] == "measured" and final["usage"]["audio_output_seconds"] == 0.5

    response = _output(worker, "tts-ok")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("audio/wav")
    assert response.headers["x-content-sha256"] == result["sha256"] == hashlib.sha256(response.content).hexdigest()
    assert len(response.content) == result["bytes"]
    with wave.open(io.BytesIO(response.content), "rb") as handle:
        assert handle.getnframes() == 12000 and handle.getframerate() == 24000


def test_output_before_completion_and_for_asr_are_refused(worker_factory):
    tts = worker_factory("tts", engine_options={"work_seconds": 2.0})
    assert tts.post_tts(tts.envelope("slow")).status_code == 202
    early = _output(tts, "slow")
    assert early.status_code == 409 and early.json()["error"]["code"] == "OUTPUT_NOT_READY"
    tts.wait_terminal("slow")
    asr = worker_factory("asr")
    assert asr.post_asr(asr.envelope("asr-ok")).status_code == 202
    asr.wait_terminal("asr-ok")
    response = _output(asr, "asr-ok")
    assert response.status_code == 422 and response.json()["error"]["code"] == "INVALID_REQUEST"


def test_output_limit_is_enforced_and_cropped_audio_is_not_published(worker_factory):
    worker = worker_factory("tts", engine_options={"output_seconds": 61.0})
    assert worker.post_tts(worker.envelope("too-long")).status_code == 202
    final = worker.wait_terminal("too-long", timeout=20)
    assert final["operation_outcome"] == "FAILED" and final["error"]["code"] == "OUTPUT_LIMIT"
    assert final["result"] is None and final["payload_state"] == "NONE"
    assert _output(worker, "too-long").status_code == 409
    assert not list(worker.settings.attempts_dir.rglob("output.wav"))  # ไฟล์ที่เกินขอบเขตถูกลบ ไม่ publish แบบ crop


def test_erase_after_success_removes_content_but_keeps_outcome(worker_factory):
    worker = worker_factory("tts")
    assert worker.post_tts(worker.envelope("erase-done")).status_code == 202
    worker.wait_terminal("erase-done")
    erased = worker.client.delete("/worker/v1/operations/erase-done/payload", headers=auth())
    assert erased.status_code == 200 and erased.json()["payload_state"] == "ERASED"
    status = worker.status("erase-done").json()
    assert status["operation_outcome"] == "SUCCEEDED" and status["payload_state"] == "ERASED" and status["result"] is None
    gone = _output(worker, "erase-done")
    assert gone.status_code == 410 and gone.json()["error"]["code"] == "PAYLOAD_ERASED"
    again = worker.client.delete("/worker/v1/operations/erase-done/payload", headers=auth())
    assert again.status_code == 200 and again.json()["payload_state"] == "ERASED"
    assert not list(worker.settings.attempts_dir.rglob("output.wav"))


def test_erase_during_compute_creates_fence_that_survives_late_result(worker_factory):
    worker = worker_factory("tts", engine_options={"work_seconds": 2.0})
    assert worker.post_tts(worker.envelope("erase-mid")).status_code == 202
    time.sleep(0.3)
    requested = worker.client.delete("/worker/v1/operations/erase-mid/payload", headers=auth())
    assert requested.status_code == 202 and requested.json()["payload_state"] == "ERASE_REQUESTED"
    final = worker.wait_terminal("erase-mid", timeout=10)
    assert final["operation_outcome"] == "SUCCEEDED"  # ผลจบจริง แต่เนื้อหาถูกทิ้ง
    assert final["payload_state"] == "ERASED" and final["result"] is None
    assert _output(worker, "erase-mid").status_code == 410
    assert not list(worker.settings.attempts_dir.rglob("output.wav"))


def test_cancel_is_not_erase(worker_factory):
    worker = worker_factory("asr", engine_options={"work_seconds": 2.0})
    assert worker.post_asr(worker.envelope("cancel-not-erase")).status_code == 202
    time.sleep(0.2)
    worker.client.post("/worker/v1/operations/cancel-not-erase/cancel", headers=auth())
    final = worker.wait_terminal("cancel-not-erase")
    assert final["operation_outcome"] == "CANCELLED"
    assert final["payload_state"] == "NONE"  # ไม่มีเนื้อหาให้เก็บ แต่ไม่ได้ถูกประกาศเป็น ERASED โดย cancel


def test_asr_result_semantics_and_input_cleanup(worker_factory):
    worker = worker_factory("asr")
    assert worker.post_asr(worker.envelope("asr-1")).status_code == 202
    final = worker.wait_terminal("asr-1")
    result = final["result"]
    assert result == {"kind": "asr", "engine": "stub", "text": STUB_TRANSCRIPT, "language": "th", "duration_seconds": None,
                      "segments": [], "provenance": "stub"}
    assert final["payload_state"] == "AVAILABLE"
    assert not list(worker.settings.attempts_dir.rglob("input.bin"))  # input ลบทันทีหลังจบ
    erased = worker.client.delete("/worker/v1/operations/asr-1/payload", headers=auth())
    assert erased.status_code == 200
    assert worker.status("asr-1").json()["result"] is None


def test_other_issuer_cannot_read_cancel_erase_or_fetch(worker_factory):
    worker = worker_factory("tts")
    assert worker.post_tts(worker.envelope("scoped")).status_code == 202
    worker.wait_terminal("scoped")
    assert worker.status("scoped", token=OTHER_TOKEN).status_code == 404
    assert _output(worker, "scoped", token=OTHER_TOKEN).status_code == 404
    assert worker.client.post("/worker/v1/operations/scoped/cancel", headers=auth(OTHER_TOKEN)).status_code == 404
    assert worker.client.delete("/worker/v1/operations/scoped/payload", headers=auth(OTHER_TOKEN)).status_code == 404
    assert _output(worker, "scoped").status_code == 200  # owner ยังดึงได้ — issuer อื่นไม่ได้ทำให้ payload หาย
    unknown = worker.status("does-not-exist").json()["error"]
    other = worker.status("scoped", token=OTHER_TOKEN).json()["error"]
    assert unknown["code"] == other["code"] == "NOT_FOUND" and set(unknown) == set(other)


def test_no_directory_listing_or_path_routes_exist(worker_factory):
    worker = worker_factory("tts")
    for path in ("/worker/v1/operations", "/worker/v1/operations/", "/attempts", "/files", "/worker/v1/operations/x/../../etc"):
        response = worker.client.get(path, headers=auth())
        assert response.status_code in {404, 405, 422}, (path, response.status_code)
