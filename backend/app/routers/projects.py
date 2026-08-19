"""บันทึก/โหลดโปรเจกต์ (workspace) — แชร์ข้ามเครื่องที่ต่อ backend เดียวกันได้
หรือย้ายข้ามเครื่องด้วยไฟล์ .gmp (bundle: project + media) ก็ได้
"""
# @req FR-10 — projects: บันทึก/โหลด workspace + .gmp bundle export/import
from __future__ import annotations

import json
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..config import get_settings
from ..services import bundle
from ..utils.ids import short_id

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectIn(BaseModel):
    name: str = "audio-01"
    data: dict  # state ของ project (clip engine, params, ฯลฯ)


def _dir() -> Path:
    """คืน path โฟลเดอร์เก็บโปรเจกต์ (สร้างอัตโนมัติถ้ายังไม่มี)."""
    d = get_settings().data_dir / "projects"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _safe_pid(pid: str) -> None:
    """ตรวจ pid ไม่ให้มี path traversal — raise 404 ถ้าไม่ผ่าน."""
    if "/" in pid or ".." in pid or "\\" in pid:
        raise HTTPException(404, "ไม่พบโปรเจกต์")


@router.get("")
async def list_projects():
    """รายการโปรเจกต์ที่บันทึกไว้ (id, name)."""
    out = []
    for f in sorted(_dir().glob("*.json")):
        try:
            j = json.loads(f.read_text(encoding="utf-8"))
            out.append({"id": f.stem, "name": j.get("name", f.stem)})
        except Exception:
            continue
    return {"projects": out}


@router.post("")
async def save_project(body: ProjectIn):
    """บันทึกโปรเจกต์ → คืน id (ใช้แชร์/โหลดข้ามเครื่องที่ต่อ backend เดียวกัน)."""
    pid = short_id()
    payload = {"id": pid, "name": body.name, "data": body.data}
    (_dir() / f"{pid}.json").write_text(
        json.dumps(payload, ensure_ascii=False), encoding="utf-8"
    )
    return {"id": pid, "name": body.name}


@router.get("/{pid}")
async def get_project(pid: str):
    """โหลดโปรเจกต์ตาม id."""
    _safe_pid(pid)
    f = _dir() / f"{pid}.json"
    if not f.exists():
        raise HTTPException(404, "ไม่พบโปรเจกต์")
    return json.loads(f.read_text(encoding="utf-8"))


@router.put("/{pid}")
async def update_project(pid: str, body: ProjectIn):
    """บันทึกทับโปรเจกต์เดิม (Save) — คงไว้ id เดิม."""
    _safe_pid(pid)
    f = _dir() / f"{pid}.json"
    if not f.exists():
        raise HTTPException(404, "ไม่พบโปรเจกต์")
    payload = {"id": pid, "name": body.name, "data": body.data}
    f.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return {"id": pid, "name": body.name}


@router.delete("/{pid}")
async def delete_project(pid: str):
    """ลบโปรเจกต์."""
    _safe_pid(pid)
    f = _dir() / f"{pid}.json"
    if f.exists():
        f.unlink()
    return {"deleted": pid}


@router.get("/{pid}/bundle")
async def export_bundle(pid: str):
    """ส่งออกโปรเจกต์เป็นไฟล์ .gmp (zip: project.json + manifest.json + media/) — ย้ายข้ามเครื่องได้."""
    _safe_pid(pid)
    f = _dir() / f"{pid}.json"
    if not f.exists():
        raise HTTPException(404, "ไม่พบโปรเจกต์")
    project = json.loads(f.read_text(encoding="utf-8"))

    tmp = Path(tempfile.mkdtemp()) / f"{pid}.gmp"
    bundle.write_bundle(project, tmp)
    safe_name = "".join(c for c in project.get("name", pid) if c not in '\\/:*?"<>|') or pid
    return FileResponse(tmp, media_type="application/zip", filename=f"{safe_name}.gmp")
