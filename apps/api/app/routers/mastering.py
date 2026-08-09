"""Mastering — ปรับ/มาสเตอร์เสียงเพลง (รันเป็น job)"""
# @req FR-04 — mastering (reference mode / auto LUFS)
from __future__ import annotations

import asyncio

from fastapi import APIRouter

from ..jobs import jobs
from ..pipelines.mastering import run_mastering
from ..schemas import MasteringRequest
from .files import resolve_upload

router = APIRouter(prefix="/mastering", tags=["mastering"])


@router.post("")
async def master(req: MasteringRequest):
    source = resolve_upload(req.source_audio)
    reference = resolve_upload(req.reference_audio) if req.reference_audio else None

    async def task(job, report):
        await report(job, 0.3, "กำลังมาสเตอร์เสียง…")
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: run_mastering(
                source_audio=source,
                reference_audio=reference,
                target_lufs=req.target_lufs,
                target_format=req.target_format,
            ),
        )
        return result

    job = jobs.spawn("mastering", task)
    return {"job_id": job.id}
