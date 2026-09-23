# @req FR-19 (candidate, CR-005) — status gateway: ทางเดียวที่สถานะของ worker ออกนอกเครื่อง (อ่านอย่างเดียว)
"""worker ไม่มีเครือข่าย (D17) — gateway เป็น process แยกที่รับ TCP แล้วอ่านจาก socket ด้วย management token
เทสต์บังคับ: bind ได้เฉพาะ loopback/Tailscale, ต้องมี token, ส่งต่อได้แค่ metrics/status, ไม่มีทางยิงงานผ่าน gateway
"""
from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from app.voice_worker.status_gateway import check_bind, create_gateway_app, status_view

GATEWAY_TOKEN = "gw-token-aaaaaaaaaaaaaaaaaaaa"
WORKER_TOKEN = "management-token-cccccccccccccccccc"
METRICS_BODY = "# TYPE lalin_voice_worker_ready gauge\nlalin_voice_worker_ready{reason=\"\"} 1\n"
DESCRIBE = {"runtime_id": "rt-1", "engine": {"name": "faster-whisper", "version": "1.2.1", "labeled_stub": False},
            "capacity": {"max_concurrency": 1, "in_use": 0}, "residency": {"warm": True, "vram_bytes_reserved": None},
            "profiles": [{"profile_id": "asr-th-en-01", "profile_revision": "rev-9", "kind": "asr",
                          "device": {"configured": "cpu", "effective": "cpu"},
                          "voices": [{"voice_preset_id": "secret-voice"}], "assets": [{"path": "/secret/model.bin"}]}]}
READINESS = {"ready": True, "runtime_epoch": "ep-1", "engine_alive": True, "draining": False,
             "heartbeat_age_seconds": 0.1, "observed_at": "2026-09-23T00:00:00+00:00", "profiles": [{"reason": None}]}


def _client(handler) -> TestClient:
    upstream = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://voice-worker")
    app = create_gateway_app(socket_path="/unused.sock", worker_token=WORKER_TOKEN, gateway_token=GATEWAY_TOKEN, client=upstream)
    return TestClient(app)


def _ok(request: httpx.Request) -> httpx.Response:
    assert request.method == "GET", "the gateway must never send a write to the worker"
    if request.url.path == "/worker/v1/metrics":
        return httpx.Response(200, text=METRICS_BODY)
    if request.url.path == "/worker/v1/describe":
        return httpx.Response(200, json=DESCRIBE)
    if request.url.path == "/worker/v1/readiness":
        return httpx.Response(200, json=READINESS)
    return httpx.Response(404)


@pytest.mark.parametrize("address", ["0.0.0.0", "192.168.1.10", "8.8.8.8", "not-an-ip", ""])
def test_public_or_lan_binds_are_refused(address):
    with pytest.raises(SystemExit):
        check_bind(address)


@pytest.mark.parametrize("address", ["127.0.0.1", "100.76.19.65", "100.64.0.1"])
def test_loopback_and_tailscale_binds_are_allowed(address):
    check_bind(address)


def test_any_bind_only_with_the_explicit_container_flag():
    """ใน container ให้ Docker publish เป็นคนคุม IP ของ host — แต่ต้องระบุธงชัดเจน ไม่ใช่ปล่อยผ่านเงียบ ๆ"""
    with pytest.raises(SystemExit):
        check_bind("0.0.0.0")
    check_bind("0.0.0.0", container=True)
    with pytest.raises(SystemExit):
        check_bind("8.8.8.8", container=True), "a public address stays refused even in a container"


def test_metrics_and_status_need_the_gateway_token():
    client = _client(_ok)
    assert client.get("/metrics").status_code == 401
    assert client.get("/status").status_code == 401
    assert client.get("/metrics", headers={"Authorization": f"Bearer {WORKER_TOKEN}"}).status_code == 401, \
        "the worker's own token must not open the gateway"
    assert client.get("/healthz").status_code == 200  # health check ไม่ต้องมี token


def test_metrics_pass_through_unchanged():
    response = _client(_ok).get("/metrics", headers={"Authorization": f"Bearer {GATEWAY_TOKEN}"})
    assert response.status_code == 200 and response.text == METRICS_BODY
    assert response.headers["content-type"].startswith("text/plain; version=0.0.4")


def test_status_exposes_only_safe_fields():
    body = _client(_ok).get("/status", headers={"Authorization": f"Bearer {GATEWAY_TOKEN}"}).json()
    assert body["ready"] is True and body["profile_id"] == "asr-th-en-01" and body["engine"] == "faster-whisper"
    assert "secret-voice" not in str(body) and "/secret/model.bin" not in str(body)
    assert set(body) == set(status_view(DESCRIBE, READINESS))


def test_only_three_routes_exist_and_none_accept_writes():
    app = create_gateway_app(socket_path="/unused.sock", worker_token=WORKER_TOKEN, gateway_token=GATEWAY_TOKEN)
    routes = {(method, route.path) for route in app.routes for method in getattr(route, "methods", set())}
    assert routes == {("GET", "/healthz"), ("GET", "/metrics"), ("GET", "/status")}
    client = _client(_ok)
    for path in ("/metrics", "/status", "/worker/v1/operations"):
        assert client.post(path, headers={"Authorization": f"Bearer {GATEWAY_TOKEN}"}).status_code in (404, 405)


def test_worker_down_is_reported_not_hidden():
    def broken(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no socket")

    client = _client(broken)
    metrics = client.get("/metrics", headers={"Authorization": f"Bearer {GATEWAY_TOKEN}"})
    assert metrics.status_code == 503 and "lalin_voice_worker_up 0" in metrics.text
    status = client.get("/status", headers={"Authorization": f"Bearer {GATEWAY_TOKEN}"})
    assert status.status_code == 503 and status.json()["reason"] == "worker_unreachable"
