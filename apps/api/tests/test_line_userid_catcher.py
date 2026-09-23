# @req FR-19 (candidate, CR-005) — ตัวดัก userId/groupId ของ LINE (ใช้ตอนตั้งค่าเท่านั้น)
"""เทสต์ของ tools/monitoring/line_userid_catcher.py

ตัวนี้ต้องเปิดสู่อินเทอร์เน็ตชั่วคราว จึงต้องมั่นใจสองเรื่อง:
ลายเซ็นปลอมต้องไม่ถูกบันทึก และเนื้อหาข้อความที่คนพิมพ์มาต้องไม่ถูกเก็บไว้เลย
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import importlib.util
import sys
import types
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[3]
CATCHER = ROOT / "tools" / "monitoring" / "line_userid_catcher.py"


def _load():
    spec = importlib.util.spec_from_file_location("line_userid_catcher", CATCHER)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


catcher = _load()

SECRET = "channel-secret-value"
READ_TOKEN = "catcher-read-token-long-enough"


def signed(client: TestClient, payload: dict, *, secret: str = SECRET):
    body = json.dumps(payload).encode()
    signature = base64.b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).decode()
    return client.post("/line/webhook", content=body,
                       headers={"X-Line-Signature": signature, "Content-Type": "application/json"})


def app():
    return catcher.create_catcher_app(channel_secret=SECRET, read_token=READ_TOKEN)


def message_event(source: dict, text: str = "สวัสดี"):
    return {"type": "message", "replyToken": "", "source": source,
            "message": {"type": "text", "text": text}}


def read_captured(client: TestClient):
    response = client.get("/captured", headers={"Authorization": f"Bearer {READ_TOKEN}"})
    assert response.status_code == 200
    return response.json()["captured"]


def test_user_id_is_captured_from_a_direct_message():
    with TestClient(app()) as client:
        assert signed(client, {"events": [message_event({"type": "user", "userId": "Uabc123"})]}).status_code == 200
        captured = read_captured(client)
    assert captured == [{"kind": "user", "id": "Uabc123", "source_type": "user", "event": "message"}]


def test_group_event_captures_both_the_group_and_the_speaker():
    # ส่งเข้ากลุ่มหรือส่งหาคนเดียวก็ได้ จึงต้องเก็บทั้งคู่ให้เลือก
    source = {"type": "group", "groupId": "Cgroup1", "userId": "Uspeaker"}
    with TestClient(app()) as client:
        signed(client, {"events": [message_event(source)]})
        captured = read_captured(client)
    assert {item["kind"] for item in captured} == {"user", "group"}
    assert {item["id"] for item in captured} == {"Uspeaker", "Cgroup1"}


def test_room_id_is_captured():
    with TestClient(app()) as client:
        signed(client, {"events": [message_event({"type": "room", "roomId": "Rroom1"})]})
        captured = read_captured(client)
    assert any(item["kind"] == "room" and item["id"] == "Rroom1" for item in captured)


def test_bad_signature_is_refused_and_records_nothing():
    with TestClient(app()) as client:
        response = signed(client, {"events": [message_event({"type": "user", "userId": "Uevil"})]},
                          secret="wrong-secret")
        assert response.status_code == 400
        assert read_captured(client) == []


def test_missing_signature_header_is_refused():
    with TestClient(app()) as client:
        response = client.post("/line/webhook", json={"events": []})
        assert response.status_code == 400
        assert read_captured(client) == []


def test_verify_button_sends_no_events_and_must_still_get_200():
    # คอนโซลของ LINE ถือว่าตั้งค่าไม่สำเร็จถ้าไม่ได้ 200
    with TestClient(app()) as client:
        assert signed(client, {"events": [], "destination": "Ubot"}).status_code == 200


def test_the_same_id_is_not_recorded_twice():
    with TestClient(app()) as client:
        for _ in range(3):
            signed(client, {"events": [message_event({"type": "user", "userId": "Usame"})]})
        assert len(read_captured(client)) == 1


def test_message_text_is_never_stored_or_returned():
    private = "เลขบัญชีคือ 1234567890"
    with TestClient(app()) as client:
        signed(client, {"events": [message_event({"type": "user", "userId": "Uabc"}, text=private)]})
        response = client.get("/captured", headers={"Authorization": f"Bearer {READ_TOKEN}"})
    assert private not in response.text
    assert "1234567890" not in response.text


def test_captured_requires_a_token():
    with TestClient(app()) as client:
        assert client.get("/captured").status_code == 401
        assert client.get("/captured", headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_healthz_needs_no_token():
    with TestClient(app()) as client:
        assert client.get("/healthz").status_code == 200


def test_route_set_is_exactly_the_three_expected():
    routes = {(tuple(sorted(r.methods - {"HEAD"})), r.path) for r in app().routes if hasattr(r, "methods")}
    assert routes == {(("GET",), "/healthz"), (("POST",), "/line/webhook"), (("GET",), "/captured")}


def test_signature_check_uses_the_raw_body():
    # ถ้าใครเผลอแก้ไปคำนวณจาก JSON ที่ serialize ใหม่ เทสต์นี้จะพัง: ช่องว่างต่างกันแต่ลายเซ็นต้องยังตรง
    body = b'{"events":   [] }'
    signature = base64.b64encode(hmac.new(SECRET.encode(), body, hashlib.sha256).digest()).decode()
    with TestClient(app()) as client:
        response = client.post("/line/webhook", content=body,
                               headers={"X-Line-Signature": signature, "Content-Type": "application/json"})
    assert response.status_code == 200


def test_valid_signature_helper_rejects_an_empty_header():
    assert not catcher.valid_signature(SECRET, b"{}", "")


@pytest.fixture()
def no_server(monkeypatch):
    """กัน main() ไปเปิดเซิร์ฟเวอร์จริงระหว่างเทสต์

    ถ้าการตรวจค่าแบบ fail-closed พัง main() จะเดินต่อไปถึง uvicorn.run แล้ว **ค้างไปเลย**
    แทนที่จะฟ้อง — เทสต์ที่ค้างบอกอะไรไม่ได้เลยว่าพังตรงไหน ตัวนี้ทำให้มันล้มทันทีแทน
    """
    stub = types.ModuleType("uvicorn")
    def run(*args, **kwargs):  # noqa: ARG001
        raise AssertionError("main() ไปถึงขั้นเปิดเซิร์ฟเวอร์ ทั้งที่ควรหยุดตั้งแต่ตรวจค่า")
    stub.run = run
    monkeypatch.setitem(sys.modules, "uvicorn", stub)


@pytest.mark.parametrize("missing", ["LALIN_LINE_CHANNEL_SECRET", "LALIN_LINE_CATCHER_TOKEN"])
def test_main_exits_2_when_configuration_is_incomplete(monkeypatch, missing, no_server):
    monkeypatch.setenv("LALIN_LINE_CHANNEL_SECRET", SECRET)
    monkeypatch.setenv("LALIN_LINE_CATCHER_TOKEN", READ_TOKEN)
    monkeypatch.delenv(missing, raising=False)
    assert catcher.main([]) == catcher.EXIT_CONFIG
