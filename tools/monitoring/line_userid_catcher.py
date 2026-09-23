#!/usr/bin/env python3
"""ตัวดัก userId / groupId ของ LINE — ใช้ครั้งเดียวตอนตั้งค่า แล้วปิดทิ้ง

ทำไมต้องมี: LINE ไม่บอก userId ของคนที่ทักมา และไม่บอก groupId เลยไม่ว่าทางไหน
ค่าพวกนี้โผล่เฉพาะใน webhook event เท่านั้น ตัวนี้จึงรับ event แล้วพิมพ์ออกมาให้คัดลอก

**ชั่วคราวเท่านั้น** ต้องเปิดให้ LINE เรียกถึงได้ (HTTPS สาธารณะ) ซึ่งแปลว่าเปิดสู่อินเทอร์เน็ต
ปิดทันทีที่ได้ค่าแล้ว และอย่าปล่อยรันทิ้งไว้

ความปลอดภัย:
  • ตรวจ ``X-Line-Signature`` (HMAC-SHA256 ด้วย channel secret) ทุกครั้ง — ของปลอมถูกปฏิเสธและไม่ถูกบันทึก
  • ไม่เก็บและไม่พิมพ์ข้อความที่ผู้ใช้พิมพ์มา เก็บแค่ชนิดของ source กับ id
  • ``GET /captured`` ต้องมี token ของตัวเอง กันคนอื่นมาอ่าน id ที่ดักได้

รัน:
  LALIN_LINE_CHANNEL_SECRET=<channel secret>  LALIN_LINE_CATCHER_TOKEN=<token สำหรับอ่านผล> \\
  python tools/monitoring/line_userid_catcher.py --port 9111
แล้วตั้ง Webhook URL ในคอนโซลของ LINE เป็น ``https://<โดเมนสาธารณะ>/line/webhook``
จากนั้นทักบอทในแชต (หรือเชิญบอทเข้ากลุ่มแล้วพิมพ์อะไรสักอย่าง) id จะขึ้นที่ log ทันที
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import os
import sys
from typing import Any

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse

EXIT_CONFIG = 2
DEFAULT_PORT = 9111
LINE_API_BASE = "https://api.line.me"
_UNAUTHORIZED = JSONResponse({"error": "bearer token required"}, status_code=401)


def valid_signature(channel_secret: str, body: bytes, presented: str) -> bool:
    """ตามสเปกของ LINE: base64(HMAC-SHA256(channel secret, raw body))

    ต้องใช้ body ดิบเท่านั้น — ถ้า parse เป็น JSON แล้ว serialize ใหม่ ลายเซ็นจะไม่ตรง
    """
    digest = hmac.new(channel_secret.encode(), body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode()
    return hmac.compare_digest(expected, presented or "")


def extract_sources(payload: dict[str, Any]) -> list[dict[str, str]]:
    """ดึงเฉพาะ "ใครส่งมา" ออกจาก event — ไม่แตะเนื้อหาข้อความ"""
    found: list[dict[str, str]] = []
    for event in payload.get("events") or []:
        if not isinstance(event, dict):
            continue
        source = event.get("source") or {}
        kind = str(source.get("type") or "unknown")
        # กลุ่มและห้องมี userId ของคนพิมพ์ติดมาด้วย เก็บทั้งคู่: อาจอยากส่งเข้ากลุ่มหรือเข้าคนเดียวก็ได้
        for key, label in (("userId", "user"), ("groupId", "group"), ("roomId", "room")):
            value = source.get(key)
            if isinstance(value, str) and value:
                found.append({"kind": label, "id": value, "source_type": kind,
                              "event": str(event.get("type") or "")})
    return found


def create_catcher_app(*, channel_secret: str, read_token: str, reply_token_value: str = "",
                       api_base: str = LINE_API_BASE, client: httpx.Client | None = None) -> FastAPI:
    app = FastAPI(title="lalin line id catcher", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.captured = []

    @app.get("/healthz")
    async def healthz() -> PlainTextResponse:
        return PlainTextResponse("ok\n")

    @app.post("/line/webhook")
    async def webhook(request: Request) -> JSONResponse:
        body = await request.body()
        if not valid_signature(channel_secret, body, request.headers.get("x-line-signature", "")):
            # ปุ่ม Verify ของคอนโซลก็เซ็นมาเหมือนกัน ถ้าตรงนี้ไม่ผ่านแปลว่า channel secret ผิด
            return JSONResponse({"error": "bad signature"}, status_code=400)
        try:
            payload = await request.json()
        except Exception:
            payload = {}

        for item in extract_sources(payload if isinstance(payload, dict) else {}):
            if item not in app.state.captured:
                app.state.captured.append(item)
            print(f"[line-catcher] {item['kind']:5s} id = {item['id']}   (source={item['source_type']}, "
                  f"event={item['event']})", flush=True)

        if reply_token_value:
            _try_reply(payload, reply_token_value, api_base, client)
        # ปุ่ม Verify ส่ง events ว่างมา ต้องตอบ 200 ไม่งั้นคอนโซลจะขึ้นว่าตั้งค่าไม่สำเร็จ
        return JSONResponse({"ok": True})

    @app.get("/captured")
    async def captured(request: Request) -> JSONResponse:
        scheme, _, token = (request.headers.get("authorization") or "").partition(" ")
        if scheme.lower() != "bearer" or not hmac.compare_digest(read_token.encode(), token.encode()):
            return _UNAUTHORIZED
        return JSONResponse({"captured": app.state.captured})

    return app


def _try_reply(payload: dict[str, Any], token: str, api_base: str, client: httpx.Client | None) -> None:
    """ตอบกลับในแชตว่าเก็บ id ได้แล้ว — ช่วยให้คนที่ทักมารู้ว่าสำเร็จ ไม่ต้องมาถามหน้าจอ

    ล้มเหลวก็ไม่เป็นไร งานหลักคือดัก id ไม่ใช่ตอบกลับ
    """
    events = [e for e in (payload.get("events") or []) if isinstance(e, dict) and e.get("replyToken")]
    if not events:
        return
    conn = client or httpx.Client(base_url=api_base, timeout=5.0,
                                  headers={"Authorization": f"Bearer {token}"})
    try:
        conn.post("/v2/bot/message/reply", json={
            "replyToken": events[0]["replyToken"],
            "messages": [{"type": "text", "text": "เก็บ id เรียบร้อยแล้ว ดูที่หน้าจอของเครื่องที่รันตัวดักได้เลย"}],
        })
    except httpx.HTTPError as exc:
        print(f"[line-catcher] ตอบกลับไม่สำเร็จ ({type(exc).__name__}) — ไม่กระทบการดัก id", flush=True)
    finally:
        if client is None:
            conn.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="capture LINE userId/groupId from webhook events")
    parser.add_argument("--bind", default=os.environ.get("LALIN_LINE_CATCHER_BIND", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("LALIN_LINE_CATCHER_PORT", DEFAULT_PORT)))
    args = parser.parse_args(argv)

    channel_secret = os.environ.get("LALIN_LINE_CHANNEL_SECRET", "")
    read_token = os.environ.get("LALIN_LINE_CATCHER_TOKEN", "")
    missing = [n for n, v in (("LALIN_LINE_CHANNEL_SECRET", channel_secret),
                              ("LALIN_LINE_CATCHER_TOKEN", read_token)) if not v]
    if missing:
        print(f"[line-catcher] fail-closed: ต้องตั้ง {', '.join(missing)}", file=sys.stderr)
        return EXIT_CONFIG

    import uvicorn

    print("[line-catcher] พร้อมแล้ว — ตั้ง Webhook URL เป็น https://<โดเมน>/line/webhook แล้วทักบอทในแชต", flush=True)
    print("[line-catcher] ได้ค่าแล้วให้ปิดตัวนี้ทันที (Ctrl+C) และปิดช่องทางสาธารณะด้วย", flush=True)
    app = create_catcher_app(channel_secret=channel_secret, read_token=read_token,
                             reply_token_value=os.environ.get("LALIN_ALERT_LINE_TOKEN", ""))
    uvicorn.run(app, host=args.bind, port=args.port, log_level="warning")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
