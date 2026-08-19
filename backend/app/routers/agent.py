"""Agent tool-use endpoint — สมองเสนอ "การแก้ไข timeline" ให้ frontend เลือกใช้

แนวคิด: ผู้ใช้พิมพ์คำสั่งภาษาธรรมชาติ (เช่น "เลื่อนแทร็กกลองไปข้างหน้า 2 วิ")
สมองอ่าน state ของโปรเจกต์ (tracks/clips ปัจจุบัน) แล้วเรียก "เครื่องมือ" ที่กำหนดไว้
เพื่อ "เสนอ" การแก้ไข (mutation) — endpoint นี้ **ไม่แก้ไขอะไรเอง** แค่ normalize
และ validate ผลลัพธ์จากสมอง แล้วส่ง mutations กลับไปให้ frontend commit() แบบ undo-able
"""
# @req FR-14 — workspace agent
# @spec AI-AGT-001 — propose-only: agent เสนอ mutation, frontend commit เองแบบ undo-able
from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..brain import Message, get_brain

router = APIRouter(prefix="/agent", tags=["agent"])


# ── Request / Response models ───────────────────────────────
class AgentActRequest(BaseModel):
    message: str = Field(description="คำสั่งภาษาธรรมชาติจากผู้ใช้")
    project: dict = Field(description="state ปัจจุบันของโปรเจกต์ (tracks/clips ฯลฯ)")


class Mutation(BaseModel):
    op: str
    args: dict[str, Any] = Field(default_factory=dict)


class AgentActResponse(BaseModel):
    reply: str
    mutations: list[Mutation] = Field(default_factory=list)


# ── Tool schema ──────────────────────────────────────────────
# read tools: ให้สมอง "สอบถาม" state — ในทางปฏิบัติเราแนบ project state ไปใน
#   context อยู่แล้ว จึงตอบให้เลยแบบ deterministic (ไม่ต้อง round-trip กับสมอง)
# write tools: สมองเรียกเพื่อ "เสนอ" mutation เท่านั้น — args ต้องผ่าน schema
#   ด้านล่างนี้ก่อนถึงจะถูกส่งกลับไปให้ frontend

READ_TOOL_NAMES = {"get_project_state", "analyze_project"}

WRITE_TOOLS: dict[str, dict] = {
    "move_clip": {
        "description": "ย้ายตำแหน่ง clip บน timeline (เปลี่ยน start เป็นวินาที)",
        "input_schema": {
            "type": "object",
            "properties": {
                "trackId": {"type": "string", "description": "id ของ track ที่ clip นี้อยู่"},
                "clipId": {"type": "string"},
                "start": {"type": "number", "description": "ตำแหน่งใหม่ (วินาที)"},
            },
            "required": ["trackId", "clipId", "start"],
        },
    },
    "set_gain": {
        "description": (
            "ปรับความดัง (gain) ของ clip หรือ track — ตอนนี้ apply อัตโนมัติได้เฉพาะ "
            "targetType=clip เท่านั้น (track-level gain ยังไม่มีใน editor)"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "trackId": {"type": "string", "description": "track ของ clip เป้าหมาย (หรือ track เป้าหมายเองถ้า targetType=track)"},
                "targetId": {"type": "string", "description": "clip_id หรือ track_id ตามที่ระบุใน targetType"},
                "targetType": {"type": "string", "enum": ["clip", "track"]},
                "gain": {"type": "number", "description": "0..1 (หรือ dB ถ้า unit=db)"},
                "unit": {"type": "string", "enum": ["linear", "db"], "default": "linear"},
            },
            "required": ["trackId", "targetId", "targetType", "gain"],
        },
    },
    "set_pan": {
        "description": "ปรับ pan ซ้าย-ขวาของ track",
        "input_schema": {
            "type": "object",
            "properties": {
                "trackId": {"type": "string"},
                "pan": {"type": "number", "description": "-1 (ซ้ายสุด) .. 1 (ขวาสุด)"},
            },
            "required": ["trackId", "pan"],
        },
    },
    "set_fx": {
        "description": "ตั้งค่า/เปิดปิด FX บน track (เช่น reverb, delay, comp) — ยังไม่รองรับ apply อัตโนมัติ",
        "input_schema": {
            "type": "object",
            "properties": {
                "trackId": {"type": "string"},
                "fx": {"type": "string", "description": "ชื่อ FX เช่น reverb, delay, comp, eq"},
                "params": {"type": "object", "description": "พารามิเตอร์ของ FX นั้น ๆ"},
                "enabled": {"type": "boolean", "default": True},
            },
            "required": ["trackId", "fx"],
        },
    },
    "set_lufs": {
        "description": "ตั้งเป้าหมาย loudness (LUFS) สำหรับ mastering — ยังไม่รองรับ apply อัตโนมัติ",
        "input_schema": {
            "type": "object",
            "properties": {
                "targetLufs": {"type": "number", "description": "เช่น -14 สำหรับ streaming"},
            },
            "required": ["targetLufs"],
        },
    },
    "mute_clip": {
        "description": "ตั้งสถานะ mute ของ clip แบบเจาะจง (true/false) ไม่ใช่การสลับสถานะ",
        "input_schema": {
            "type": "object",
            "properties": {
                "trackId": {"type": "string"},
                "clipId": {"type": "string"},
                "muted": {"type": "boolean"},
            },
            "required": ["trackId", "clipId", "muted"],
        },
    },
    "slice_clip": {
        "description": "ตัด clip ออกเป็นสองท่อน ณ ตำแหน่งเวลาที่กำหนด",
        "input_schema": {
            "type": "object",
            "properties": {
                "trackId": {"type": "string"},
                "clipId": {"type": "string"},
                "at": {"type": "number", "description": "ตำแหน่งตัด (วินาที บน timeline)"},
            },
            "required": ["trackId", "clipId", "at"],
        },
    },
    "reorder_track": {
        "description": "ย้ายแทร็กไปอยู่ตำแหน่งของอีกแทร็กหนึ่ง (สลับตำแหน่งกัน)",
        "input_schema": {
            "type": "object",
            "properties": {
                "trackId": {"type": "string", "description": "track ที่จะย้าย"},
                "targetTrackId": {"type": "string", "description": "ย้ายไปอยู่ตำแหน่งของ track นี้"},
            },
            "required": ["trackId", "targetTrackId"],
        },
    },
}

