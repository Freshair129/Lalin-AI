"""อัปโหลดไฟล์ต้นฉบับ + ดาวน์โหลดผลลัพธ์"""
# @req FR-07 — จัดการไฟล์เข้า/ออก (upload/download/input/export)
from __future__ import annotations

import hashlib
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from ..config import get_settings
from ..utils.ids import short_id

router = APIRouter(prefix="/files", tags=["files"])


def _resolve_flat(root: Path, name: str) -> Path:
    """resolve ชื่อไฟล์ใต้ root แบบแบน (ห้ามมี subdirectory) — โยน HTTPException(400) ถ้า
    หลุด sandbox หรือมี path separator เลย (uploads/ ต้องแบนเสมอ — asset table และ /fs
    สมมติไว้แบบนั้นทั้งคู่)
    """
    root = root.resolve()
    if not name or "/" in name or "\\" in name or name in (".", ".."):
        raise HTTPException(400, "ชื่อไฟล์ไม่ถูกต้อง")
    dest = (root / name).resolve()
    if dest != root and root not in dest.parents:
        raise HTTPException(400, "ชื่อไฟล์ไม่ถูกต้อง")
    return dest


@router.post("/upload")
async def upload(file: UploadFile = File(...)):
    """อัปโหลดเสียง/วิดีโอต้นฉบับเข้า uploads/ คืนชื่อไฟล์ไว้อ้างอิงต่อ

    กัน path traversal: ชื่อไฟล์ที่มี path separator หรือ resolve แล้วหลุดจาก uploads_dir
    ถูกปฏิเสธ (400) แทนที่จะเขียนออกนอก sandbox แบบเงียบ ๆ

    กันการเขียนทับ: ไฟล์ชื่อเดียวกัน — เนื้อหาเหมือนกันถือว่า idempotent (คืนชื่อเดิม
    ไม่เขียนซ้ำ), เนื้อหาต่างกันได้ชื่อใหม่ที่ไม่ชนกัน — ไม่มีทางที่อัปโหลดจะทับไฟล์เดิม
    ที่โปรเจกต์อื่นอาจอ้างถึงอยู่ (เทียบ services/bundle.py:install_bundle ที่ใช้นโยบายเดียวกัน)
    """
    s = get_settings()
    dest = _resolve_flat(s.uploads_dir, file.filename or "upload")
    data = await file.read()

    if dest.exists():
        if hashlib.sha256(dest.read_bytes()).hexdigest() == hashlib.sha256(data).hexdigest():
            return {"filename": dest.name, "path": str(dest)}
        stem, suffix = Path(dest.name).stem, Path(dest.name).suffix
        dest = s.uploads_dir.resolve() / f"{stem}__{short_id()[:6]}{suffix}"

    dest.write_bytes(data)
    return {"filename": dest.name, "path": str(dest)}


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
    """แปลงชื่อไฟล์ใน uploads/ เป็น path เต็ม (ใช้ภายใน โดย dubbing/mastering/remix)

    กัน path traversal เหมือน upload() — เดิมฟังก์ชันนี้ resolve แล้ว exists() เฉย ๆ
    ไม่เคยเช็คว่าหลุด uploads_dir ไหมเลย ทำให้ source_audio/beat_audio ที่มาจากผู้ใช้
    เปิดไฟล์นอก sandbox ได้ถ้าไฟล์นั้นมีอยู่จริงตาม relative path ที่ระบุ
    """
    dest = _resolve_flat(get_settings().uploads_dir, name)
    if not dest.exists():
        raise HTTPException(404, f"ไม่พบไฟล์ใน uploads/: {name}")
    return str(dest)
