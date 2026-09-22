# @req FR-19 (candidate, CR-005) — /metrics: ตัวเลขสถานะแบบ Prometheus สำหรับระบบเฝ้าระวัง
"""มาตรฐานของทีมอื่น: บริการเปิด /metrics ให้ Prometheus ดึง ส่วน dashboard อยู่ในระบบเฝ้าระวัง ไม่ใช่ในบริการ
ข้อบังคับของเรา: metric ต้องไม่มีเนื้อหางาน (ข้อความที่ถอดได้/ข้อความ TTS/attempt_id/issuer/path) — เทสต์ด้านล่างบังคับไว้
"""
from __future__ import annotations

import pytest

from app.voice_worker.metrics import Counters, render

from .conftest import INFERENCE_TOKEN, MANAGEMENT_TOKEN, auth

SECRET_TEXT = "ลับเฉพาะลูกค้ารายนี้"


def _parse(text: str) -> dict[str, float]:
    """ชื่อ metric (พร้อม label) → ค่า"""
    out: dict[str, float] = {}
    for line in text.splitlines():
        if not line or line.startswith("#"):
            continue
        name, _, value = line.rpartition(" ")
        out[name] = float(value)
    return out


def test_render_is_valid_exposition_format():
    body = render(describe={"runtime_id": "rt", "contract_version": "1.0", "worker": {"version": "0.1"},
                            "engine": {"name": "stub", "version": "1", "labeled_stub": True},
                            "profiles": [{"profile_id": "p", "profile_revision": "r", "device": {"configured": "cpu", "effective": "cpu"}}],
                            "capacity": {"max_concurrency": 1, "in_use": 0}, "residency": {"warm": True}},
                  readiness={"ready": True, "runtime_epoch": "ep-1", "engine_alive": True, "draining": False,
                             "heartbeat_age_seconds": 0.2, "profiles": [{"reason": None}]},
                  counters=Counters().snapshot(), manifest_kind="asr", oom_lockout=None, consecutive_oom_kills=0)
    assert body.endswith("\n")
    for line in body.splitlines():
        assert line.startswith("#") or line.count(" ") >= 1
    values = _parse(body)
    assert values['lalin_voice_worker_ready{reason=""}'] == 1
    assert values["lalin_voice_worker_engine_alive"] == 1
    names = {line.split()[2] for line in body.splitlines() if line.startswith("# TYPE")}
    assert {"lalin_voice_worker_info", "lalin_voice_worker_attempts_finished_total"} <= names


def test_label_values_are_escaped():
    quote, backslash, newline = chr(34), chr(92), chr(10)
    runtime_id = "weird" + quote + backslash + "value"
    body = render(describe={"runtime_id": runtime_id, "engine": {}, "profiles": [{"profile_id": "p" + newline + "x", "device": {}}],
                            "capacity": {}, "residency": {}},
                  readiness={"ready": False, "runtime_epoch": None, "profiles": [{"reason": "warming_up"}]},
                  counters=Counters().snapshot(), manifest_kind="asr", oom_lockout=None, consecutive_oom_kills=0)
    info = next(line for line in body.splitlines() if line.startswith("lalin_voice_worker_info"))
    assert 'runtime_id="weird' + backslash + quote + backslash + backslash + 'value"' in info
    assert 'profile_id="p' + backslash + 'nx"' in info
    assert len([line for line in body.splitlines() if line.startswith("lalin_voice_worker_info")]) == 1, "a newline must not split the line"
    assert 'reason="warming_up"' in body and "lalin_voice_worker_ready{" in body


def test_counters_accumulate_by_outcome_and_code():
    counters = Counters()
    counters.accepted()
    counters.finished("SUCCEEDED", None, {"processing_seconds": 1.5, "audio_input_seconds": 3.0})
    counters.finished("FAILED", "NO_SPEECH", {"processing_seconds": 0.5})
    counters.finished("FAILED", "RUNTIME_OOM", None)
    counters.engine_died(oom=True)
    snap = counters.snapshot()
    assert snap["attempts_finished"] == {"SUCCEEDED": 1, "FAILED": 2}
    assert snap["attempts_failed"] == {"NO_SPEECH": 1, "RUNTIME_OOM": 1}
    assert snap["processing_seconds"] == 2.0 and snap["audio_input_seconds"] == 3.0
    assert snap["engine_deaths"] == 1 and snap["oom_kills"] == 1


def test_endpoint_needs_a_token_and_accepts_both_roles(worker_factory):
    worker = worker_factory("asr")
    assert worker.client.get("/worker/v1/metrics").status_code == 401
    inference = worker.client.get("/worker/v1/metrics", headers=auth(INFERENCE_TOKEN))
    management = worker.client.get("/worker/v1/metrics", headers=auth(MANAGEMENT_TOKEN))
    assert inference.status_code == 200 and management.status_code == 200
    assert inference.headers["content-type"].startswith("text/plain; version=0.0.4")
    assert "lalin_voice_worker_ready" in inference.text


def test_metrics_follow_a_real_job(worker_factory):
    worker = worker_factory("asr")
    before = _parse(worker.client.get("/worker/v1/metrics", headers=auth()).text)
    assert worker.post_asr(worker.envelope("m-1")).status_code == 202
    assert worker.wait_terminal("m-1")["operation_outcome"] == "SUCCEEDED"
    after = _parse(worker.client.get("/worker/v1/metrics", headers=auth()).text)
    assert after["lalin_voice_worker_attempts_accepted_total"] == before["lalin_voice_worker_attempts_accepted_total"] + 1
    assert after['lalin_voice_worker_attempts_finished_total{outcome="SUCCEEDED"}'] == 1
    assert after["lalin_voice_worker_processing_seconds_total"] > 0
    assert after["lalin_voice_worker_engine_starts_total"] >= 1


def test_failed_job_is_counted_by_error_code(worker_factory):
    worker = worker_factory("asr", engine_options={"fail_with": "NO_SPEECH"})
    assert worker.post_asr(worker.envelope("m-fail")).status_code == 202
    assert worker.wait_terminal("m-fail")["operation_outcome"] == "FAILED"
    values = _parse(worker.client.get("/worker/v1/metrics", headers=auth()).text)
    assert values['lalin_voice_worker_attempts_failed_total{code="NO_SPEECH"}'] == 1


@pytest.mark.parametrize("kind", ["asr", "tts"])
def test_metrics_never_carry_job_content(worker_factory, kind):
    """ห้ามให้ข้อความของลูกค้าหลุดเข้า metric (เก็บยาวและแชร์กว้างกว่าที่เจ้าของข้อมูลคาด)"""
    worker = worker_factory(kind)
    attempt = "m-secret"
    env = worker.envelope(attempt)
    if kind == "tts":
        env["input"]["text"] = SECRET_TEXT
        assert worker.post_tts(env).status_code == 202
    else:
        assert worker.post_asr(env).status_code == 202
    final = worker.wait_terminal(attempt)
    body = worker.client.get("/worker/v1/metrics", headers=auth()).text
    assert SECRET_TEXT not in body
    assert attempt not in body and "prp-coordinator" not in body
    text = ((final.get("result") or {}).get("text") or "")[:20]
    if text:
        assert text not in body
