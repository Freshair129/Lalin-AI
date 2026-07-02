"""พากย์เสียง (dubbing) — รันไปป์ไลน์เต็มเป็น job พร้อมรายงานความคืบหน้า"""
from __future__ import annotations

from fastapi import APIRouter

from ..jobs import jobs
from ..pipelines.dubbing import run_dubbing
from ..schemas import DubbingRequest
from ..services import voices
from .files import resolve_upload

router = APIRouter(prefix="/dubbing", tags=["dubbing"])


@router.post("")
async def dub(req: DubbingRequest):
    source = resolve_upload(req.source_audio)
    ref_audio, ref_text = voices.resolve_ref(req.voice_id)
    tts_lang = "th" if req.target_lang in ("ไทย", "th", "Thai") else "en"

    async def task(job, report):
        return await run_dubbing(
            source_audio=source,
            voice_ref=ref_audio,
            voice_ref_text=ref_text,
            target_lang=req.target_lang,
            translate=req.translate,
            source_lang=req.source_lang,
            tts_language=tts_lang,
            report=lambda p, m: report(job, p, m),
        )

    job = jobs.spawn("dubbing", task)
    return {"job_id": job.id}
