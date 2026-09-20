#!/usr/bin/env python3
"""Reference caller ของ Lalin voice worker (LVP-REQ-005/032) — synthetic coordinator ไม่ import PRP/Zuri/Studio.

ใช้ httpx (dependency ที่ pinned อยู่แล้วใน apps/api/requirements.txt) โดย **ไม่มี retry** (LVP-REQ-023):
การส่งซ้ำต้องเป็นการตัดสินใจของ coordinator หลังอ่าน status ไม่ใช่ transport เดาเอง

ตัวอย่าง (PowerShell):
  $env:LALIN_VOICE_WORKER_CLIENT_TOKEN = "<inference token>"
  python tools/verify/voice_worker_client.py describe
  python tools/verify/voice_worker_client.py readiness
  python tools/verify/voice_worker_client.py asr  --attempt attempt-001 --audio clip.wav --language th --runtime-epoch <epoch จาก readiness>
  python tools/verify/voice_worker_client.py tts  --attempt attempt-002 --text "สวัสดี" --preset preset-stub-th --preset-rev r1 --runtime-epoch <epoch>
  python tools/verify/voice_worker_client.py status --attempt attempt-002 [--wait]
  python tools/verify/voice_worker_client.py cancel --attempt attempt-002
  python tools/verify/voice_worker_client.py output --attempt attempt-002 --out result.wav
  python tools/verify/voice_worker_client.py erase  --attempt attempt-002

target (runtime_id/physical_resource_id/profile_id/profile_revision) อ่านจาก describe อัตโนมัติถ้าไม่ระบุ;
runtime_epoch ต้องเป็นค่าปัจจุบันจาก readiness (stale → 409 TARGET_MISMATCH ตามสัญญา)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx

DEFAULT_BASE = "http://127.0.0.1:8790"


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="microseconds")


class WorkerClient:
    def __init__(self, base_url: str, token: str, timeout: float = 30.0) -> None:
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {token}"},
            timeout=timeout,
            transport=httpx.HTTPTransport(retries=0),  # ห้าม retry อัตโนมัติ
        )

    def close(self) -> None:
        self._client.close()

    # ── observation ─────────────────────────────────────────
    def live(self) -> httpx.Response:
        return self._client.get("/health/live", headers={"Authorization": ""})

    def describe(self) -> httpx.Response:
        return self._client.get("/worker/v1/describe")

    def readiness(self) -> httpx.Response:
        return self._client.get("/worker/v1/readiness")

    # ── operations ──────────────────────────────────────────
    def envelope(self, *, kind: str, attempt_id: str, target: dict[str, Any], input_payload: dict[str, Any],
                 start_before_s: float, deadline_s: float, lease_id: str | None, content_fence: str | None) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        return {
            "contract_version": "1.0",
            "invocation_id": f"inv-{attempt_id}",
            "attempt_id": attempt_id,
            "kind": kind,
            "target": target,
            "admission": {
                "lease_id": lease_id or f"lease-{uuid.uuid4().hex[:12]}",
                "start_before": _iso(now + timedelta(seconds=min(start_before_s, deadline_s))),
                "deadline_at": _iso(now + timedelta(seconds=deadline_s)),
                "content_fence": content_fence,
            },
            "input": input_payload,
        }

    def submit_asr(self, envelope: dict[str, Any], audio: bytes, mime: str) -> httpx.Response:
        return self._client.post(
            "/worker/v1/operations",
            data={"envelope": json.dumps(envelope, ensure_ascii=False)},
            files={"audio": ("clip", audio, mime)},
        )

    def submit_tts(self, envelope: dict[str, Any]) -> httpx.Response:
        return self._client.post("/worker/v1/operations", json=envelope)

    def status(self, attempt_id: str) -> httpx.Response:
        return self._client.get(f"/worker/v1/operations/{attempt_id}")

    def cancel(self, attempt_id: str) -> httpx.Response:
        return self._client.post(f"/worker/v1/operations/{attempt_id}/cancel")

    def output(self, attempt_id: str) -> httpx.Response:
        return self._client.get(f"/worker/v1/operations/{attempt_id}/output")

    def erase(self, attempt_id: str) -> httpx.Response:
        return self._client.delete(f"/worker/v1/operations/{attempt_id}/payload")

    def wait_terminal(self, attempt_id: str, *, timeout_s: float, poll_s: float = 0.25) -> dict[str, Any]:
        """read-only polling — ไม่ dispatch ใหม่ (LVP-REQ-019/023)."""
        deadline = time.monotonic() + timeout_s
        last: dict[str, Any] = {}
        while time.monotonic() < deadline:
            response = self.status(attempt_id)
            response.raise_for_status()
            last = response.json()
            if last.get("execution_status") in {"FINISHED", "UNKNOWN"}:
                return last
            time.sleep(poll_s)
        return last


def _print(response: httpx.Response) -> int:
    content_type = response.headers.get("content-type", "")
    if content_type.startswith("application/json"):
        print(json.dumps(response.json(), ensure_ascii=False, indent=2))
    else:
        print(f"<{len(response.content)} bytes {content_type}>")
    return 0 if response.is_success else 1


def _target_from_describe(client: WorkerClient, args: argparse.Namespace) -> dict[str, Any]:
    described = client.describe()
    described.raise_for_status()
    body = described.json()
    profile = body["profiles"][0]
    epoch = args.runtime_epoch or body.get("runtime_epoch")
    if not epoch:
        raise SystemExit("worker has no runtime_epoch (engine not running); ระบุ --runtime-epoch หรือรอ readiness")
    return {
        "runtime_id": args.runtime_id or body["runtime_id"],
        "runtime_epoch": epoch,
        "physical_resource_id": args.physical_resource_id or body["physical_resource_id"],
        "profile_id": args.profile_id or profile["profile_id"],
        "profile_revision": args.profile_revision or profile["profile_revision"],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Lalin voice worker reference client (synthetic coordinator)")
    parser.add_argument("--base-url", default=os.environ.get("LALIN_VOICE_WORKER_CLIENT_BASE", DEFAULT_BASE))
    parser.add_argument("--token", default=os.environ.get("LALIN_VOICE_WORKER_CLIENT_TOKEN", ""))
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("live", "describe", "readiness"):
        sub.add_parser(name)

    def add_target(p: argparse.ArgumentParser) -> None:
        p.add_argument("--attempt", required=True)
        p.add_argument("--runtime-id")
        p.add_argument("--runtime-epoch")
        p.add_argument("--physical-resource-id")
        p.add_argument("--profile-id")
        p.add_argument("--profile-revision")
        p.add_argument("--lease-id")
        p.add_argument("--content-fence")
        p.add_argument("--start-before-s", type=float, default=30.0)
        p.add_argument("--deadline-s", type=float, default=120.0)
        p.add_argument("--wait", action="store_true", help="poll status until terminal (read-only)")

    asr = sub.add_parser("asr")
    add_target(asr)
    asr.add_argument("--audio", required=True, type=Path)
    asr.add_argument("--language", default="auto")
    asr.add_argument("--mime", default="audio/wav")
    tts = sub.add_parser("tts")
    add_target(tts)
    tts.add_argument("--text", required=True)
    tts.add_argument("--preset", required=True)
    tts.add_argument("--preset-rev", required=True)
    tts.add_argument("--format", default="wav")
    tts.add_argument("--speed", type=float)
    status = sub.add_parser("status")
    status.add_argument("--attempt", required=True)
    status.add_argument("--wait", action="store_true")
    status.add_argument("--timeout-s", type=float, default=120.0)
    for name in ("cancel", "erase"):
        p = sub.add_parser(name)
        p.add_argument("--attempt", required=True)
    output = sub.add_parser("output")
    output.add_argument("--attempt", required=True)
    output.add_argument("--out", type=Path, required=True)

    args = parser.parse_args(argv)
    if args.command != "live" and not args.token:
        print("missing token: ตั้ง LALIN_VOICE_WORKER_CLIENT_TOKEN หรือ --token", file=sys.stderr)
        return 2

    client = WorkerClient(args.base_url, args.token)
    try:
        if args.command == "live":
            return _print(client.live())
        if args.command == "describe":
            return _print(client.describe())
        if args.command == "readiness":
            return _print(client.readiness())
        if args.command in {"asr", "tts"}:
            target = _target_from_describe(client, args)
            if args.command == "asr":
                audio = args.audio.read_bytes()
                payload = {"language": args.language, "audio_sha256": hashlib.sha256(audio).hexdigest(),
                           "audio_bytes": len(audio), "declared_mime_type": args.mime}
                envelope = client.envelope(kind="asr", attempt_id=args.attempt, target=target, input_payload=payload,
                                           start_before_s=args.start_before_s, deadline_s=args.deadline_s,
                                           lease_id=args.lease_id, content_fence=args.content_fence)
                response = client.submit_asr(envelope, audio, args.mime)
            else:
                payload: dict[str, Any] = {"text": args.text, "voice_preset_id": args.preset, "voice_revision": args.preset_rev,
                                           "response_format": args.format}
                if args.speed is not None:
                    payload["speed"] = args.speed
                envelope = client.envelope(kind="tts", attempt_id=args.attempt, target=target, input_payload=payload,
                                           start_before_s=args.start_before_s, deadline_s=args.deadline_s,
                                           lease_id=args.lease_id, content_fence=args.content_fence)
                response = client.submit_tts(envelope)
            code = _print(response)
            if response.is_success and args.wait:
                print(json.dumps(client.wait_terminal(args.attempt, timeout_s=args.deadline_s + 10), ensure_ascii=False, indent=2))
            return code
        if args.command == "status":
            if args.wait:
                print(json.dumps(client.wait_terminal(args.attempt, timeout_s=args.timeout_s), ensure_ascii=False, indent=2))
                return 0
            return _print(client.status(args.attempt))
        if args.command == "cancel":
            return _print(client.cancel(args.attempt))
        if args.command == "erase":
            return _print(client.erase(args.attempt))
        if args.command == "output":
            response = client.output(args.attempt)
            if response.is_success:
                args.out.write_bytes(response.content)
                digest = hashlib.sha256(response.content).hexdigest()
                header = response.headers.get("x-content-sha256", "")
                print(json.dumps({"saved": str(args.out), "bytes": len(response.content), "sha256": digest,
                                  "header_matches": header == digest}, ensure_ascii=False, indent=2))
                return 0 if header == digest else 1
            return _print(response)
    finally:
        client.close()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
