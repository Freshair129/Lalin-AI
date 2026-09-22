# @req FR-19.3 (candidate, CR-005) — engine ต้องเรียก CTranslate2 จาก thread เดียวตลอดอายุ (กัน per-thread leak)
"""ที่มา (2026-09-22): soak 1,700 request ผ่าน worker จริง → engine private memory โตเส้นตรง +0.135 MiB/request ไม่นิ่งลง
ทดสอบแยก: เรียก transcribe บน thread เดิม +0.006 MiB/call · สร้าง thread ใหม่ทุก call +0.122 MiB/call และไม่ถูกคืน
สาเหตุคือ ``_execute`` สร้าง thread ใหม่ทุก job — แก้เป็น ``_JobRunner`` thread เดียวที่อยู่ตลอดอายุ engine

เทสต์นี้ขับ ``_execute`` ตัวจริงผ่าน pipe จริง ด้วย engine ปลอมที่บันทึกว่าแต่ละ call วิ่งบน thread ไหน
ไม่ต้องมี speech stack จึงรันได้ใน venv หลัก
"""
from __future__ import annotations

import multiprocessing
import threading
import time

from app.voice_worker.engine_faster_whisper import _execute, _JobRunner

OPTS = {"heartbeat_seconds": 0.05}


class _RecordingEngine:
    def __init__(self) -> None:
        self.threads: list[int] = []

    def warmup(self) -> None:
        self.threads.append(threading.get_ident())

    def transcribe(self, payload, cancel, deadline):
        self.threads.append(threading.get_ident())
        time.sleep(0.02)
        return {"outcome": "SUCCEEDED", "audio_seconds": 1.0,
                "result": {"kind": "asr", "engine": "fake", "text": "ok", "language": "th",
                           "duration_seconds": 1.0, "segments": [], "provenance": "measured"}}

    def residency(self, *, busy: bool = False) -> dict:
        return {"engine": "fake", "warm": True}


def _job(i: int) -> dict:
    return {"op": "execute", "request_id": f"r{i}", "kind": "asr", "budget_seconds": 30, "input": {"language": "th"}}


def _drain_result(conn) -> dict:
    while True:
        message = conn.recv()
        if message.get("op") == "result":
            return message


def test_warmup_and_every_job_run_on_one_long_lived_thread():
    parent, child = multiprocessing.Pipe(duplex=True)
    engine, runner = _RecordingEngine(), _JobRunner()
    try:
        done, _ = runner.submit(engine.warmup)
        assert done.wait(5)
        threads_before = threading.active_count()
        for i in range(8):
            assert _execute(child, engine, _job(i), OPTS, runner) is True
            assert _drain_result(parent)["outcome"] == "SUCCEEDED"
        assert len(set(engine.threads)) == 1, f"CTranslate2 was called from {len(set(engine.threads))} threads"
        assert engine.threads[0] == runner.ident and runner.ident != threading.get_ident()
        assert threading.active_count() == threads_before, "threads accumulated across jobs"
    finally:
        runner.stop()
        parent.close()
        child.close()


def test_exception_in_a_job_does_not_kill_the_runner():
    """เดิม exception ถูกจับใน thread ต่อ job — ตอนนี้ runner ต้องส่งกลับแล้วรับงานต่อได้"""
    parent, child = multiprocessing.Pipe(duplex=True)
    runner = _JobRunner()

    class _Flaky(_RecordingEngine):
        def transcribe(self, payload, cancel, deadline):
            self.threads.append(threading.get_ident())
            if len(self.threads) == 1:
                raise MemoryError("bad allocation")
            return super().transcribe(payload, cancel, deadline)

    engine = _Flaky()
    try:
        _execute(child, engine, _job(0), OPTS, runner)
        first = _drain_result(parent)
        assert first["outcome"] == "FAILED" and first["error"]["code"] == "RUNTIME_OOM"
        _execute(child, engine, _job(1), OPTS, runner)
        assert _drain_result(parent)["outcome"] == "SUCCEEDED"
        assert len(set(engine.threads)) == 1
    finally:
        runner.stop()
        parent.close()
        child.close()
