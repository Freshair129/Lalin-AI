# @req FR-19 (candidate, CR-005) — status gateway: ให้ระบบเฝ้าระวังนอกเครื่องดึง "สถานะ" ของ worker ได้ โดย worker ยังไม่มีเครือข่าย
"""**คนละ process กับ worker** — อ่านอย่างเดียว ส่งต่อเฉพาะสถานะ

ทำไมต้องมี: worker รันแบบไม่มีเครือข่ายเลย (D17 — Unix socket เท่านั้น) แต่ dashboard/Prometheus อยู่คนละเครื่อง
gateway จึงเป็นตัวเดียวที่รับ TCP แล้วอ่านจาก socket ของ worker ด้วย **management token** (ยิงงานไม่ได้ตามสิทธิ์)

สิ่งที่ยอมให้ผ่าน มีแค่ 3 ทาง (ไม่มี route ของงาน ไม่มี POST เลย):
  GET /healthz   ตัว gateway เองยังอยู่ไหม (ไม่ต้องมี token — ใช้เป็น health check ของ container)
  GET /metrics   ส่งต่อ ``/worker/v1/metrics`` ของ worker ตามเดิม (Prometheus)
  GET /status    ย่อจาก readiness+describe เป็น JSON ก้อนเล็กสำหรับ dashboard
ทั้ง /metrics และ /status ต้องมี bearer token ของ gateway เอง (คนละดอกกับ token ของ worker)

fail-closed ก่อน bind:
  • ไม่มี token ของ gateway หรือ token ของ worker → exit 2
  • bind ได้เฉพาะ loopback หรือ CGNAT ของ Tailscale (100.64.0.0/10) — ที่อยู่สาธารณะ/0.0.0.0 → exit 2
    (เครื่องนี้เปิด Tailscale Funnel ซึ่ง proxy จาก 127.0.0.1 ออกอินเทอร์เน็ต: ผูกกับ IP ของ tailnet ตรง ๆ ปลอดภัยกว่า)
ข้อมูลที่ส่งออกเป็นตัวเลข/สถานะล้วน — /metrics ไม่มีเนื้อหางานอยู่แล้ว (ดู metrics.py) และ /status คัดเฉพาะฟิลด์ที่ปลอดภัย

รัน (จาก apps/api):
  LALIN_STATUS_GATEWAY_WORKER_TOKEN=<management token>  LALIN_STATUS_GATEWAY_TOKEN=<token ของ gateway>  \\
  python -m app.voice_worker.status_gateway --socket /run/voice-worker/worker.sock --bind 100.76.19.65 --port 9109
"""
from __future__ import annotations

import argparse
import ipaddress
import os
import sys
from typing import Any

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse

from .auth import constant_time_token_match
from .metrics import CONTENT_TYPE as METRICS_CONTENT_TYPE

EXIT_CONFIG = 2
DEFAULT_PORT = 9109
_UNAUTHORIZED = JSONResponse({"error": {"code": "UNAUTHENTICATED", "message": "bearer token required"}}, status_code=401)


def check_bind(address: str, *, container: bool = False) -> None:
    """อนุญาตเฉพาะ loopback หรือ Tailscale CGNAT — กันการเผลอเปิดสู่เน็ตหรือ LAN ทั้งวง

    ``container=True`` (ธง ``--container-published``) ยอมให้ bind 0.0.0.0 ได้ สำหรับกรณีรันใน container ที่ตัว
    publish port ของ Docker เป็นคนกำหนดว่าเปิดที่ IP ไหนของ host (เช่น ``100.76.19.65:9109:9109``)
    ต้องระบุตั้งใจเท่านั้น — ค่าเริ่มต้นยังปฏิเสธ 0.0.0.0 เหมือนเดิม
    """
    if container and address in ("0.0.0.0", "::"):
        return
    try:
        parsed = ipaddress.ip_address(address)
    except ValueError:
        raise SystemExit(f"[status-gateway] fail-closed: bind '{address}' ไม่ใช่ IP (ต้องเป็น loopback หรือ Tailscale 100.64.0.0/10)")
    tailnet = ipaddress.ip_network("100.64.0.0/10")
    if not (parsed.is_loopback or (parsed.version == 4 and parsed in tailnet)):
        raise SystemExit(f"[status-gateway] fail-closed: bind {address} ต้องเป็น loopback หรือ Tailscale CGNAT (100.64.0.0/10)")


