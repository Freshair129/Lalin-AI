"""งานเบื้องหลัง (background jobs) + แจ้งความคืบหน้าผ่าน WebSocket

ไปป์ไลน์เสียงใช้เวลานาน (โหลดโมเดล/สังเคราะห์) จึงรันเป็น job แล้วให้ UI
subscribe ฟังความคืบหน้าแบบเรียลไทม์
"""
from __future__ import annotations

import asyncio
import uuid
from dataclasses import asdict, dataclass, field
from typing import Awaitable, Callable

from ..utils.ids import short_id


@dataclass
class Job:
    id: str
    kind: str
    status: str = "queued"  # queued | running | done | error
    progress: float = 0.0
    message: str = ""
    result: dict | None = None
    error: str | None = None

    def as_dict(self) -> dict:
        return asdict(self)


# callback signature: async fn(job, progress: float, message: str)
ProgressFn = Callable[["Job", float, str], Awaitable[None]]
# task signature: async fn(job, report: ProgressFn) -> dict
JobTask = Callable[["Job", ProgressFn], Awaitable[dict]]


class JobManager:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._subs: dict[str, set[asyncio.Queue]] = {}

    # ── subscription (WebSocket) ────────────────────────────
    def subscribe(self, job_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self._subs.setdefault(job_id, set()).add(q)
        return q

    def unsubscribe(self, job_id: str, q: asyncio.Queue) -> None:
        if job_id in self._subs:
            self._subs[job_id].discard(q)

    async def _broadcast(self, job: Job) -> None:
        for q in self._subs.get(job.id, set()):
            await q.put(job.as_dict())

    async def _report(self, job: Job, progress: float, message: str) -> None:
        job.progress = round(progress, 3)
        job.message = message
        job.status = "running"
        await self._broadcast(job)

    # ── lifecycle ───────────────────────────────────────────
    def get(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def list(self) -> list[Job]:
        return list(self._jobs.values())

    def create(self, kind: str) -> Job:
        job = Job(id=short_id(), kind=kind)
        self._jobs[job.id] = job
        return job

    async def run(self, job: Job, task: JobTask) -> None:
        """รัน task ใน background; อัปเดตสถานะ/กระจายให้ subscriber."""
        job.status = "running"
        await self._broadcast(job)
        try:
            result = await task(job, self._report)
            job.result = result
            job.progress = 1.0
            job.status = "done"
            job.message = "เสร็จสมบูรณ์"
        except Exception as e:  # noqa: BLE001
            job.status = "error"
            job.error = str(e)
            job.message = f"ผิดพลาด: {e}"
        await self._broadcast(job)

    def spawn(self, kind: str, task: JobTask) -> Job:
        """สร้าง job แล้วยิงให้รันแบบ fire-and-forget."""
        job = self.create(kind)
        asyncio.create_task(self.run(job, task))
        return job


jobs = JobManager()
