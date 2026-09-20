"""**Labeled stub engine** — Slice A only. ไม่ทำ speech จริง ไม่ใช่หลักฐาน quality/GPU.

รันใน child process ที่ supervisor spawn; import เฉพาะ stdlib เพื่อให้ child เบา
โปรโตคอลผ่าน ``multiprocessing.connection`` (dict ธรรมดา):

  parent → child : {"op": "execute", "request_id", "kind", "budget_seconds", "input": {...}}
                   {"op": "cancel", "request_id"} · {"op": "shutdown"}
  child  → parent: {"op": "hello", ...} · {"op": "heartbeat", "busy", "residency"} ·
                   {"op": "started", "request_id"} ·
                   {"op": "result", "request_id", "outcome", "result", "error", "usage", "stop_evidence"}

engine_options (จาก manifest):
  work_seconds (0.2)      เวลาจำลองต่องาน        slice_seconds (0.05)   ช่วงตรวจ cancel/deadline
  heartbeat_seconds (0.25) ช่วง heartbeat          effective_device ("cpu") อุปกรณ์ที่รายงานจริง
  output_seconds (0.5)    ความยาว WAV เงียบที่ผลิต  fail_with (None)      บังคับ FAILED ด้วยรหัสนี้
  ignore_cancel (False)   ไม่สนใจ cancel — ใช้ทดสอบ hard stop
  ignore_budget (False)   ไม่สนใจ deadline — ใช้ทดสอบ watchdog/terminate
"""
from __future__ import annotations

import os
import time
import wave
from datetime import datetime, timezone
from typing import Any

ENGINE_NAME = "stub"
ENGINE_VERSION = "0.1.0-stub"
STUB_TRANSCRIPT = "[stub] no transcription performed"

_DEFAULTS: dict[str, Any] = {
    "work_seconds": 0.2,
    "slice_seconds": 0.05,
    "heartbeat_seconds": 0.25,
    "effective_device": "cpu",
    "output_seconds": 0.5,
    "fail_with": None,
    "ignore_cancel": False,
    "ignore_budget": False,
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def _residency(device: str) -> dict[str, Any]:
    return {
        "engine": ENGINE_NAME,
        "model_loaded": True,
        "device": device,
        "vram_bytes_allocated": None,
        "vram_bytes_reserved": None,
        "provenance": "stub",
    }


def _send(conn: Any, message: dict[str, Any]) -> bool:
    try:
        conn.send(message)
        return True
    except (BrokenPipeError, EOFError, OSError):
        return False


def _write_silent_wav(path: str, seconds: float, sample_rate: int = 24000) -> None:
    frames = max(1, int(seconds * sample_rate))
    # เปิดไฟล์เองก่อน wave.open → ถ้า directory หาย จะได้ OSError สะอาด ไม่มี Wave_write.__del__ noise
    with open(path, "wb") as raw, wave.open(raw, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(b"\x00\x00" * frames)


def _execute(conn: Any, message: dict[str, Any], opts: dict[str, Any]) -> bool:
    """ทำงานจำลองหนึ่งชิ้น; คืน False เมื่อได้รับ shutdown ระหว่างทำ."""
    request_id = message["request_id"]
    kind = message.get("kind")
    budget = float(message.get("budget_seconds") or 0.0)
    payload = message.get("input") or {}
    started = time.monotonic()
    deadline = started + budget
    work_end = started + float(opts["work_seconds"])
    last_heartbeat = started
    outcome = "SUCCEEDED"
    error: dict[str, Any] | None = None

    _send(conn, {"op": "started", "request_id": request_id, "observed_at": _now_iso()})

    while time.monotonic() < work_end:
        now = time.monotonic()
        if not opts["ignore_budget"] and now >= deadline:
            outcome, error = "FAILED", {"code": "DEADLINE_EXCEEDED", "message": "engine budget exhausted before completion"}
            break
        try:
            if conn.poll(0):
                incoming = conn.recv()
                if incoming.get("op") == "shutdown":
                    _send(conn, {"op": "result", "request_id": request_id, "outcome": "CANCELLED",
                                 "result": None, "error": {"code": "CANCEL_REQUESTED", "message": "engine shutdown"},
                                 "usage": None, "stop_evidence": {"kind": "engine_returned", "observed_at": _now_iso()}})
                    return False
                if incoming.get("op") == "cancel" and incoming.get("request_id") == request_id and not opts["ignore_cancel"]:
                    outcome, error = "CANCELLED", {"code": "CANCEL_REQUESTED", "message": "cancelled cooperatively by engine"}
                    break
        except (EOFError, OSError):
            return False
        time.sleep(float(opts["slice_seconds"]))
        if time.monotonic() - last_heartbeat >= float(opts["heartbeat_seconds"]):
            _send(conn, {"op": "heartbeat", "busy": True, "observed_at": _now_iso(), "residency": _residency(opts["effective_device"])})
            last_heartbeat = time.monotonic()

    if outcome == "SUCCEEDED" and opts.get("fail_with"):
        outcome, error = "FAILED", {"code": str(opts["fail_with"]), "message": "stub engine forced failure"}

    result: dict[str, Any] | None = None
    if outcome == "SUCCEEDED":
        if kind == "asr":
            language = payload.get("language")
            result = {
                "kind": "asr",
                "engine": ENGINE_NAME,
                "text": STUB_TRANSCRIPT,
                "language": None if language in (None, "auto") else language,
                "duration_seconds": None,
                "segments": [],
                "provenance": "stub",
            }
        elif kind == "tts":
            out_path = payload.get("output_path")
            try:
                _write_silent_wav(out_path, float(opts["output_seconds"]))
                result = {"kind": "tts", "engine": ENGINE_NAME, "format": "wav", "output_path": out_path, "provenance": "stub"}
            except (OSError, ValueError, TypeError):
                outcome, error = "FAILED", {"code": "RUNTIME_FAILED", "message": "stub engine could not write output"}
        else:
            outcome, error = "FAILED", {"code": "INVALID_REQUEST", "message": "unsupported kind"}

    processing = time.monotonic() - started
    _send(conn, {
        "op": "result",
        "request_id": request_id,
        "outcome": outcome,
        "result": result,
        "error": error,
        "usage": {"processing_seconds": round(processing, 6), "audio_input_seconds": None, "provenance": "measured"},
        "stop_evidence": {"kind": "engine_returned", "observed_at": _now_iso()},
    })
    return True


def serve(conn: Any, options: dict[str, Any] | None = None) -> None:
    """entrypoint ของ child process."""
    opts = {**_DEFAULTS, **(options or {})}
    device = str(opts["effective_device"])
    if not _send(conn, {
        "op": "hello",
        "engine": ENGINE_NAME,
        "engine_version": ENGINE_VERSION,
        "labeled_stub": True,
        "effective_device": device,
        "pid": os.getpid(),
        "observed_at": _now_iso(),
        "residency": _residency(device),
    }):
        return
    while True:
        try:
            if conn.poll(float(opts["heartbeat_seconds"])):
                message = conn.recv()
            else:
                if not _send(conn, {"op": "heartbeat", "busy": False, "observed_at": _now_iso(), "residency": _residency(device)}):
                    return
                continue
        except (EOFError, OSError):
            return
        op = message.get("op")
        if op == "shutdown":
            return
        if op == "execute":
            if not _execute(conn, message, opts):
                return
            continue
        # cancel สำหรับงานที่จบไปแล้ว / ไม่รู้จัก → ไม่มีอะไรต้องทำ


__all__ = ["ENGINE_NAME", "ENGINE_VERSION", "STUB_TRANSCRIPT", "serve"]
