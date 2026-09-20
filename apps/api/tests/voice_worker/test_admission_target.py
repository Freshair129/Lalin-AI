# @req FR-19.6/FR-19.9/FR-19.11/FR-19.12 (candidate) — LVP-AT-011/013/017/018: target binding + bounded input
from __future__ import annotations

import json

import pytest

from .conftest import PRESET_ID, auth


@pytest.mark.parametrize(
    "target_override, code, reason",
    [
        ({"runtime_id": "speech-other"}, "TARGET_MISMATCH", "runtime_id"),
        ({"physical_resource_id": "gpu-b"}, "TARGET_MISMATCH", "physical_resource_id"),
        ({"runtime_epoch": "ep-stale-000"}, "TARGET_MISMATCH", "stale_epoch"),
        ({"profile_id": "asr-other"}, "PROFILE_MISMATCH", "profile"),
        ({"profile_revision": "rev-old"}, "PROFILE_MISMATCH", "profile"),
    ],
)
def test_target_and_profile_mismatch_are_rejected_before_compute(worker_factory, target_override, code, reason):
    worker = worker_factory("tts")
    response = worker.post_tts(worker.envelope("t-mismatch", target=target_override))
    assert response.status_code == 409, response.text
    body = response.json()["error"]
    assert body["code"] == code and body["details"]["reason"] == reason and body["started"] is False
    assert worker.status("t-mismatch").status_code == 404


def test_kind_not_served_by_profile_is_profile_mismatch(worker_factory):
    worker = worker_factory("asr")
    env = worker.envelope("wrong-kind", kind="tts")
    response = worker.post_tts(env)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PROFILE_MISMATCH"


def test_unknown_kind_and_bad_ids_are_schema_errors(worker_factory):
    worker = worker_factory("tts")
    bad_kind = worker.envelope("k1")
    bad_kind["kind"] = "dubbing"
    response = worker.post_tts(bad_kind)
    assert response.status_code == 422 and response.json()["error"]["code"] == "INVALID_REQUEST"
    traversal = worker.envelope("k2")
    traversal["attempt_id"] = "../escape"
    response = worker.post_tts(traversal)
    assert response.status_code == 422
    naive = worker.envelope("k3", admission={"deadline_at": "2026-09-21T03:03:00"})
    assert worker.post_tts(naive).status_code == 422
    wrong_version = worker.envelope("k4")
    wrong_version["contract_version"] = "2.0"
    assert worker.post_tts(wrong_version).status_code == 422


@pytest.mark.parametrize("field", ["ref_audio", "model_path", "upstream_url", "engine"])
def test_engine_extras_are_unsupported_parameters(worker_factory, field):
    worker = worker_factory("tts")
    env = worker.envelope("extra")
    env["input"][field] = "C:/anything"
    response = worker.post_tts(env)
    assert response.status_code == 422
    body = response.json()["error"]
    assert body["code"] == "UNSUPPORTED_PARAMETER"
    assert any(field in item for item in body["details"]["unsupported_parameters"])
    assert "C:/anything" not in response.text  # ไม่ echo ค่าที่ผู้เรียกส่ง


def test_tts_preset_and_bounds(worker_factory):
    worker = worker_factory("tts")
    unknown = worker.post_tts(worker.envelope("v1", input={"voice_preset_id": "preset-user-upload"}))
    assert unknown.status_code == 422 and unknown.json()["error"]["code"] == "VOICE_NOT_APPROVED"
    stale = worker.post_tts(worker.envelope("v2", input={"voice_revision": "r0"}))
    assert stale.status_code == 422 and stale.json()["error"]["code"] == "VOICE_NOT_APPROVED"
    long_text = worker.post_tts(worker.envelope("v3", input={"text": "ก" * 801}))
    assert long_text.status_code == 422
    assert long_text.json()["error"]["details"]["code_points"] == 801
    speed = worker.post_tts(worker.envelope("v4", input={"speed": 2.0}))
    assert speed.status_code == 422 and speed.json()["error"]["code"] == "INVALID_REQUEST"
    mp3 = worker.post_tts(worker.envelope("v5", input={"response_format": "mp3"}))
    assert mp3.status_code == 422 and mp3.json()["error"]["code"] == "UNSUPPORTED_PARAMETER"
    whitespace = worker.post_tts(worker.envelope("v6", input={"text": "   \n  "}))
    assert whitespace.status_code == 422
    multipart_tts = worker.client.post("/worker/v1/operations", data={"envelope": json.dumps(worker.envelope("v7"))},
                                       files={"audio": ("a.wav", b"xx", "audio/wav")}, headers=auth())
    assert multipart_tts.status_code == 422 and multipart_tts.json()["error"]["code"] == "INVALID_REQUEST"
    for attempt in ("v1", "v2", "v3", "v4", "v5", "v6", "v7"):
        assert worker.status(attempt).status_code == 404


