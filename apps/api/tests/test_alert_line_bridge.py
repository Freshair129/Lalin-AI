# @req FR-19 (candidate, CR-005) — สะพาน Alertmanager → LINE
"""เทสต์ของ tools/monitoring/line_bridge.py

สะพานอยู่นอก apps/api (เป็นเครื่องมือของสแตกเฝ้าระวัง ไม่ใช่โค้ดของ worker) จึงโหลดด้วย path
สิ่งที่ต้องยืนยัน: ข้อความที่ส่งอ่านรู้เรื่อง, ไม่มี route เกิน, token บังคับจริง, และ
ความล้มเหลวของ LINE ต้องกลายเป็น 5xx เพื่อให้ Alertmanager ลองซ้ำ ไม่ใช่กลืนเงียบ
"""
from __future__ import annotations

import importlib.util
import sys
import types
import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[3]
BRIDGE = ROOT / "tools" / "monitoring" / "line_bridge.py"


def _load():
    spec = importlib.util.spec_from_file_location("line_bridge", BRIDGE)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


bridge = _load()

TOKEN = "bridge-token-that-is-long-enough"


def firing(**labels):
    base = {"alertname": "VoiceWorkerOomLockout", "severity": "critical", "host": "prp-linux-01"}
    base.update(labels)
    return {
        "status": "firing",
        "labels": base,
        "annotations": {"summary": "prp-linux-01 ล็อกตัวเองเพราะ OOM ซ้ำ (D18)",
                        "description": "ต้องมีคนเพิ่มเพดาน memory แล้ว restart"},
    }


def payload(status="firing", alerts=None):
    return {"version": "4", "status": status, "receiver": "line",
            "alerts": alerts if alerts is not None else [firing()]}


# --- การจัดข้อความ ---------------------------------------------------------

def test_firing_message_carries_what_an_operator_needs():
    text = bridge.format_alerts(payload())
    assert "VoiceWorkerOomLockout" in text
    assert "prp-linux-01" in text
    assert "OOM" in text
    assert "restart" in text
    assert text.startswith("🔔")


def test_resolved_message_is_marked_as_resolved():
    text = bridge.format_alerts(payload(status="resolved"))
    assert text.startswith("✅")
    assert "หายแล้ว" in text


def test_severity_changes_the_mark():
    critical = bridge.format_alerts(payload(alerts=[firing(severity="critical")]))
    warning = bridge.format_alerts(payload(alerts=[firing(severity="warning")]))
    assert "🔴" in critical and "🔴" not in warning
    assert "🟡" in warning


def test_many_alerts_are_summarised_not_dumped():
    alerts = [firing(host=f"host-{i}") for i in range(bridge.MAX_ALERTS_LISTED + 4)]
    text = bridge.format_alerts(payload(alerts=alerts))
    assert "…และอีก 4 รายการ" in text
    assert "host-0" in text
    assert f"host-{bridge.MAX_ALERTS_LISTED + 3}" not in text


def test_text_is_truncated_below_the_line_limit():
    long_alert = firing()
    long_alert["annotations"]["description"] = "ย" * 9000
    text = bridge.format_alerts(payload(alerts=[long_alert]))
    assert len(text) <= bridge.MAX_TEXT_CHARS
    assert text.endswith("…")


def test_empty_payload_still_produces_a_message():
    # เงียบไปเฉย ๆ แย่กว่าส่งข้อความว่าง: คนดูจะไม่รู้ว่าสะพานทำงานอยู่ไหม
    assert bridge.format_alerts(payload(alerts=[])).strip()


def test_missing_host_label_does_not_break_formatting():
    alert = firing()
    alert["labels"].pop("host")
    alert["labels"]["instance"] = "status-gateway:9109"
    text = bridge.format_alerts(payload(alerts=[alert]))
    assert "status-gateway:9109" in text


# --- แอปและการยิงเข้า LINE --------------------------------------------------

def make_app(handler, line_to="Uabc123"):
    calls: list[httpx.Request] = []

    def transport_handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return handler(request)

    client = httpx.AsyncClient(transport=httpx.MockTransport(transport_handler),
                               base_url="https://api.line.test",
                               headers={"Authorization": "Bearer line-token"})
    app = bridge.create_bridge_app(line_token="line-token", line_to=line_to,
                                   bridge_token=TOKEN, client=client)
    return app, calls


