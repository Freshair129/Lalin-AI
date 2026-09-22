# @req FR-19 (candidate, CR-005) — D13: engine ที่ถูก OOM killer ฆ่าต้องรายงานเป็น RUNTIME_OOM (ยืนยันจาก cgroup ไม่เดา)
"""ที่มา (2026-09-22, container Linux ใต้เพดาน memory):
- ``--memory 2100m``: บูตผ่าน แต่คลิป 60 s ทำให้ engine ถูก kernel kill (exitcode −9) ทุก request →
  worker รายงาน ``RUNTIME_FAILED`` ทั้งที่สัญญามี ``RUNTIME_OOM`` · PRP ต้องแยกได้ว่าต้องขยายเพดาน (OOM) หรือไล่หาบั๊ก (crash)
- ``--memory 1500m``: engine ตายระหว่างโหลดโมเดล แต่ข้อความบอกว่า "did not report hello within the configured timeout"

ยืนยัน OOM จากตัวนับ ``oom_kill`` ใน ``/sys/fs/cgroup/memory.events`` — exitcode −9 อย่างเดียวไม่พอ (SIGKILL มาจากที่อื่นได้)
"""
from __future__ import annotations

import time

import pytest

from app.voice_worker import supervisor as supervisor_module
from app.voice_worker.supervisor import cgroup_oom_kills, oom_killed_since


def _events(tmp_path, oom_kill: int):
    path = tmp_path / "memory.events"
    path.write_text(f"low 0\nhigh 0\nmax 12\noom 3\noom_kill {oom_kill}\noom_group_kill 0\n")
    return path


def test_reads_the_oom_kill_counter(tmp_path):
    assert cgroup_oom_kills(_events(tmp_path, 7)) == 7


def test_missing_cgroup_file_means_unknown_not_zero(tmp_path):
    assert cgroup_oom_kills(tmp_path / "absent") is None


@pytest.mark.parametrize("baseline, now, expected", [(2, 3, True), (2, 2, False), (None, 3, None)])
def test_oom_verdict_needs_both_readings(tmp_path, baseline, now, expected):
    assert oom_killed_since(baseline, _events(tmp_path, now)) is expected


def test_verdict_is_unknown_when_the_file_disappears(tmp_path):
    assert oom_killed_since(4, tmp_path / "absent") is None


def _kill_engine_mid_job(worker, attempt: str) -> dict:
    env = worker.envelope(attempt)
    assert worker.post_asr(env).status_code == 202
    deadline = time.time() + 10
    while time.time() < deadline and worker.status(attempt).json()["execution_status"] != "RUNNING":
        time.sleep(0.05)
    assert worker.status(attempt).json()["execution_status"] == "RUNNING"
    worker.runtime.supervisor._proc.kill()  # ภายนอกฆ่า engine (เหมือน OOM killer) — ไม่ใช่การหยุดโดยเจตนาของ supervisor
    return worker.wait_terminal(attempt, timeout=30)


def test_engine_killed_with_cgroup_confirmation_is_runtime_oom(worker_factory, monkeypatch):
    monkeypatch.setattr(supervisor_module, "oom_killed_since", lambda *_a, **_k: True)
    worker = worker_factory("asr", engine_options={"work_seconds": 5.0})
    final = _kill_engine_mid_job(worker, "oom-confirmed")
    assert final["operation_outcome"] == "FAILED"
    assert final["error"]["code"] == "RUNTIME_OOM"
    assert final["stop_evidence"]["kind"] == "process_exit" and final["stop_evidence"]["oom_killed"] is True


def test_engine_killed_without_confirmation_stays_runtime_failed(worker_factory, monkeypatch):
    """ไม่มี cgroup (เช่น Windows) → ไม่รู้ → คงเป็น RUNTIME_FAILED ไม่เดาว่าเป็น OOM"""
    monkeypatch.setattr(supervisor_module, "oom_killed_since", lambda *_a, **_k: None)
    worker = worker_factory("asr", engine_options={"work_seconds": 5.0})
    final = _kill_engine_mid_job(worker, "oom-unknown")
    assert final["error"]["code"] == "RUNTIME_FAILED"
    assert final["stop_evidence"]["oom_killed"] is None


def test_memory_limit_hits_are_detected_even_without_a_kill(tmp_path):
    """ใต้เพดานที่ไม่มี swap engine thrash ได้โดยไม่ถูกฆ่า — ตัวนับ ``max`` คือหลักฐานว่าชนเพดาน"""
    from app.voice_worker.supervisor import cgroup_memory_events, memory_limit_hit_since

    before = cgroup_memory_events(_events(tmp_path, 0))
    path = tmp_path / "memory.events"
    path.write_text("low 0\nhigh 0\nmax 90\noom 3\noom_kill 0\n")
    assert memory_limit_hit_since(before, path) is True
    assert memory_limit_hit_since(None, path) is None
