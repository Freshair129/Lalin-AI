"""งานเบื้องหลัง (background jobs) + แจ้งความคืบหน้าผ่าน WebSocket

ไปป์ไลน์เสียงใช้เวลานาน (โหลดโมเดล/สังเคราะห์) จึงรันเป็น job แล้วให้ UI
subscribe ฟังความคืบหน้าแบบเรียลไทม์
"""
# @req FR-06 — job manager + progress ผ่าน WebSocket
from __future__ import annotations

import asyncio
import gc
import json
import logging
import os
import sys
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Awaitable, Callable

from ..utils.ids import short_id

logger = logging.getLogger(__name__)

TERMINAL_STATUSES = frozenset({"done", "error", "interrupted"})


def is_terminal_status(status: str) -> bool:
    return status in TERMINAL_STATUSES


def cleanup_gpu_memory() -> None:
    """Best-effort cleanup without cold-importing torch."""
    gc.collect()
    torch = sys.modules.get("torch")
    if torch is not None and torch.cuda.is_available():
        torch.cuda.empty_cache()


@dataclass
class Job:
    id: str
    kind: str
    status: str = "queued"  # queued | running | done | error | interrupted
    progress: float = 0.0
    message: str = ""
    result: dict | None = None
    error: str | None = None
    resource: str = "cpu"
    created_at: str = field(default_factory=lambda: _now())
    updated_at: str = field(default_factory=lambda: _now())

    def as_dict(self) -> dict:
        return asdict(self)


# callback signature: async fn(job, progress: float, message: str)
ProgressFn = Callable[["Job", float, str], Awaitable[None]]
# task signature: async fn(job, report: ProgressFn) -> dict
JobTask = Callable[["Job", ProgressFn], Awaitable[dict]]


class JobManager:
    def __init__(
        self,
        storage_path: Path | Callable[[], Path] | None = None,
        *,
        gpu_probe: Callable[[Job], bool] | None = None,
        gpu_poll_seconds: float = 5.0,
        gpu_cleanup: Callable[[], None] = cleanup_gpu_memory,
    ) -> None:
        self._jobs: dict[str, Job] = {}
        self._subs: dict[str, set[asyncio.Queue]] = {}
        self._storage_path = storage_path
        self._loaded_path: Path | None = None
        self._gpu_lock = asyncio.Lock()
        self._gpu_probe = gpu_probe
        self._gpu_poll_seconds = gpu_poll_seconds
        self._gpu_cleanup = gpu_cleanup

    def _path(self) -> Path | None:
        if self._storage_path is None:
            return None
        value = self._storage_path() if callable(self._storage_path) else self._storage_path
        return Path(value)

    def _ensure_loaded(self) -> None:
        path = self._path()
        if path is None or self._loaded_path == path:
            return
        self._jobs.clear()
        self._subs.clear()
        self._loaded_path = path
        if not path.exists():
            return
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            changed = False
            for raw in payload.get("jobs", []):
                job = Job(**raw)
                if job.status in {"queued", "running"}:
                    job.status = "interrupted"
                    job.message = "งานหยุดลงเพราะแอปถูกปิดหรือ backend เริ่มใหม่"
                    job.updated_at = _now()
                    changed = True
                self._jobs[job.id] = job
        except (AttributeError, json.JSONDecodeError, OSError, TypeError, ValueError) as exc:
            quarantine = path.with_name(
                f"jobs.corrupt-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}.json"
            )
            os.replace(path, quarantine)
            logger.warning("Quarantined unreadable job store %s: %s", quarantine, exc)
            return
        if changed:
            self._persist()

    def _persist(self) -> None:
        path = self._path()
        if path is None:
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "schema_version": 1,
            "jobs": [job.as_dict() for job in self._jobs.values()],
        }
        temp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
        temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(temp, path)

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
        job.updated_at = _now()
        self._persist()
        await self._broadcast(job)

    # ── lifecycle ───────────────────────────────────────────
    def get(self, job_id: str) -> Job | None:
        self._ensure_loaded()
        return self._jobs.get(job_id)

    def list(self) -> list[Job]:
        self._ensure_loaded()
        return list(self._jobs.values())

    def create(self, kind: str, *, resource: str = "cpu") -> Job:
        self._ensure_loaded()
        job = Job(id=short_id(), kind=kind, resource=resource)
        self._jobs[job.id] = job
        self._persist()
        return job

    async def run(self, job: Job, task: JobTask) -> None:
        """รัน task ใน background; อัปเดตสถานะ/กระจายให้ subscriber."""
        if job.resource == "gpu":
            job.status = "queued"
            job.message = "รอคิว GPU"
            job.updated_at = _now()
            self._persist()
            await self._broadcast(job)
            async with self._gpu_lock:
                while self._gpu_probe is not None and not self._gpu_probe(job):
                    job.message = "รอ GPU: VRAM ว่างยังไม่พอ"
                    job.updated_at = _now()
                    self._persist()
                    await self._broadcast(job)
                    await asyncio.sleep(self._gpu_poll_seconds)
                try:
                    await self._execute(job, task)
                finally:
                    try:
                        self._gpu_cleanup()
                    except (AttributeError, RuntimeError) as exc:
                        logger.warning("GPU cleanup failed after job %s: %s", job.id, exc)
            return
        await self._execute(job, task)

    async def _execute(self, job: Job, task: JobTask) -> None:
        job.status = "running"
        job.updated_at = _now()
        self._persist()
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
        job.updated_at = _now()
        self._persist()
        await self._broadcast(job)

    def spawn(self, kind: str, task: JobTask, *, resource: str = "cpu") -> Job:
        """สร้าง job แล้วยิงให้รันแบบ fire-and-forget."""
        job = self.create(kind, resource=resource)
        asyncio.create_task(self.run(job, task))
        return job


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _default_jobs_path() -> Path:
    from ..config import get_settings

    return get_settings().data_dir / "jobs.json"


from .resources import configured_gpu_probe


jobs = JobManager(_default_jobs_path, gpu_probe=configured_gpu_probe)
