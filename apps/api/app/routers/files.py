"""อัปโหลดไฟล์ต้นฉบับ + ดาวน์โหลดผลลัพธ์"""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from ..config import get_settings

router = APIRouter(prefix="/files", tags=["files"])


@router.post("/upload")
async def upload(file: UploadFile = File(...)):
    """อัปโหลดเสียง/วิดีโอต้นฉบับเข้า uploads/ คืนชื่อไฟล์ไว้อ้างอิงต่อ."""
    s = get_settings()
    dest = s.uploads_dir / file.filename
    dest.write_bytes(await file.read())
    return {"filename": file.filename, "path": str(dest)}


@router.get("/download/{name}")
async def download(name: str):
    """ดาวน์โหลดไฟล์ผลลัพธ์จาก outputs/ (รองรับ subfolder ผ่าน name)."""
    s = get_settings()
    p = (s.outputs_dir / name).resolve()
    if not str(p).startswith(str(s.outputs_dir.resolve())) or not p.exists():
        raise HTTPException(404, "ไม่พบไฟล์")
    return FileResponse(p)


@router.get("/input/{name}")
async def input_file(name: str):
    """เสิร์ฟไฟล์ต้นฉบับจาก uploads/ (เช่นให้ frontend วาด waveform)."""
    s = get_settings()
    p = (s.uploads_dir / name).resolve()
    if not str(p).startswith(str(s.uploads_dir.resolve())) or not p.exists():
        raise HTTPException(404, "ไม่พบไฟล์")
    return FileResponse(p)


@router.get("/export/{name}")
async def export_file(name: str, fmt: str = "wav"):
    """ส่งออกไฟล์ผลลัพธ์จาก outputs/ — fmt=wav (ตรงๆ) หรือ mp3 (แปลงด้วย ffmpeg ฝังในตัว)."""
    s = get_settings()
    src = (s.outputs_dir / name).resolve()
    if not str(src).startswith(str(s.outputs_dir.resolve())) or not src.exists():
        raise HTTPException(404, "ไม่พบไฟล์")
    if fmt == "mp3":
        import subprocess
        import imageio_ffmpeg
        ff = imageio_ffmpeg.get_ffmpeg_exe()
        out = src.with_suffix(".mp3")
        subprocess.run([ff, "-y", "-i", str(src), "-b:a", "320k", str(out)],
                       capture_output=True, check=True)
        return FileResponse(out, filename=out.name)
    return FileResponse(src, filename=src.name)


def resolve_upload(name: str) -> str:
    """แปลงชื่อไฟล์ใน uploads/ เป็น path เต็ม (ใช้ภายใน)."""
    p = (get_settings().uploads_dir / name).resolve()
    if not p.exists():
        raise HTTPException(404, f"ไม่พบไฟล์ใน uploads/: {name}")
    return str(p)
