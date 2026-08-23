"""G-06 — durable job snapshots and restart semantics."""
from __future__ import annotations

import asyncio


def test_terminal_job_survives_manager_restart(tmp_path):
    from app.jobs.manager import JobManager

    path = tmp_path / "jobs.json"
    first = JobManager(path)
    job = first.create("render")

    async def task(_job, _report):
        return {"output": "render.wav"}

    asyncio.run(first.run(job, task))
    restored = JobManager(path).get(job.id)

    assert restored is not None
    assert restored.status == "done"
    assert restored.result == {"output": "render.wav"}


def test_non_terminal_job_becomes_interrupted_after_restart(tmp_path):
    from app.jobs.manager import JobManager

    path = tmp_path / "jobs.json"
    queued = JobManager(path).create("tts")

    restored = JobManager(path).get(queued.id)

    assert restored is not None
    assert restored.status == "interrupted"
    assert restored.message == "งานหยุดลงเพราะแอปถูกปิดหรือ backend เริ่มใหม่"


def test_corrupt_store_is_quarantined_without_blocking_startup(tmp_path):
    from app.jobs.manager import JobManager

    path = tmp_path / "jobs.json"
    path.write_text("{not-json", encoding="utf-8")

    assert JobManager(path).list() == []
    assert not path.exists()
    assert len(list(tmp_path.glob("jobs.corrupt-*.json"))) == 1


def test_interrupted_is_a_terminal_job_state():
    from app.jobs.manager import is_terminal_status

    assert is_terminal_status("interrupted") is True
