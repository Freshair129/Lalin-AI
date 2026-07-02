"""ดูสถานะงาน + ติดตามความคืบหน้าแบบเรียลไทม์ผ่าน WebSocket"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from ..jobs import jobs

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("")
async def list_jobs():
    return {"jobs": [j.as_dict() for j in jobs.list()]}


@router.get("/{job_id}")
async def get_job(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "ไม่พบงาน")
    return job.as_dict()


@router.websocket("/ws/{job_id}")
async def job_ws(ws: WebSocket, job_id: str):
    """สตรีมความคืบหน้าของงาน — ส่ง snapshot ปัจจุบันก่อน แล้วตามด้วยอัปเดต."""
    await ws.accept()
    job = jobs.get(job_id)
    if not job:
        await ws.send_json({"error": "ไม่พบงาน"})
        await ws.close()
        return

    await ws.send_json(job.as_dict())
    if job.status in ("done", "error"):
        await ws.close()
        return

    q = jobs.subscribe(job_id)
    try:
        while True:
            update = await q.get()
            await ws.send_json(update)
            if update["status"] in ("done", "error"):
                break
    except WebSocketDisconnect:
        pass
    finally:
        jobs.unsubscribe(job_id, q)
        await ws.close()
