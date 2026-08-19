"""Speech runtime configuration that does not load ASR/TTS models by itself."""
# @req FR-03 — โปรไฟล์ ASR ของสายพากย์ (ตั้งค่าอย่างเดียว ไม่โหลดโมเดลเอง)
from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

from ..config import get_settings
from ..pipelines import asr

router = APIRouter(prefix="/speech", tags=["speech"])

ASR_PROFILES = {
    "base": {"label": "Base", "note": "fastest, lower accuracy"},
    "small": {"label": "Small", "note": "balanced for lighter machines"},
    "medium": {"label": "Medium", "note": "higher accuracy, more VRAM"},
    "large-v3": {"label": "Large-v3", "note": "current quality default"},
    "turbo": {"label": "Turbo", "note": "fast high-quality profile"},
}


class ASRProfileRequest(BaseModel):
    model: str


@router.get("/config")
async def get_config(request: Request):
    settings = get_settings()
    return {
        "asr_model": settings.asr_model,
        "asr_device": settings.asr_device,
        "asr_compute_type": settings.asr_compute_type,
        "profiles": [{"id": key, **value} for key, value in ASR_PROFILES.items()],
        "asr_available": request.app.state.backend_profile == "full",
        "tts_available": request.app.state.backend_profile == "full",
    }


@router.post("/config")
async def set_config(request: Request, body: ASRProfileRequest):
    if body.model not in ASR_PROFILES:
        return {"ok": False, "error": "unsupported_asr_model"}
    if request.app.state.backend_profile != "full":
        return {"ok": False, "error": "asr_unavailable_in_lite"}
    asr.set_model(body.model)
    return {"ok": True, "asr_model": body.model}
