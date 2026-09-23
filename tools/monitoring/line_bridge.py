#!/usr/bin/env python3
# @req FR-19 (candidate, CR-005) — ส่งแจ้งเตือนของ Alertmanager เข้า LINE
"""สะพาน Alertmanager → LINE Messaging API (push)

ทำไมต้องมี: Alertmanager ไม่มีตัวส่ง LINE ในตัว มีแต่ webhook แบบทั่วไป
ตัวนี้จึงรับ webhook แล้วแปลงเป็นข้อความไทยสั้น ๆ ยิงเข้า ``/v2/bot/message/push``

ขอบเขตแคบโดยตั้งใจ:
  POST /alert    รับ payload v4 ของ Alertmanager (ต้องมี bearer token ของสะพานเอง)
  GET  /healthz  บอกแค่ว่าตัวเองยังอยู่ (ไม่ต้องมี token — ใช้เป็น health check ของ container)
ไม่มี route อื่น และ **ไม่เปิดพอร์ตออกนอก host เลย** — มีแต่ Alertmanager ในเครือข่ายเดียวกันที่เรียกได้

เนื้อหาที่ส่งออกมาจาก label/annotation ของ metric ล้วน ซึ่งไม่มีเนื้อหางานอยู่แล้ว (ดู metrics.py)
สะพานนี้ไม่เคยแตะ payload ของงาน และไม่ log ค่า token

fail-closed ก่อน bind: ขาด token ของ LINE, ปลายทาง หรือ token ของสะพานเอง → exit 2

รัน (ปกติเรียกผ่าน docker/monitoring/compose.example.yaml):
  LALIN_ALERT_LINE_TOKEN=<channel access token>  LALIN_ALERT_LINE_TO=<user/group id> \\
  LALIN_ALERT_BRIDGE_TOKEN=<token ที่ Alertmanager ต้องแนบมา> \\
  python tools/monitoring/line_bridge.py --port 9110
"""
from __future__ import annotations

import argparse
import hmac
import os
import sys
from typing import Any

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse

EXIT_CONFIG = 2
DEFAULT_PORT = 9110
LINE_API_BASE = "https://api.line.me"
MAX_ALERTS_LISTED = 10          # เกินกว่านี้สรุปเป็นจำนวนแทน กันข้อความยาวจนถูกตัด
MAX_TEXT_CHARS = 4500           # LINE จำกัด 5000 เผื่อไว้หน่อย
_UNAUTHORIZED = JSONResponse({"error": "bearer token required"}, status_code=401)

SEVERITY_MARK = {"critical": "🔴", "warning": "🟡"}


def constant_time_match(expected: str, presented: str) -> bool:
    """เทียบแบบเวลาคงที่ — เหมือน auth.py ของ worker แต่สะพานนี้ไม่ได้ import จาก apps/api"""
    return bool(expected) and hmac.compare_digest(expected.encode(), presented.encode())


def format_alerts(payload: dict[str, Any]) -> str:
    """แปลง payload ของ Alertmanager เป็นข้อความเดียว — ฟังก์ชันบริสุทธิ์ เทสต์ได้โดยไม่ต้องยิงเน็ต"""
    status = str(payload.get("status") or "").lower()
    alerts = [a for a in (payload.get("alerts") or []) if isinstance(a, dict)]
    resolved = status == "resolved"

    head = "✅ หายแล้ว" if resolved else "🔔 แจ้งเตือน"
    lines = [f"{head} · lalin voice worker", ""]

    for alert in alerts[:MAX_ALERTS_LISTED]:
        labels = alert.get("labels") or {}
        annotations = alert.get("annotations") or {}
        severity = str(labels.get("severity") or "")
        mark = "✅" if resolved else SEVERITY_MARK.get(severity, "⚪")
        name = str(labels.get("alertname") or "unknown")
        # host มาจากไฟล์ target ของเรา ไม่ใช่จากงาน; instance เป็น host:port ของ gateway
        where = str(labels.get("host") or labels.get("instance") or "")
        lines.append(f"{mark} {name}" + (f" · {where}" if where else ""))
        for key in ("summary", "description"):
            text = str(annotations.get(key) or "").strip()
            if text:
                lines.append(f"   {text}")
        lines.append("")

    extra = len(alerts) - MAX_ALERTS_LISTED
    if extra > 0:
        lines.append(f"…และอีก {extra} รายการ")

    text = "\n".join(lines).strip()
    if len(text) > MAX_TEXT_CHARS:
        text = text[: MAX_TEXT_CHARS - 1].rstrip() + "…"
    return text or "แจ้งเตือนว่าง (ไม่มีรายการใน payload)"


