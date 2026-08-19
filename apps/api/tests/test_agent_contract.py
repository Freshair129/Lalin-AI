# @req FR-14 — สัญญาของ Mix Copilot tool schema (G-05)
"""ล็อกสัญญาของ WRITE_TOOLS — เดิม backend ส่ง snake_case (clip_id, target_id, track_id,
new_index) แต่ frontend อ่าน camelCase (clipId, trackId) ทำให้ apply ไม่เคยสำเร็จเลย
(ทุก branch ของ applyMutation คืน false เงียบ ๆ แล้ว UI ก็ยังขึ้น "ใช้แล้ว")

เทสต์นี้ล็อกทั้ง casing และ field ที่ frontend ต้องมีเพื่อ resolve clip/track ได้จริง —
move_clip/mute_clip/slice_clip เดิมไม่มี trackId เลย ทั้งที่ engine ต้องใช้หา track ก่อน
"""
from __future__ import annotations


def test_write_tools_carry_exactly_the_fields_the_frontend_needs():
    from app.routers.agent import WRITE_TOOLS

    expected_required = {
        "move_clip": {"trackId", "clipId", "start"},
        "set_gain": {"trackId", "targetId", "targetType", "gain"},
        "set_pan": {"trackId", "pan"},
        "set_fx": {"trackId", "fx"},
        "set_lufs": {"targetLufs"},
        "mute_clip": {"trackId", "clipId", "muted"},
        "slice_clip": {"trackId", "clipId", "at"},
        "reorder_track": {"trackId", "targetTrackId"},
    }
    assert set(WRITE_TOOLS.keys()) == set(expected_required.keys())
    for op, required in expected_required.items():
        assert set(WRITE_TOOLS[op]["input_schema"]["required"]) == required, op


def test_no_write_tool_property_uses_snake_case():
    """กันไม่ให้ snake_case โผล่กลับมาแบบเงียบ ๆ ในรอบถัดไป"""
    from app.routers.agent import WRITE_TOOLS

    for op, spec in WRITE_TOOLS.items():
        for key in spec["input_schema"]["properties"]:
            assert "_" not in key, f"{op}.{key} ใช้ snake_case"


class _FakeBrain:
    """สมองปลอมที่คืน tool_calls ตายตัว — ไม่ต้องมี Ollama/API key จริงตอนเทสต์"""

    def __init__(self, tool_calls: list[dict]):
        self._tool_calls = tool_calls

    async def chat_with_tools(self, messages, tools, *, temperature=0.2):
        return {"text": "โอเค ทำให้แล้วนะ", "tool_calls": self._tool_calls}


def _act(client, monkeypatch, tool_calls: list[dict], message: str = "ทำหน่อย"):
    import app.routers.agent as agent_router

    monkeypatch.setattr(agent_router, "get_brain", lambda: _FakeBrain(tool_calls))
    r = client.post("/agent/act", json={"message": message, "project": {"tracks": []}})
    assert r.status_code == 200
    return r.json()


def test_move_clip_survives_the_round_trip_with_camelcase_args(client, monkeypatch):
    body = _act(client, monkeypatch, [
        {"name": "move_clip", "arguments": {"trackId": "vocal", "clipId": "c1", "start": 4.0}},
    ])
    assert len(body["mutations"]) == 1
    assert body["mutations"][0]["op"] == "move_clip"
    assert body["mutations"][0]["args"] == {"trackId": "vocal", "clipId": "c1", "start": 4.0}


def test_move_clip_missing_trackid_is_dropped_not_forwarded_broken(client, monkeypatch):
    """ถ้าสมองลืมส่ง trackId มา ต้องถูกตัดทิ้งเงียบ ๆ (ตามพฤติกรรมเดิมของ _validate_mutation)
    ไม่ใช่ส่ง mutation ที่ frontend เอาไป apply ไม่ได้ต่อไปให้ผู้ใช้เห็นเป็นปุ่ม "ใช้" ที่กดแล้วพัง"""
    body = _act(client, monkeypatch, [
        {"name": "move_clip", "arguments": {"clipId": "c1", "start": 4.0}},
    ])
    assert body["mutations"] == []


def test_mute_clip_carries_a_boolean_not_a_toggle(client, monkeypatch):
    body = _act(client, monkeypatch, [
        {"name": "mute_clip", "arguments": {"trackId": "beat", "clipId": "c2", "muted": True}},
    ])
    assert body["mutations"][0]["args"]["muted"] is True


def test_reorder_track_uses_trackid_and_targettrackid_not_an_index(client, monkeypatch):
    body = _act(client, monkeypatch, [
        {"name": "reorder_track", "arguments": {"trackId": "vocal", "targetTrackId": "master"}},
    ])
    assert body["mutations"][0]["args"] == {"trackId": "vocal", "targetTrackId": "master"}


def test_read_tool_calls_never_become_mutations(client, monkeypatch):
    body = _act(client, monkeypatch, [
        {"name": "analyze_project", "arguments": {}},
        {"name": "set_pan", "arguments": {"trackId": "beat", "pan": -0.5}},
    ])
    assert len(body["mutations"]) == 1
    assert body["mutations"][0]["op"] == "set_pan"


def test_unknown_tool_call_is_dropped(client, monkeypatch):
    body = _act(client, monkeypatch, [{"name": "delete_everything", "arguments": {}}])
    assert body["mutations"] == []
