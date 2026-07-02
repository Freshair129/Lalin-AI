"""จัดการคลังเสียง: อัปโหลด/ดู/ลบ ตัวอย่างเสียงสำหรับโคลน"""
from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ..services import voices

router = APIRouter(prefix="/voices", tags=["voices"])


@router.get("")
async def get_all():
    return {"voices": voices.list_voices()}


@router.post("")
async def upload(
    name: str = Form(...),
    ref_text: str = Form(""),
    language: str = Form("th"),
    file: UploadFile = File(...),
):
    """อัปโหลดตัวอย่างเสียง (แนะนำ wav 6-15 วินาที พูดชัด ไม่มี noise)."""
    data = await file.read()
    meta = voices.save_voice(name, data, ref_text=ref_text, language=language)
    return meta


@router.delete("/{voice_id}")
async def delete(voice_id: str):
    if not voices.delete_voice(voice_id):
        raise HTTPException(404, "ไม่พบเสียง")
    return {"deleted": voice_id}