def test_alert_requires_the_bridge_token():
    app, calls = make_app(lambda r: httpx.Response(200, json={}))
    with TestClient(app) as client:
        assert client.post("/alert", json=payload()).status_code == 401
        assert client.post("/alert", json=payload(), headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert calls == []          # ไม่มี token = ต้องไม่ยิงออกไปเลย


def test_alert_pushes_to_line_with_the_expected_body():
    app, calls = make_app(lambda r: httpx.Response(200, json={}))
    with TestClient(app) as client:
        response = client.post("/alert", json=payload(), headers={"Authorization": f"Bearer {TOKEN}"})
    assert response.status_code == 200 and response.json() == {"sent": True}
    assert len(calls) == 1
    request = calls[0]
    assert request.url.path == "/v2/bot/message/push"
    body = json.loads(request.content)
    assert body["to"] == "Uabc123"
    assert len(body["messages"]) == 1 and body["messages"][0]["type"] == "text"
    assert "VoiceWorkerOomLockout" in body["messages"][0]["text"]


def test_line_rejection_becomes_5xx_so_alertmanager_retries():
    app, _ = make_app(lambda r: httpx.Response(400, text="invalid to"))
    with TestClient(app) as client:
        response = client.post("/alert", json=payload(), headers={"Authorization": f"Bearer {TOKEN}"})
    assert response.status_code == 500
    assert response.json()["error"] == "line_rejected"


def test_line_unreachable_becomes_5xx():
    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route", request=request)

    app, _ = make_app(boom)
    with TestClient(app) as client:
        response = client.post("/alert", json=payload(), headers={"Authorization": f"Bearer {TOKEN}"})
    assert response.status_code == 500
    assert response.json()["error"] == "line_unreachable"


def test_non_json_payload_is_refused_without_calling_line():
    app, calls = make_app(lambda r: httpx.Response(200, json={}))
    with TestClient(app) as client:
        response = client.post("/alert", content=b"not json",
                               headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    assert response.status_code == 400
    assert calls == []


def test_healthz_needs_no_token():
    app, _ = make_app(lambda r: httpx.Response(200, json={}))
    with TestClient(app) as client:
        assert client.get("/healthz").status_code == 200


def test_route_set_is_exactly_healthz_and_alert():
    app, _ = make_app(lambda r: httpx.Response(200, json={}))
    routes = {(tuple(sorted(r.methods - {"HEAD"})), r.path) for r in app.routes if hasattr(r, "methods")}
    assert routes == {(("GET",), "/healthz"), (("POST",), "/alert")}


def test_there_is_no_way_to_read_back_what_was_sent():
    # สะพานต้องไม่เก็บหรือเปิดให้อ่านข้อความที่ส่งไปแล้ว
    app, _ = make_app(lambda r: httpx.Response(200, json={}))
    with TestClient(app) as client:
        client.post("/alert", json=payload(), headers={"Authorization": f"Bearer {TOKEN}"})
        for path in ("/alert", "/alerts", "/history", "/last"):
            assert client.get(path).status_code in (404, 405)


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


# --- fail-closed ------------------------------------------------------------

@pytest.mark.parametrize("missing", ["LALIN_ALERT_LINE_TOKEN", "LALIN_ALERT_LINE_TO", "LALIN_ALERT_BRIDGE_TOKEN"])
def test_main_exits_2_when_configuration_is_incomplete(monkeypatch, missing, no_server):
    for name, value in (("LALIN_ALERT_LINE_TOKEN", "t"), ("LALIN_ALERT_LINE_TO", "U1"),
                        ("LALIN_ALERT_BRIDGE_TOKEN", TOKEN)):
        monkeypatch.setenv(name, value)
    monkeypatch.delenv(missing, raising=False)
    assert bridge.main([]) == bridge.EXIT_CONFIG


def test_constant_time_match_rejects_empty_expected():
    # token ว่างต้องไม่ผ่าน ไม่ว่าจะส่งอะไรมา
    assert not bridge.constant_time_match("", "")
    assert not bridge.constant_time_match("", "anything")
    assert bridge.constant_time_match(TOKEN, TOKEN)


# --- broadcast (บัญชีฟรีดึง user id ไม่ได้ จึงส่งหาทุกคนที่เพิ่มบอทเป็นเพื่อนแทน) ---

def test_broadcast_uses_the_broadcast_endpoint_and_sends_no_to_field():
    app, calls = make_app(lambda r: httpx.Response(200, json={}), line_to=bridge.BROADCAST)
    with TestClient(app) as client:
        response = client.post("/alert", json=payload(), headers={"Authorization": f"Bearer {TOKEN}"})
    assert response.status_code == 200
    assert calls[0].url.path == "/v2/bot/message/broadcast"
    body = json.loads(calls[0].content)
    # ส่ง ``to`` ไปด้วยกับ broadcast จะถูก LINE ปฏิเสธ
    assert "to" not in body
    assert "VoiceWorkerOomLockout" in body["messages"][0]["text"]


def test_a_real_id_still_uses_push():
    app, calls = make_app(lambda r: httpx.Response(200, json={}), line_to="U" + "a" * 32)
    with TestClient(app) as client:
        client.post("/alert", json=payload(), headers={"Authorization": f"Bearer {TOKEN}"})
    assert calls[0].url.path == "/v2/bot/message/push"
    assert json.loads(calls[0].content)["to"] == "U" + "a" * 32


@pytest.mark.parametrize("value", ["broadcast", "U" + "0" * 32, "C" + "f" * 32, "R" + "1" * 32])
def test_valid_destinations_are_accepted(value):
    assert bridge.valid_destination(value)


@pytest.mark.parametrize("value", ["", "REPLACE_ME_destination_id", "U123", "Broadcast",
                                   "U" + "A" * 32, "X" + "a" * 32, "U" + "a" * 33])
def test_invalid_destinations_are_rejected(value):
    # ที่สำคัญที่สุดคือ REPLACE_ME: ถ้าหลุดไปได้ จะไปล้มตอนมี alert จริงซึ่งสายเกินไป
    assert not bridge.valid_destination(value)


def test_main_exits_2_when_the_destination_is_still_a_placeholder(monkeypatch, no_server):
    monkeypatch.setenv("LALIN_ALERT_LINE_TOKEN", "t")
    monkeypatch.setenv("LALIN_ALERT_BRIDGE_TOKEN", TOKEN)
    monkeypatch.setenv("LALIN_ALERT_LINE_TO", "REPLACE_ME_destination_id")
    assert bridge.main([]) == bridge.EXIT_CONFIG