READ_TOOLS: dict[str, dict] = {
    "get_project_state": {
        "description": "อ่าน state ดิบทั้งหมดของโปรเจกต์ปัจจุบัน (tracks/clips/bpm/key)",
        "input_schema": {"type": "object", "properties": {}},
    },
    "analyze_project": {
        "description": "สรุปโปรเจกต์ปัจจุบัน (จำนวน track/clip, ความยาวรวม, ชื่อ/สี ของแต่ละ track)",
        "input_schema": {"type": "object", "properties": {}},
    },
}


def _tool_defs() -> list[dict]:
    """รวม tool schema ทั้งหมด (read + write) ในรูปแบบกลางที่ LLMProvider.chat_with_tools ใช้."""
    defs = []
    for name, spec in {**READ_TOOLS, **WRITE_TOOLS}.items():
        defs.append({"name": name, "description": spec["description"], "input_schema": spec["input_schema"]})
    return defs


# ── project introspection (สำหรับตอบ read tools แบบ deterministic) ──
def _analyze_project(project: dict) -> dict:
    tracks = project.get("tracks") or []
    summary_tracks = []
    total_clips = 0
    for t in tracks:
        clips = t.get("clips") or []
        total_clips += len(clips)
        summary_tracks.append(
            {
                "id": t.get("id"),
                "label": t.get("label"),
                "color": t.get("color"),
                "muted": t.get("muted", False),
                "solo": t.get("solo", False),
                "clip_count": len(clips),
                "clip_ids": [c.get("id") for c in clips],
            }
        )
    return {
        "bpm": project.get("bpm"),
        "key": project.get("key"),
        "duration": project.get("duration"),
        "track_count": len(tracks),
        "total_clip_count": total_clips,
        "tracks": summary_tracks,
    }


def _validate_mutation(op: str, args: dict) -> Mutation | None:
    """ตรวจว่า op เป็น write-tool ที่รู้จัก และมี required fields ครบ — ไม่งั้นทิ้ง (ตัดออกอย่างเงียบ ๆ)."""
    spec = WRITE_TOOLS.get(op)
    if spec is None:
        return None
    required = spec["input_schema"].get("required", [])
    if any(r not in args for r in required):
        return None
    return Mutation(op=op, args=args)


# ── endpoint ─────────────────────────────────────────────────
SYSTEM_PROMPT = (
    "คุณเป็นผู้ช่วยตัดต่อเสียง/เพลงใน G-Music timeline editor "
    "ผู้ใช้จะสั่งงานด้วยภาษาธรรมชาติ (ไทย/อังกฤษ) เกี่ยวกับการแก้ไข timeline "
    "(ย้าย clip, ปรับ gain/pan, ใส่ FX, ตั้งค่า mastering, mute, slice, จัดลำดับ track) "
    "ให้เรียกใช้เครื่องมือ (tools) ที่เหมาะสมเพื่อ 'เสนอ' การแก้ไข — คุณจะไม่แก้ไขไฟล์เอง "
    "ระบบจะนำสิ่งที่คุณเรียกไปให้ผู้ใช้ยืนยันก่อนเสมอ "
    "ถ้าคำสั่งกำกวมหรือขาดข้อมูล (เช่น ไม่รู้ clip_id) ให้ถามกลับในข้อความตอบแทนการเดา"
)


@router.post("/act", response_model=AgentActResponse)
async def act(req: AgentActRequest) -> AgentActResponse:
    project = req.project or {}
    analysis = _analyze_project(project)

    context = (
        f"{SYSTEM_PROMPT}\n\n"
        f"สรุปโปรเจกต์ปัจจุบัน (จากเครื่องมือ analyze_project):\n{analysis}\n\n"
        f"state ดิบทั้งหมด (จากเครื่องมือ get_project_state):\n{project}"
    )

    messages = [
        Message("system", context),
        Message("user", req.message),
    ]

    brain = get_brain()
    result = await brain.chat_with_tools(messages, _tool_defs(), temperature=0.2)

    mutations: list[Mutation] = []
    for call in result.get("tool_calls", []):
        name = call.get("name", "")
        args = call.get("arguments") or {}
        if name in READ_TOOL_NAMES:
            continue  # read tool ตอบให้แล้วผ่าน context — ไม่ใช่ mutation
        m = _validate_mutation(name, args)
        if m is not None:
            mutations.append(m)

    return AgentActResponse(reply=result.get("text", ""), mutations=mutations)
