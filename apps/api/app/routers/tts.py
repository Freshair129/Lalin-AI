"""สังเคราะห์เสียงจากข้อความด้วยเสียงที่โคลน (รันเป็น job)"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter

from ..config import get_settings
from ..jobs import jobs
from ..pipelines import tts
from ..schemas import TTSRequest
from ..services import voices
from ..utils.ids import short_id

router = APIRouter(prefix="/tts", tags=["tts"])


@router.post("")
async def synthesize(req: TTSRequest):
    ref_audio, ref_text = voices.resolve_ref(req.voice_id)
    out_path = str(get_settings().outputs_dir / f"tts_{short_id()}.wav")

    async def task(job, report):
        await report(job, 0.2, "กำลังโหลดโมเดล + สังเคราะห์…")
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: tts.synthesize(
                req.text, out_path, ref_audio=ref_audio, ref_text=ref_text,
                language=req.language, speed=req.speed,
            ),
        )
        return {"output": out_path}

    job = jobs.spawn("tts", task)
    return {"job_id": job.id}
