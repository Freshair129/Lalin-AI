"""Packs — แคตตาล็อก sample pack + สถานะติดตั้ง (mock in-memory)"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/packs", tags=["packs"])

# แคตตาล็อก sample pack (mock — ภายหลังต่อ store จริงได้)
_CATALOG = [
    {"id": "beats69",    "name": "Beats 69",    "author": "Chairman Maf",  "size_mb": 24.0, "color": "#7b8a3a", "desc": "เพลงบีตหลากสไตล์สำหรับงาน remix"},
    {"id": "towntown",   "name": "Town Town",   "author": "Chairman Maf",  "size_mb": 13.2, "color": "#5a6470", "desc": "Samples were developed by Chairman Maf. Album contains a variety of sounds in a diverse style."},
    {"id": "bitchybos",  "name": "Bitchy Bos",  "author": "Chairman Maf",  "size_mb": 18.5, "color": "#8a9ca0", "desc": "เสียงแอมเบียนต์และเท็กซ์เจอร์"},
    {"id": "blackbro",   "name": "BlackBro",    "author": "Night Studio",  "size_mb": 31.0, "color": "#c9a08a", "desc": "ชุดเสียงเข้มๆ สำหรับ hip-hop"},
    {"id": "nightcall",  "name": "NightCall",   "author": "Night Studio",  "size_mb": 22.7, "color": "#d08a9a", "desc": "synthwave & retro pads"},
    {"id": "resistance", "name": "Resistance",  "author": "Night Studio",  "size_mb": 40.1, "color": "#e0c040", "desc": "เสียงพลังงานสูง เหมาะกับ EDM"},
]

# ชุด id ของ pack ที่ถูก "ติดตั้ง" แล้ว (reset เมื่อรีสตาร์ต server)
_installed: set[str] = set()


@router.get("")
async def list_packs():
    """รายการ pack ทั้งหมด + สถานะติดตั้ง."""
    return {"packs": [{**p, "installed": p["id"] in _installed} for p in _CATALOG]}


@router.get("/{pack_id}")
async def get_pack(pack_id: str):
    """ดึงข้อมูล pack รายชิ้น."""
    p = next((x for x in _CATALOG if x["id"] == pack_id), None)
    if not p:
        raise HTTPException(404, "ไม่พบ pack")
    return {**p, "installed": pack_id in _installed}


@router.post("/{pack_id}/download")
async def download_pack(pack_id: str):
    """จำลองการติดตั้ง pack (mark installed)."""
    p = next((x for x in _CATALOG if x["id"] == pack_id), None)
    if not p:
        raise HTTPException(404, "ไม่พบ pack")
    _installed.add(pack_id)
    return {"installed": True, "id": pack_id}
