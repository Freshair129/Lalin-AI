# @req FR-19.6/FR-19.8/FR-19.13 (candidate) — LVP-AT-021/022: deadline, honest cancellation, bounded intake
from __future__ import annotations

import time

from .conftest import auth


def test_expired_deadline_is_rejected_before_any_receipt(worker_factory):
    worker = worker_factory("tts")
    env = worker.envelope("late-deadline", start_in=-30, deadline_in=-1)
    response = worker.post_tts(env)
    assert response.status_code == 409
    body = response.json()["error"]
    assert body["code"] == "DEADLINE_EXCEEDED" and body["started"] is False and body["execution_status"] is None
    assert worker.status("late-deadline").status_code == 404


def test_expired_start_window_is_rejected_with_started_false(worker_factory):
    worker = worker_factory("tts")
    env = worker.envelope("late-start", start_in=-30, deadline_in=120)
    response = worker.post_tts(env)
    assert response.status_code == 409
    assert response.json()["error"]["details"]["reason"] == "start_window_expired"


def test_engine_stops_cooperatively_at_deadline(worker_factory):
    worker = worker_factory("tts", engine_options={"work_seconds": 5.0})
    env = worker.envelope("deadline-coop", deadline_in=0.6)
    assert worker.post_tts(env).status_code == 202
    final = worker.wait_terminal("deadline-coop", timeout=10)
    assert final["execution_status"] == "FINISHED" and final["operation_outcome"] == "FAILED"
    assert final["error"]["code"] == "DEADLINE_EXCEEDED"
    assert final["compute_stopped"] is True and final["stop_evidence"]["kind"] == "engine_returned"
    assert final["result"] is None and final["payload_state"] == "NONE"


def test_cancel_during_compute_is_ack_then_finished_cancelled(worker_factory):
    worker = worker_factory("tts", engine_options={"work_seconds": 4.0})
    assert worker.post_tts(worker.envelope("cancel-mid")).status_code == 202
    time.sleep(0.3)
    first = worker.client.post("/worker/v1/operations/cancel-mid/cancel", headers=auth())
    assert first.status_code == 202
    body = first.json()
    assert body["disposition"] == "ACK" and body["cancellation_requested"] is True
    assert body["compute_stopped"] is None  # ACK ≠ หยุดแล้ว
    repeat = worker.client.post("/worker/v1/operations/cancel-mid/cancel", headers=auth())
    assert repeat.status_code in {200, 202}
    final = worker.wait_terminal("cancel-mid", timeout=10)
    assert final["execution_status"] == "FINISHED" and final["operation_outcome"] == "CANCELLED"
    assert final["compute_stopped"] is True and final["stop_evidence"]["kind"] == "engine_returned"
    assert final["cancellation_requested"] is True
    after = worker.client.post("/worker/v1/operations/cancel-mid/cancel", headers=auth())
    assert after.status_code == 200 and after.json()["disposition"] == "ALREADY_FINISHED"


def test_hard_stop_terminates_only_own_engine_and_requalifies_with_new_epoch(worker_factory):
    worker = worker_factory(
        "tts",
        engine_options={"work_seconds": 30.0, "ignore_cancel": True, "ignore_budget": True},
        settings={"cancel_grace_seconds": 0.3, "terminate_grace_seconds": 3.0},
    )
    old_epoch = worker.epoch
    assert worker.post_tts(worker.envelope("hard-stop", deadline_in=0.5)).status_code == 202
    final = worker.wait_terminal("hard-stop", timeout=20)
    assert final["execution_status"] == "FINISHED" and final["operation_outcome"] == "FAILED"
    assert final["error"]["code"] == "DEADLINE_EXCEEDED"
    evidence = final["stop_evidence"]
    assert evidence["kind"] == "process_exit" and evidence["exited"] is True and evidence["intentional"] is True
    assert evidence["vram_reclaimed"] is None  # ไม่อ้างสิ่งที่ไม่ได้วัด
    assert final["compute_stopped"] is True
    readiness = worker.wait_ready(timeout=20)
    assert readiness["runtime_epoch"] != old_epoch
    stale = worker.post_tts(worker.envelope("after-restart", epoch=old_epoch))
    assert stale.status_code == 409 and stale.json()["error"]["details"]["reason"] == "stale_epoch"
    # engine ใหม่ (options เดิม: ignore_budget/30s) รับงานได้อีกครั้งภายใต้ epoch ใหม่ — ไม่รอจบเพราะ stub ตัวนี้ตั้งใจไม่หยุดเอง
    fresh = worker.post_tts(worker.envelope("after-restart-2"))
    assert fresh.status_code == 202
    assert fresh.json()["runtime_epoch"] == readiness["runtime_epoch"]
    assert worker.status("after-restart-2").json()["execution_status"] in {"ACCEPTED", "DISPATCHING", "RUNNING"}
    # งานที่จบไปแล้วยังถือ epoch เก่าใน receipt (ไม่ map ข้าม epoch)
    assert worker.status("hard-stop").json()["runtime_epoch"] == old_epoch


def test_saturation_returns_worker_busy_without_queueing(worker_factory):
    worker = worker_factory("tts", engine_options={"work_seconds": 2.0})
    assert worker.post_tts(worker.envelope("busy-1")).status_code == 202
    busy = worker.post_tts(worker.envelope("busy-2"))
    assert busy.status_code == 503
    body = busy.json()["error"]
    assert body["code"] == "WORKER_BUSY" and body["started"] is False and body["execution_status"] is None
    assert worker.status("busy-2").status_code == 404  # rejected-before-accept ≠ accepted-pending
    worker.wait_terminal("busy-1")
    assert worker.post_tts(worker.envelope("busy-3")).status_code == 202


def test_engine_failure_is_typed_and_sanitized(worker_factory):
    worker = worker_factory("tts", engine_options={"fail_with": "RUNTIME_OOM"})
    assert worker.post_tts(worker.envelope("oom")).status_code == 202
    final = worker.wait_terminal("oom")
    assert final["operation_outcome"] == "FAILED" and final["error"]["code"] == "RUNTIME_OOM"
    assert final["compute_stopped"] is True and final["stop_evidence"]["kind"] == "engine_returned"
    assert "Traceback" not in str(final)
