"""จัดการคลังเสียง: อัปโหลด/ดู/ลบ ตัวอย่างเสียงสำหรับโคลน"""
from __future__ import annotations

from io import BytesIO

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from ..services import voices

router = APIRouter(prefix="/voices", tags=["voices"])


class VoiceProfileUpdate(BaseModel):
    name: str | None = None
    ref_text: str | None = None
    language: str | None = None


def _as_wav_bytes(data: bytes, content_type: str | None) -> bytes:
    """Normalize browser recordings and uploads before storing as .wav."""
    try:
        from pydub import AudioSegment

        source = BytesIO(data)
        fmt = (content_type or "").split("/")[-1].split(";")[0] or None
        segment = AudioSegment.from_file(source, format=fmt)
        out = BytesIO()
        segment.export(out, format="wav")
        return out.getvalue()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(422, "อ่านไฟล์เสียงไม่ได้ กรุณาเลือกไฟล์เสียงที่รองรับ") from exc


@router.get("")
async def get_all():
    return {"voices": voices.list_voices()}


@router.post("")
async def upload(
    name: str = Form(...),
    ref_text: str = Form(""),
    language: str = Form("th"),
    consent: bool = Form(False),
    source: str = Form("upload"),
    file: UploadFile = File(...),
):
    """อัปโหลดตัวอย่างเสียง (แนะนำ wav 6-15 วินาที พูดชัด ไม่มี noise)."""
    data = _as_wav_bytes(await file.read(), file.content_type)
    if not consent:
        raise HTTPException(422, "ต้องยืนยันสิทธิ์ในการใช้เสียงก่อนสร้าง voice profile")
    meta = voices.save_voice(name, data, ref_text=ref_text, language=language, consent=consent, source=source)
    return meta


@router.patch("/{voice_id}")
async def update(voice_id: str, body: VoiceProfileUpdate):
    meta = voices.update_voice(voice_id, name=body.name, ref_text=body.ref_text, language=body.language)
    if not meta:
        raise HTTPException(404, "ไม่พบเสียง")
    return meta


@router.delete("/{voice_id}")
async def delete(voice_id: str):
    if not voices.delete_voice(voice_id):
        raise HTTPException(404, "ไม่พบเสียง")
    return {"deleted": voice_id}