def create_bridge_app(*, line_token: str, line_to: str, bridge_token: str,
                      api_base: str = LINE_API_BASE, client: httpx.AsyncClient | None = None) -> FastAPI:
    app = FastAPI(title="lalin alert line bridge", docs_url=None, redoc_url=None, openapi_url=None)

    def upstream() -> httpx.AsyncClient:
        if client is not None:
            return client
        return httpx.AsyncClient(base_url=api_base, timeout=10.0,
                                 headers={"Authorization": f"Bearer {line_token}"})

    app.state.upstream_factory = upstream

    def authorized(request: Request) -> bool:
        scheme, _, token = (request.headers.get("authorization") or "").partition(" ")
        return scheme.lower() == "bearer" and constant_time_match(bridge_token, token)

    @app.get("/healthz")
    async def healthz() -> PlainTextResponse:
        return PlainTextResponse("ok\n")

    @app.post("/alert")
    async def alert(request: Request) -> JSONResponse:
        if not authorized(request):
            return _UNAUTHORIZED
        try:
            payload = await request.json()
        except Exception:
            return JSONResponse({"error": "payload ต้องเป็น JSON"}, status_code=400)
        if not isinstance(payload, dict):
            return JSONResponse({"error": "payload ต้องเป็น object"}, status_code=400)

        body = {"to": line_to, "messages": [{"type": "text", "text": format_alerts(payload)}]}
        conn = app.state.upstream_factory()
        try:
            response = await conn.post("/v2/bot/message/push", json=body)
        except httpx.HTTPError as exc:
            # 500 เพื่อให้ Alertmanager ลองซ้ำเอง — สะพานไม่ retry เองจะได้ไม่ส่งซ้ำซ้อน
            return JSONResponse({"error": "line_unreachable", "detail": type(exc).__name__}, status_code=500)
        finally:
            if client is None:
                await conn.aclose()

        if response.status_code >= 300:
            # ข้อความของ LINE บอกสาเหตุชัด (token หมดอายุ, to ผิด, โควตาหมด) ส่งต่อให้เห็นใน log ของ Alertmanager
            return JSONResponse({"error": "line_rejected", "status": response.status_code,
                                 "detail": response.text[:300]}, status_code=500)
        return JSONResponse({"sent": True})

    return app


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Alertmanager webhook -> LINE push bridge")
    parser.add_argument("--bind", default=os.environ.get("LALIN_ALERT_BRIDGE_BIND", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("LALIN_ALERT_BRIDGE_PORT", DEFAULT_PORT)))
    args = parser.parse_args(argv)

    line_token = os.environ.get("LALIN_ALERT_LINE_TOKEN", "")
    line_to = os.environ.get("LALIN_ALERT_LINE_TO", "")
    bridge_token = os.environ.get("LALIN_ALERT_BRIDGE_TOKEN", "")
    api_base = os.environ.get("LALIN_ALERT_LINE_API_BASE", LINE_API_BASE)
    missing = [name for name, value in (("LALIN_ALERT_LINE_TOKEN", line_token),
                                        ("LALIN_ALERT_LINE_TO", line_to),
                                        ("LALIN_ALERT_BRIDGE_TOKEN", bridge_token)) if not value]
    if missing:
        print(f"[line-bridge] fail-closed: ต้องตั้ง {', '.join(missing)}", file=sys.stderr)
        return EXIT_CONFIG

    import uvicorn

    app = create_bridge_app(line_token=line_token, line_to=line_to, bridge_token=bridge_token, api_base=api_base)
    uvicorn.run(app, host=args.bind, port=args.port, log_level="info")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
