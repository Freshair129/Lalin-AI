# @req FR-19 (candidate, CR-005) — D18 (a), N = 2: OOM ซ้ำ → หยุด restart engine และประกาศ not-ready
"""ตัดสิน 2026-09-22 (Fable 5.1 แทนเจ้าของ) จากหลักฐาน Slice C §8: ใต้เพดาน 2.1 GB ทุก request ถูก OOM kill และ engine โหลดใหม่
(~14 s) ทุกครั้ง ขณะที่ worker ยังบอกว่า ready → coordinator ส่งงานที่จะล้มมาเรื่อย ๆ · เพดาน memory ไม่แก้ตัวเอง
จึง fail closed: OOM ที่ cgroup ยืนยันติดกันครบ ``oom_lockout_after`` ครั้ง (ไม่มีงานไหนจบระหว่างนั้น) → ไม่ restart engine,
readiness = false ด้วย reason ``repeated_oom`` จน operator ขยายเพดานแล้ว restart worker
"""
from __future__ import annotations

import time

import pytest

from app.voice_worker import supervisor as supervisor_module
from app.voice_worker.settings import ConfigError

from .conftest import auth, make_settings, write_manifest


def _kill_mid_job(worker, attempt: str) -> dict:
    env = worker.envelope(attempt)
    assert worker.post_asr(env).status_code == 202
    deadline = time.time() + 10
    while time.time() < deadline and worker.status(attempt).json()["execution_status"] != "RUNNING":
        time.sleep(0.05)
    assert worker.status(attempt).json()["execution_status"] == "RUNNING"
    worker.runtime.supervisor._proc.kill()  # ภายนอกฆ่า engine เหมือน OOM killer
    return worker.wait_terminal(attempt, timeout=30)


def _readiness(worker) -> dict:
    return worker.client.get("/worker/v1/readiness", headers=auth()).json()


@pytest.fixture()
def oom_worker(worker_factory, monkeypatch):
    monkeypatch.setattr(supervisor_module, "oom_killed_since", lambda *_a, **_k: True)
    return worker_factory("asr", engine_options={"work_seconds": 1.5})


def test_one_oom_restarts_the_engine(oom_worker):
    first = _kill_mid_job(oom_worker, "oom-1")
    assert first["error"]["code"] == "RUNTIME_OOM"
    ready = oom_worker.wait_ready(timeout=30)
    assert ready.get("oom_lockout") is None


def test_second_consecutive_oom_locks_the_worker_out(oom_worker):
    _kill_mid_job(oom_worker, "oom-a")
    oom_worker.wait_ready(timeout=30)
    second = _kill_mid_job(oom_worker, "oom-b")
    assert second["error"]["code"] == "RUNTIME_OOM"
    time.sleep(1.0)  # เวลาที่ restart จะเกิดถ้ายังไม่ได้ lock
    body = _readiness(oom_worker)
    assert body["ready"] is False
    assert body["profiles"][0]["reason"] == "repeated_oom"
    assert body["engine_alive"] is False, "engine must not be restarted after the lockout"
    lockout = body["oom_lockout"]
    assert lockout["reason"] == "repeated_oom" and lockout["consecutive_oom_kills"] == 2 and lockout["threshold"] == 2
    describe = oom_worker.client.get("/worker/v1/describe", headers=auth()).json()
    assert describe["profiles"][0]["state"]["ready"] is False and describe["profiles"][0]["state"]["ready_reason"] == "repeated_oom"
    refused = oom_worker.post_asr(oom_worker.envelope("oom-after"))
    assert refused.status_code == 503
    assert refused.json()["error"]["code"] == "MODEL_UNAVAILABLE"


def test_a_finished_job_resets_the_count(oom_worker):
    _kill_mid_job(oom_worker, "oom-x")
    oom_worker.wait_ready(timeout=30)
    assert oom_worker.post_asr(oom_worker.envelope("ok-between")).status_code == 202
    assert oom_worker.wait_terminal("ok-between", timeout=30)["operation_outcome"] == "SUCCEEDED"
    _kill_mid_job(oom_worker, "oom-y")
    body = oom_worker.wait_ready(timeout=30)
    assert body.get("oom_lockout") is None


def test_unconfirmed_kills_never_lock_out(worker_factory, monkeypatch):
    """ไม่มี cgroup (Windows) → ไม่รู้ว่าเป็น OOM → ไม่นับ ไม่ lock (ไม่เดา)"""
    monkeypatch.setattr(supervisor_module, "oom_killed_since", lambda *_a, **_k: None)
    worker = worker_factory("asr", engine_options={"work_seconds": 1.5})
    for n in range(2):
        assert _kill_mid_job(worker, f"crash-{n}")["error"]["code"] == "RUNTIME_FAILED"
        worker.wait_ready(timeout=30)


def test_threshold_is_configurable_and_validated(tmp_path):
    manifest = write_manifest(tmp_path, "asr")
    with pytest.raises(ConfigError, match="oom_lockout_after"):
        make_settings(tmp_path, manifest, oom_lockout_after=0).validate_runtime()
    make_settings(tmp_path, manifest, oom_lockout_after=3).validate_runtime()
