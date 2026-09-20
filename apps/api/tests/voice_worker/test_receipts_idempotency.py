# @req FR-19.7 (candidate) — LVP-AT-020/023: durable receipts, idempotency race, restart reconciliation, retention
from __future__ import annotations

import multiprocessing
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path

from app.voice_worker.receipts import ReceiptStore
from app.voice_worker.timeutil import utc_now

from . import _race_helper
from .conftest import ISSUER, auth


def _accept(store: ReceiptStore, attempt_id: str, digest: str = "d" * 64, *, epoch: str = "ep-1", now=None):
    now = now or utc_now()
    return store.accept(
        issuer=ISSUER, attempt_id=attempt_id, invocation_id=f"inv-{attempt_id}", kind="asr", payload_digest=digest,
        profile_id="asr-stub-01", profile_revision="rev-test-1", runtime_id="speech-stub-asr", runtime_epoch=epoch,
        lease_id="lease", content_fence=None, start_before=now + timedelta(seconds=60), deadline_at=now + timedelta(seconds=120),
        payload_state="AVAILABLE", now=now,
    )


def test_accept_is_insert_if_absent(tmp_path):
    store = ReceiptStore(tmp_path / "r.sqlite3")
    first, created = _accept(store, "a1")
    again, created_again = _accept(store, "a1", digest="e" * 64)
    assert created is True and created_again is False
    assert again.payload_digest == first.payload_digest == "d" * 64  # ของเดิมชนะ; caller เทียบ digest → 409


def test_threaded_race_yields_exactly_one_created(tmp_path):
    store = ReceiptStore(tmp_path / "r.sqlite3")
    with ThreadPoolExecutor(max_workers=16) as pool:
        results = list(pool.map(lambda _: _accept(ReceiptStore(tmp_path / "r.sqlite3"), "race-t")[1], range(32)))
    assert sum(results) == 1
    assert store.get(ISSUER, "race-t") is not None


def test_cross_process_race_yields_exactly_one_created(tmp_path):
    path = str(tmp_path / "r.sqlite3")
    ReceiptStore(Path(path))  # schema
    ctx = multiprocessing.get_context("spawn")
    with ctx.Pool(4) as pool:
        results = pool.starmap(_race_helper.accept_once, [(path, "race-p", "f" * 64)] * 8)
    assert sum(results) == 1


def test_restart_reconciliation_marks_never_started_and_unknown(tmp_path):
    path = tmp_path / "r.sqlite3"
    store = ReceiptStore(path)
    now = utc_now()
    _accept(store, "accepted-only", epoch="ep-old", now=now)
    _accept(store, "dispatching", epoch="ep-old", now=now)
    store.mark_dispatching(ISSUER, "dispatching", now)
    _accept(store, "running", epoch="ep-old", now=now)
    store.mark_dispatching(ISSUER, "running", now)
    store.mark_running(ISSUER, "running", now)
    _accept(store, "done", epoch="ep-old", now=now)
    store.mark_dispatching(ISSUER, "done", now)
    store.mark_running(ISSUER, "done", now)
    store.finish(ISSUER, "done", outcome="SUCCEEDED", result={"kind": "asr", "text": "x"}, error=None, usage=None,
                 compute_stopped=True, stop_evidence={"kind": "engine_returned"}, safe_to_retry=None, now=now)

    restarted = ReceiptStore(path)
    counts = restarted.reconcile("ep-new", utc_now())
    assert counts == {"never_started": 1, "unknown": 2}

    accepted = restarted.get(ISSUER, "accepted-only")
    assert accepted.execution_status == "FINISHED" and accepted.operation_outcome == "FAILED"
    assert accepted.stop_evidence["kind"] == "never_started" and accepted.compute_stopped is True and accepted.safe_to_retry is True

    for attempt in ("dispatching", "running"):
        row = restarted.get(ISSUER, attempt)
        assert row.execution_status == "UNKNOWN"
        assert row.compute_stopped is None and row.safe_to_retry is False
        assert row.error["code"] == "EXECUTION_UNKNOWN"
        assert row.stop_evidence["kind"] == "parent_restarted_unverified"

    done = restarted.get(ISSUER, "done")
    assert done.execution_status == "FINISHED" and done.result == {"kind": "asr", "text": "x"}


def test_terminal_receipts_are_final_and_late_results_do_not_reopen(tmp_path):
    store = ReceiptStore(tmp_path / "r.sqlite3")
    now = utc_now()
    _accept(store, "late", now=now)
    store.mark_dispatching(ISSUER, "late", now)
    store.reconcile("ep-2", now)  # → UNKNOWN
    late = store.finish(ISSUER, "late", outcome="SUCCEEDED", result={"text": "late"}, error=None, usage=None,
                        compute_stopped=True, stop_evidence={"kind": "engine_returned"}, safe_to_retry=None, now=utc_now())
    assert late.execution_status == "UNKNOWN" and late.result is None


def test_cancel_before_start_and_dispatch_refusal(tmp_path):
    store = ReceiptStore(tmp_path / "r.sqlite3")
    now = utc_now()
    _accept(store, "c1", now=now)
    receipt, disposition = store.request_cancel(ISSUER, "c1", now)
    assert disposition == "CANCELLED_BEFORE_START"
    assert receipt.execution_status == "FINISHED" and receipt.operation_outcome == "CANCELLED"
    assert receipt.stop_evidence["kind"] == "never_started" and receipt.compute_stopped is True
    assert store.mark_dispatching(ISSUER, "c1", now) is None  # runner ห้าม dispatch
    _again, disposition_again = store.request_cancel(ISSUER, "c1", now)
    assert disposition_again == "ALREADY_FINISHED"


