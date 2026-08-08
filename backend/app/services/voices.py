"""คลังเสียง (Voice Library) — จัดเก็บตัวอย่างเสียงสำหรับโคลน

แต่ละเสียงเก็บเป็น:
  voices/<id>.wav   ตัวอย่างเสียง (reference)
  voices/<id>.json  เมตาดาตา {name, ref_text, language, created}
"""
# @req FR-01 — จัดเก็บคลังเสียง <id>.wav + <id>.json (FR-01.4/01.5)
from __future__ import annotations

import json
from pathlib import Path

from ..config import get_settings
from ..utils.ids import short_id


def _meta_path(voice_id: str) -> Path:
    return get_settings().voices_dir / f"{voice_id}.json"


def _wav_path(voice_id: str) -> Path:
    return get_settings().voices_dir / f"{voice_id}.wav"


def save_voice(name: str, wav_bytes: bytes, ref_text: str = "", language: str = "th") -> dict:
    vid = short_id()
    _wav_path(vid).write_bytes(wav_bytes)
    meta = {
        "id": vid,
        "name": name,
        "ref_text": ref_text,
        "language": language,
        "wav": str(_wav_path(vid)),
    }
    _meta_path(vid).write_text(json.dumps(meta, ensure_ascii=False, indent=2), "utf-8")
    return meta


def get_voice(voice_id: str) -> dict | None:
    p = _meta_path(voice_id)
    if not p.exists():
        return None
    return json.loads(p.read_text("utf-8"))


def list_voices() -> list[dict]:
    s = get_settings()
    return [
        json.loads(p.read_text("utf-8")) for p in sorted(s.voices_dir.glob("*.json"))
    ]


def delete_voice(voice_id: str) -> bool:
    ok = False
    for p in (_meta_path(voice_id), _wav_path(voice_id)):
        if p.exists():
            p.unlink()
            ok = True
    return ok


def resolve_ref(voice_id: str | None) -> tuple[str, str]:
    """คืน (ref_audio_path, ref_text) สำหรับ TTS; โยน error ถ้าไม่พบ."""
    if not voice_id:
        raise ValueError("ต้องระบุ voice_id (ยังไม่มีเสียงเริ่มต้น) — อัปโหลดเสียงก่อน")
    v = get_voice(voice_id)
    if not v:
        raise ValueError(f"ไม่พบเสียง id={voice_id}")
    return v["wav"], v.get("ref_text", "")