def status_view(describe: dict[str, Any], readiness: dict[str, Any]) -> dict[str, Any]:
    """คัดเฉพาะฟิลด์ที่ปลอดภัยสำหรับ dashboard — ไม่ส่ง ref_text/voices/asset path/ชื่อผู้เรียก"""
    profile = (describe.get("profiles") or [{}])[0]
    residency = describe.get("residency") or {}
    return {
        "ready": bool(readiness.get("ready")),
        "reason": (readiness.get("profiles") or [{}])[0].get("reason"),
        "runtime_id": describe.get("runtime_id"),
        "runtime_epoch": readiness.get("runtime_epoch"),
        "kind": profile.get("kind"),
        "profile_id": profile.get("profile_id"),
        "profile_revision": profile.get("profile_revision"),
        "engine": (describe.get("engine") or {}).get("name"),
        "engine_version": (describe.get("engine") or {}).get("version"),
        "labeled_stub": bool((describe.get("engine") or {}).get("labeled_stub")),
        "device": profile.get("device"),
        "warm": residency.get("warm"),
        "vram_bytes_reserved": residency.get("vram_bytes_reserved"),
        "engine_alive": bool(readiness.get("engine_alive")),
        "heartbeat_age_seconds": readiness.get("heartbeat_age_seconds"),
        "draining": bool(readiness.get("draining")),
        "oom_lockout": readiness.get("oom_lockout"),
        "capacity": describe.get("capacity"),
        "observed_at": readiness.get("observed_at"),
    }


def create_gateway_app(*, socket_path: str, worker_token: str, gateway_token: str, client: httpx.AsyncClient | None = None) -> FastAPI:
    app = FastAPI(title="lalin voice worker status gateway", docs_url=None, redoc_url=None, openapi_url=None)

    def upstream() -> httpx.AsyncClient:
        if client is not None:
            return client
        return httpx.AsyncClient(transport=httpx.AsyncHTTPTransport(uds=socket_path, retries=0), base_url="http://voice-worker",
                                 headers={"Authorization": f"Bearer {worker_token}"}, timeout=10.0)

    app.state.upstream_factory = upstream

    def authorized(request: Request) -> bool:
        header = request.headers.get("authorization") or ""
        scheme, _, token = header.partition(" ")
        return scheme.lower() == "bearer" and constant_time_token_match(gateway_token, token)

    @app.get("/healthz")
    async def healthz() -> PlainTextResponse:  # ไม่ต้องมี token: บอกแค่ว่า gateway เองยังอยู่
        return PlainTextResponse("ok\n")

    @app.get("/metrics")
    async def metrics(request: Request) -> Any:
        if not authorized(request):
            return _UNAUTHORIZED
        conn = app.state.upstream_factory()
        try:
            response = await conn.get("/worker/v1/metrics")
        except httpx.HTTPError as exc:
            return PlainTextResponse(f"# worker unreachable: {type(exc).__name__}\nlalin_voice_worker_up 0\n",
                                     status_code=503, media_type=METRICS_CONTENT_TYPE)
        finally:
            if client is None:
                await conn.aclose()
        return PlainTextResponse(response.text, status_code=response.status_code, media_type=METRICS_CONTENT_TYPE)

    @app.get("/status")
    async def status(request: Request) -> JSONResponse:
        if not authorized(request):
            return _UNAUTHORIZED
        conn = app.state.upstream_factory()
        try:
            described = await conn.get("/worker/v1/describe")
            ready = await conn.get("/worker/v1/readiness")
        except httpx.HTTPError as exc:
            return JSONResponse({"ready": False, "reason": "worker_unreachable", "error": type(exc).__name__}, status_code=503)
        finally:
            if client is None:
                await conn.aclose()
        if described.status_code != 200 or ready.status_code != 200:
            return JSONResponse({"ready": False, "reason": "worker_error",
                                 "upstream_status": [described.status_code, ready.status_code]}, status_code=502)
        return JSONResponse(status_view(described.json(), ready.json()))

    return app


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="read-only status gateway for the headless voice worker")
    parser.add_argument("--socket", default=os.environ.get("LALIN_STATUS_GATEWAY_SOCKET", "/run/voice-worker/worker.sock"))
    parser.add_argument("--bind", default=os.environ.get("LALIN_STATUS_GATEWAY_BIND", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("LALIN_STATUS_GATEWAY_PORT", DEFAULT_PORT)))
    parser.add_argument("--container-published", action="store_true",
                        help="รันใน container และให้ Docker publish เป็นคนคุม IP ของ host (อนุญาต bind 0.0.0.0)")
    args = parser.parse_args(argv)

    worker_token = os.environ.get("LALIN_STATUS_GATEWAY_WORKER_TOKEN", "")
    gateway_token = os.environ.get("LALIN_STATUS_GATEWAY_TOKEN", "")
    if not worker_token or not gateway_token:
        print("[status-gateway] fail-closed: ต้องตั้ง LALIN_STATUS_GATEWAY_WORKER_TOKEN และ LALIN_STATUS_GATEWAY_TOKEN", file=sys.stderr)
        return EXIT_CONFIG
    check_bind(args.bind, container=args.container_published)

    import uvicorn

    app = create_gateway_app(socket_path=args.socket, worker_token=worker_token, gateway_token=gateway_token)
    uvicorn.run(app, host=args.bind, port=args.port, log_level="info")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit as exit_code:
        if isinstance(exit_code.code, str):  # ข้อความ fail-closed จาก check_bind
            print(exit_code.code, file=sys.stderr)
            raise SystemExit(EXIT_CONFIG) from None
        raise