def test_normalized_text_is_counted_after_collapse(worker_factory):
    worker = worker_factory("tts")
    text = ("ก " * 400) + " "  # 800 code points หลัง collapse (400 ตัวอักษร + 399 ช่องว่าง = 799 → ผ่าน)
    response = worker.post_tts(worker.envelope("norm", input={"text": text}))
    assert response.status_code == 202, response.text
    final = worker.wait_terminal("norm")
    assert final["result"]["text_code_points"] == 799
    assert final["result"]["text_policy_revision"] == "norm-v1"


def test_asr_bounded_transfer_checks_happen_before_engine(worker_factory):
    worker = worker_factory("asr")
    env = worker.envelope("a-json")
    assert worker.post_tts(env).status_code == 422  # asr ผ่าน JSON ไม่มี audio part
    mismatch = worker.post_asr(worker.envelope("a-sha"), fix_digest=False)
    assert mismatch.status_code == 422 and mismatch.json()["error"]["code"] == "INVALID_REQUEST"
    empty = worker.post_asr(worker.envelope("a-empty"), audio=b"")
    assert empty.status_code == 422
    too_big = worker.post_asr(worker.envelope("a-big"), audio=b"\x00" * (1024 * 1024 + 1))
    assert too_big.status_code == 413 and too_big.json()["error"]["code"] == "AUDIO_TOO_LARGE"
    declared_big = worker.post_asr(worker.envelope("a-declared", input={"audio_bytes": 50 * 1024 * 1024}), fix_digest=False)
    assert declared_big.status_code == 413
    spoofed = worker.post_asr(worker.envelope("a-mime", input={"declared_mime_type": "text/html"}))
    assert spoofed.status_code == 422 and spoofed.json()["error"]["code"] == "AUDIO_FORMAT_UNSUPPORTED"
    language = worker.post_asr(worker.envelope("a-lang", input={"language": "ja"}))
    assert language.status_code == 422 and language.json()["error"]["code"] == "LANGUAGE_UNSUPPORTED"
    for attempt in ("a-json", "a-sha", "a-empty", "a-big", "a-declared", "a-mime", "a-lang"):
        assert worker.status(attempt).status_code == 404
    assert not any(worker.settings.attempts_dir.rglob("*")), "rejected payloads must not be staged"


def test_oversized_content_length_is_rejected_early(worker_factory):
    worker = worker_factory("asr")
    response = worker.client.post("/worker/v1/operations", content=b"x", headers={**auth(), "Content-Length": str(20 * 1024 * 1024),
                                                                                 "Content-Type": "multipart/form-data; boundary=x"})
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "AUDIO_TOO_LARGE"


def test_device_mismatch_blocks_readiness_and_dispatch(worker_factory):
    worker = worker_factory("tts", manifest={"device": "cuda:0"}, engine_options={"effective_device": "cpu"})
    readiness = worker.client.get("/worker/v1/readiness", headers=auth()).json()
    assert readiness["ready"] is False and readiness["profiles"][0]["reason"] == "device_mismatch"
    assert readiness["device"] == {"configured": "cuda:0", "effective": "cpu"}
    response = worker.post_tts(worker.envelope("dev"))
    assert response.status_code == 409
    body = response.json()["error"]
    assert body["code"] == "TARGET_MISMATCH" and body["details"]["reason"] == "device_mismatch"


def test_success_path_uses_only_approved_preset_metadata(worker_factory):
    worker = worker_factory("tts")
    assert worker.post_tts(worker.envelope("ok")).status_code == 202
    final = worker.wait_terminal("ok")
    assert final["operation_outcome"] == "SUCCEEDED"
    assert final["result"]["voice_preset_id"] == PRESET_ID and final["result"]["voice_revision"] == "r1"
    assert "ref_text" not in final["result"] and "ref_audio" not in final["result"]