def test_sweep_expires_payloads_and_purges_tombstones_after_horizon(tmp_path):
    store = ReceiptStore(tmp_path / "r.sqlite3")
    old = utc_now() - timedelta(hours=30)
    _accept(store, "stale-payload", now=old)  # AVAILABLE ตั้งแต่ intake 30h ก่อน แม้ operation ค้าง
    _accept(store, "old-done", now=old)
    store.mark_dispatching(ISSUER, "old-done", old)
    store.mark_running(ISSUER, "old-done", old)
    store.finish(ISSUER, "old-done", outcome="SUCCEEDED", result={"text": "x"}, error=None, usage=None,
                 compute_stopped=True, stop_evidence={"kind": "engine_returned"}, safe_to_retry=None, now=old)
    _accept(store, "fresh", now=utc_now())

    report = store.sweep(utc_now(), payload_ttl=timedelta(hours=24), receipt_horizon=timedelta(hours=48))
    assert (ISSUER, "stale-payload") in report["expired_payloads"]
    assert store.get(ISSUER, "stale-payload").payload_state == "EXPIRED"
    assert store.get(ISSUER, "old-done").payload_state == "EXPIRED" and store.get(ISSUER, "old-done").result is None
    assert store.get(ISSUER, "fresh").payload_state == "AVAILABLE"
    assert report["purged_receipts"] == 0  # 30h < 48h horizon → tombstone ยังอยู่

    later = store.sweep(utc_now() + timedelta(hours=20), payload_ttl=timedelta(hours=24), receipt_horizon=timedelta(hours=48))
    assert later["purged_receipts"] == 1
    assert store.get(ISSUER, "old-done") is None


# ── API level ─────────────────────────────────────────────────

def test_duplicate_submissions_concurrently_yield_one_execution(worker_factory):
    worker = worker_factory("tts", engine_options={"work_seconds": 1.0})
    env = worker.envelope("dup-1")
    with ThreadPoolExecutor(max_workers=6) as pool:
        responses = list(pool.map(lambda _: worker.post_tts(env), range(6)))
    codes = sorted(r.status_code for r in responses)
    assert codes.count(202) == 1, codes
    assert all(code in {200, 202} for code in codes), codes
    assert {r.json()["attempt_id"] for r in responses} == {"dup-1"}
    final = worker.wait_terminal("dup-1")
    assert final["operation_outcome"] == "SUCCEEDED"
    assert worker.runtime.capacity.in_use == 0


def test_same_attempt_with_different_content_is_a_conflict(worker_factory):
    worker = worker_factory("tts")
    env = worker.envelope("conflict-1")
    assert worker.post_tts(env).status_code == 202
    changed = worker.envelope("conflict-1", input={"text": "ข้อความคนละอย่าง"})
    response = worker.post_tts(changed)
    assert response.status_code == 409
    body = response.json()["error"]
    assert body["code"] == "IDEMPOTENCY_CONFLICT" and body["safe_to_retry"] is False
    extended = worker.envelope("conflict-1", deadline_in=600)  # ยืด deadline ใต้ attempt เดิม = conflict ไม่ใช่ retry
    assert worker.post_tts(extended).status_code == 409


def test_duplicate_after_completion_returns_receipt_without_recompute(worker_factory):
    worker = worker_factory("tts")
    env = worker.envelope("dup-done")
    assert worker.post_tts(env).status_code == 202
    first = worker.wait_terminal("dup-done")
    again = worker.post_tts(env)
    assert again.status_code == 200
    assert again.json()["finished_at"] == first["finished_at"]
    assert again.json()["usage"] == first["usage"]


def test_in_flight_attempt_from_previous_process_is_unknown_after_restart(worker_factory, tmp_path):
    data_dir = tmp_path / "shared-worker-data"
    store = ReceiptStore(data_dir / "receipts.sqlite3")
    now = utc_now()
    store.accept(
        issuer=ISSUER, attempt_id="orphan", invocation_id="inv-orphan", kind="tts", payload_digest="a" * 64,
        profile_id="tts-stub-01", profile_revision="rev-test-1", runtime_id="speech-stub-tts", runtime_epoch="ep-previous-process",
        lease_id="lease", content_fence=None, start_before=now + timedelta(seconds=60), deadline_at=now + timedelta(seconds=120),
        payload_state="NONE", now=now,
    )
    store.mark_dispatching(ISSUER, "orphan", now)
    store.mark_running(ISSUER, "orphan", now)

    worker = worker_factory("tts", data_dir=data_dir)
    status = worker.status("orphan").json()
    assert status["execution_status"] == "UNKNOWN"
    assert status["compute_stopped"] is None and status["safe_to_retry"] is False
    assert status["runtime_epoch"] == "ep-previous-process"  # ไม่ map ข้าม epoch
    readiness = worker.client.get("/worker/v1/readiness", headers=auth()).json()
    assert readiness["last_reconcile"]["unknown"] == 1
    # dispatch ซ้ำด้วย attempt_id เดิม (digest ต่างเพราะ envelope จริง) → conflict ไม่ replay
    resubmit = worker.post_tts(worker.envelope("orphan"))
    assert resubmit.status_code == 409
    assert resubmit.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
