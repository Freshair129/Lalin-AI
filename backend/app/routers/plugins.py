# @req FR-11 — plugin manager
# @spec AI-ETH-003 BR-002 — dep GPL เป็น optional เสมอ ห้าม bundle ใน core ที่ขาย
"""Plugins — สถานะ dep เสริม (optional/GPL, BYOM: Bring-Your-Own-Model/plugin)

เช็คว่า pedalboard/psola/matchering ติดตั้งอยู่ไหม (ด้วยการ import ลองดู) เพื่อให้
frontend โชว์สถานะ + ปลดล็อกฟีเจอร์ที่เกี่ยวข้องได้ถูกต้อง โดยไม่ทำให้แอปพัง
ถ้ายังไม่ได้ติดตั้ง (deps เหล่านี้เป็น optional เสมอ — ดู docs/ROADMAP_MUSIC.md)
"""
from __future__ import annotations

import importlib.util

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/plugins", tags=["plugins"])

# ข้อมูล plugin ที่รู้จัก: ชื่อ import module, label ไทย, ฟีเจอร์ที่ปลดล็อก, pip package
_PLUGINS: dict[str, dict[str, str]] = {
    "pedalboard": {
        "module": "pedalboard",
        "package": "pedalboard",
        "label": "เอฟเฟกต์เสียง (Vocal FX + Limiter)",
        "unlocks": "เอฟเฟกต์เสียงร้อง (EQ/compressor/reverb/delay) และ brickwall limiter คุณภาพสูงตอนมาสเตอร์",
        "license": "GPLv3",
    },
    "psola": {
        "module": "psola",
        "package": "psola",
        "label": "ปรับเสียงเข้าคีย์ (Auto-tune)",
        "unlocks": "ปรับพิตช์เสียงร้องให้เข้าคีย์ของ beat อัตโนมัติ",
        "license": "MIT→parselmouth GPL",
    },
    "matchering": {
        "module": "matchering",
        "package": "matchering",
        "label": "มาสเตอร์แบบอ้างอิงเพลง (Reference Mastering)",
        "unlocks": "ทำให้เพลงฟังดูเหมือนเพลงอ้างอิงที่เลือก (EQ/ความดัง/dynamics)",
        "license": "GPLv3",
    },
}


def _is_available(module_name: str) -> bool:
    try:
        return importlib.util.find_spec(module_name) is not None
    except (ImportError, ValueError):
        return False


@router.get("")
async def list_plugins():
    """คืนสถานะว่าแต่ละ optional dep ติดตั้งอยู่ไหม + ฟีเจอร์ที่ปลดล็อก."""
    return {
        name: {
            "available": _is_available(info["module"]),
            "label": info["label"],
            "unlocks": info["unlocks"],
            "license": info["license"],
        }
        for name, info in _PLUGINS.items()
    }


@router.post("/{name}/install")
async def install_plugin(name: str):
    """คืนคำสั่งติดตั้ง plugin (ยังไม่รัน pip จริง — เป็นขั้นถัดไป)."""
    info = _PLUGINS.get(name)
    if info is None:
        raise HTTPException(404, f"ไม่รู้จัก plugin '{name}'")

    return {
        "name": name,
        "command": f"uv pip install {info['package']}",
        "note": (
            "คำสั่งนี้ต้องรันเองใน terminal (venv ของ backend) — "
            "ระบบยังไม่ได้ต่อการติดตั้งอัตโนมัติ (เป็นขั้นถัดไป) "
            f"license: {info['license']} — ดู docs/ROADMAP_MUSIC.md ก่อนใช้เชิงพาณิชย์"
        ),
    }
