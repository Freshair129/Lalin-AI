"""File-system manager — browse/create/rename/move/delete ภายใน workspace dir"""
from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from ..config import get_settings

router = APIRouter(prefix="/fs", tags=["fs"])


def _root() -> Path:
    """คืน workspace root (สร้างถ้ายังไม่มี)."""
    r = get_settings().data_dir / "workspace"
    r.mkdir(parents=True, exist_ok=True)
    return r


def _resolve(rel: str) -> Path:
    """แปลง rel path เป็น absolute ที่อยู่ใน workspace เท่านั้น (กัน traversal)."""
    root = _root().resolve()
    # strip leading slashes แล้ว join — Path จะจัดการ .. ให้
    p = (root / rel.strip("/")).resolve()
    if p != root and root not in p.parents:
        raise HTTPException(400, "เส้นทางไม่ถูกต้อง")
    return p


def _entry(p: Path) -> dict:
    """สร้าง dict ข้อมูลไฟล์/โฟลเดอร์."""
    st = p.stat()
    is_dir = p.is_dir()
    return {
        "name": p.name,
        "type": "folder" if is_dir else "file",
        "size": 0 if is_dir else st.st_size,
        "modified": st.st_mtime,
        "ext": "" if is_dir else p.suffix.lower().lstrip("."),
    }


# ── List ────────────────────────────────────────────────────────────────────

@router.get("")
async def list_dir(path: str = ""):
    """ลิสต์ไฟล์/โฟลเดอร์ใน path (โฟลเดอร์ก่อน แล้วเรียงชื่อ)."""
    d = _resolve(path)
    if not d.exists() or not d.is_dir():
        raise HTTPException(404, "ไม่พบโฟลเดอร์")
    items = [_entry(c) for c in d.iterdir()]
    items.sort(key=lambda e: (e["type"] != "folder", e["name"].lower()))
    return {"path": path.strip("/"), "entries": items}


# ── Create folder ────────────────────────────────────────────────────────────

class NameBody(BaseModel):
    path: str = ""   # โฟลเดอร์ปลายทาง (สำหรับ folder) หรือ item path (สำหรับ rename)
    name: str


@router.post("/folder")
async def make_folder(body: NameBody):
    """สร้างโฟลเดอร์ใหม่."""
    d = _resolve(body.path) / body.name
    _resolve(str(Path(body.path) / body.name))  # safety re-check
    if d.exists():
        raise HTTPException(409, "มีอยู่แล้ว")
    d.mkdir(parents=True)
    return {"ok": True}


# ── Rename ───────────────────────────────────────────────────────────────────

class RenameBody(BaseModel):
    path: str    # item path (ไฟล์/โฟลเดอร์เดิม)
    name: str    # ชื่อใหม่ (basename)


@router.post("/rename")
async def rename(body: RenameBody):
    """เปลี่ยนชื่อไฟล์หรือโฟลเดอร์."""
    src = _resolve(body.path)
    if not src.exists():
        raise HTTPException(404, "ไม่พบ")
    dst = src.parent / body.name
    _resolve(str(Path(body.path).parent / body.name))  # safety re-check
    if dst.exists():
        raise HTTPException(409, "ชื่อซ้ำ")
    src.rename(dst)
    return {"ok": True}


# ── Move ─────────────────────────────────────────────────────────────────────

class MoveBody(BaseModel):
    src: str     # item path
    dst: str     # โฟลเดอร์ปลายทาง


@router.post("/move")
async def move(body: MoveBody):
    """ย้ายไฟล์/โฟลเดอร์ไปยังโฟลเดอร์ปลายทาง."""
    s = _resolve(body.src)
    dfolder = _resolve(body.dst)
    if not s.exists():
        raise HTTPException(404, "ไม่พบ")
    if not dfolder.is_dir():
        raise HTTPException(400, "ปลายทางไม่ใช่โฟลเดอร์")
    target = dfolder / s.name
    if target.exists():
        raise HTTPException(409, "ชื่อซ้ำที่ปลายทาง")
    shutil.move(str(s), str(target))
    return {"ok": True}


# ── Delete ───────────────────────────────────────────────────────────────────

@router.delete("")
async def delete(path: str):
    """ลบไฟล์หรือโฟลเดอร์ (ลบ root ไม่ได้)."""
    p = _resolve(path)
    if not p.exists():
        raise HTTPException(404, "ไม่พบ")
    if p == _root().resolve():
        raise HTTPException(400, "ลบ root ไม่ได้")
    if p.is_dir():
        shutil.rmtree(p)
    else:
        p.unlink()
    return {"ok": True}


# ── Upload ───────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload(path: str = Form(""), file: UploadFile = File(...)):
    """อัปโหลดไฟล์เข้าโฟลเดอร์ที่กำหนด."""
    d = _resolve(path)
    if not d.is_dir():
        raise HTTPException(400, "ปลายทางไม่ใช่โฟลเดอร์")
    dest = d / (file.filename or "file")
    _resolve(str(Path(path) / (file.filename or "file")))  # safety re-check
    dest.write_bytes(await file.read())
    return {"ok": True, "name": dest.name}
