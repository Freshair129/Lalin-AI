"""พากย์เสียง (dubbing) — รันไปป์ไลน์เต็มเป็น job พร้อมรายงานความคืบหน้า"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..jobs import jobs
from ..pipelines.dubbing import refine_line_for_duration, run_dubbing
from ..schemas import DubbingRequest
from ..services import voices
from .files import resolve_upload

router = APIRouter(prefix="/dubbing", tags=["dubbing"])


class RefineLineRequest(BaseModel):
    """คำขอ "เกลาบทให้พอดีเวลา" — ให้สมองเขียนประโยคใหม่ให้ยาวพูดพอดีช่องเวลา"""

    text: str
    target_sec: float = Field(gt=0, description="ความยาวช่องเวลาที่มีให้พูด (วินาที)")
    tone: str = Field(default="formal", pattern="^(formal|casual)$")


class RefineLineResponse(BaseModel):
    refined: str


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


@router.post("/refine", response_model=RefineLineResponse)
async def refine(req: RefineLineRequest):
    """เกลาบทพากย์บรรทัดเดียวให้ความยาวคำพูดพอดีกับช่องเวลา (ช่วยแก้ปัญหาแปลแล้วยาวเกิน)

    เรียกสมอง (cloud/ollama ตามที่ตั้งค่าไว้) — ถ้าสมองพัง/error จะคืนข้อความเดิมกลับไป
    (ไม่ throw ให้ endpoint นี้ล้มเหลว เพราะเป็นแค่ตัวช่วยเสริม)
    """
    refined = await refine_line_for_duration(
        req.text, target_sec=req.target_sec, tone=req.tone
    )
    return {"refined": refined}
