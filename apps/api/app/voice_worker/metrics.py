# @req FR-19 (candidate, CR-005) — /metrics: ตัวเลขสถานะรูปแบบ Prometheus (มาตรฐานที่ระบบเฝ้าระวังทุกเจ้าดึงได้)
"""ตัวเลขล้วนสำหรับ Prometheus/OpenTelemetry — **ห้ามมีเนื้อหางาน**

กฎของไฟล์นี้: ไม่มีข้อความที่ถอดได้ ไม่มีข้อความ TTS ไม่มี attempt_id ไม่มี issuer ไม่มี path ของไฟล์
(ทั้งหมดเป็นข้อมูลของลูกค้า และ metric มักถูกเก็บยาวและแชร์กว้างกว่าที่เจ้าของข้อมูลคาด)
label ที่ยอมให้มีคือค่าที่มาจาก manifest/สถานะของ worker เอง เช่น profile_id, revision, device, รหัส error

counter นับในหน่วยความจำตั้งแต่ engine/worker เริ่ม (รีเซ็ตเมื่อ restart — Prometheus จัดการ counter reset ได้เอง)
จึงไม่ต้องอ่าน receipt DB ตอน scrape
"""
from __future__ import annotations

import threading
from typing import Any

CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8"
_LABEL_TRANS = str.maketrans({"\\": "\\\\", "\n": "\\n", '"': '\\"'})


def _label(value: Any) -> str:
    return str(value if value is not None else "").translate(_LABEL_TRANS)


def _line(name: str, value: float | int, labels: dict[str, Any] | None = None) -> str:
    if labels:
        rendered = ",".join(f'{key}="{_label(val)}"' for key, val in labels.items())
        return f"{name}{{{rendered}}} {value}"
    return f"{name} {value}"


class Counters:
    """ตัวนับของ worker (thread-safe; runtime เรียกตอนงานจบ)"""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.attempts_accepted = 0
        self.attempts_rejected: dict[str, int] = {}   # รหัส error ตอนปฏิเสธก่อนเริ่มงาน
        self.attempts_finished: dict[str, int] = {}   # outcome → จำนวน
        self.attempts_failed: dict[str, int] = {}     # รหัส error ของงานที่ล้ม
        self.processing_seconds = 0.0
        self.audio_input_seconds = 0.0
        self.audio_output_seconds = 0.0
        self.engine_starts = 0
        self.engine_deaths = 0
        self.oom_kills = 0

    def _bump(self, bucket: dict[str, int], key: str) -> None:
        with self._lock:
            bucket[key] = bucket.get(key, 0) + 1

    def accepted(self) -> None:
        with self._lock:
            self.attempts_accepted += 1

    def rejected(self, code: str) -> None:
        self._bump(self.attempts_rejected, code)

    def finished(self, outcome: str, error_code: str | None, usage: dict[str, Any] | None) -> None:
        self._bump(self.attempts_finished, outcome)
        if outcome != "SUCCEEDED" and error_code:
            self._bump(self.attempts_failed, error_code)
        with self._lock:
            for field, attr in (("processing_seconds", "processing_seconds"), ("audio_input_seconds", "audio_input_seconds"),
                                ("audio_output_seconds", "audio_output_seconds")):
                value = (usage or {}).get(field)
                if isinstance(value, (int, float)):
                    setattr(self, attr, getattr(self, attr) + float(value))

    def engine_started(self) -> None:
        with self._lock:
            self.engine_starts += 1

    def engine_died(self, *, oom: bool) -> None:
        with self._lock:
            self.engine_deaths += 1
            if oom:
                self.oom_kills += 1

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "attempts_accepted": self.attempts_accepted,
                "attempts_rejected": dict(self.attempts_rejected),
                "attempts_finished": dict(self.attempts_finished),
                "attempts_failed": dict(self.attempts_failed),
                "processing_seconds": round(self.processing_seconds, 6),
                "audio_input_seconds": round(self.audio_input_seconds, 6),
                "audio_output_seconds": round(self.audio_output_seconds, 6),
                "engine_starts": self.engine_starts,
                "engine_deaths": self.engine_deaths,
                "oom_kills": self.oom_kills,
            }


P = "lalin_voice_worker"


def render(*, describe: dict[str, Any], readiness: dict[str, Any], counters: dict[str, Any],
           manifest_kind: str, oom_lockout: dict[str, Any] | None, consecutive_oom_kills: int) -> str:
    """แปลงสถานะ + counter → Prometheus exposition format (ฟังก์ชันบริสุทธิ์ เพื่อให้เทสต์ได้โดยไม่ต้องบูต worker)"""
    profile = (describe.get("profiles") or [{}])[0]
    device = describe.get("profiles", [{}])[0].get("device") or {}
    residency = describe.get("residency") or {}
    capacity = describe.get("capacity") or {}
    engine = describe.get("engine") or {}
    out: list[str] = []

    def block(name: str, help_text: str, metric_type: str, lines: list[str]) -> None:
        out.append(f"# HELP {name} {help_text}")
        out.append(f"# TYPE {name} {metric_type}")
        out.extend(lines)

    block(f"{P}_info", "Static identity of this worker and the profile it serves.", "gauge",
          [_line(f"{P}_info", 1, {
              "runtime_id": describe.get("runtime_id"),
              "profile_id": profile.get("profile_id"),
              "profile_revision": profile.get("profile_revision"),
              "kind": manifest_kind,
              "engine": engine.get("name"),
              "engine_version": engine.get("version"),
              "labeled_stub": str(bool(engine.get("labeled_stub"))).lower(),
              "device_configured": device.get("configured"),
              "device_effective": device.get("effective"),
              "contract_version": describe.get("contract_version"),
              "worker_version": (describe.get("worker") or {}).get("version"),
          })])
    block(f"{P}_epoch_info", "Current engine epoch; it changes on every engine (re)start.", "gauge",
          [_line(f"{P}_epoch_info", 1, {"runtime_epoch": readiness.get("runtime_epoch")})])
    block(f"{P}_ready", "1 when the worker accepts inference; the reason label explains a 0.", "gauge",
          [_line(f"{P}_ready", 1 if readiness.get("ready") else 0,
                 {"reason": (readiness.get("profiles") or [{}])[0].get("reason") or ""})])
    block(f"{P}_engine_alive", "1 while the engine child process is running.", "gauge",
          [_line(f"{P}_engine_alive", 1 if readiness.get("engine_alive") else 0)])
    block(f"{P}_draining", "1 while the worker is draining and refuses new work.", "gauge",
          [_line(f"{P}_draining", 1 if readiness.get("draining") else 0)])
    heartbeat = readiness.get("heartbeat_age_seconds")
    if isinstance(heartbeat, (int, float)):
        block(f"{P}_engine_heartbeat_age_seconds", "Age of the last engine heartbeat.", "gauge",
              [_line(f"{P}_engine_heartbeat_age_seconds", heartbeat)])
    block(f"{P}_capacity_in_use", "Attempts currently executing.", "gauge",
          [_line(f"{P}_capacity_in_use", capacity.get("in_use", 0))])
    block(f"{P}_capacity_max", "max_concurrency from the profile.", "gauge",
          [_line(f"{P}_capacity_max", capacity.get("max_concurrency", 0))])
    for field, name, help_text in (("vram_bytes_allocated", f"{P}_vram_allocated_bytes", "VRAM allocated by the engine (GPU profiles only)."),
                                   ("vram_bytes_reserved", f"{P}_vram_reserved_bytes", "VRAM reserved by the engine (GPU profiles only).")):
        value = residency.get(field)
        if isinstance(value, (int, float)):
            block(name, help_text, "gauge", [_line(name, value)])
    block(f"{P}_model_warm", "1 when the engine finished warm-up.", "gauge",
          [_line(f"{P}_model_warm", 1 if residency.get("warm") else 0)])

    # D18
    block(f"{P}_consecutive_oom_kills", "cgroup-confirmed OOM kills since the last engine result.", "gauge",
          [_line(f"{P}_consecutive_oom_kills", consecutive_oom_kills)])
    block(f"{P}_oom_lockout", "1 when the worker stopped restarting the engine after repeated OOM kills (D18).", "gauge",
          [_line(f"{P}_oom_lockout", 1 if oom_lockout else 0)])

    block(f"{P}_attempts_accepted_total", "Attempts accepted for execution.", "counter",
          [_line(f"{P}_attempts_accepted_total", counters.get("attempts_accepted", 0))])
    block(f"{P}_attempts_rejected_total", "Attempts refused before any compute, by error code.", "counter",
          [_line(f"{P}_attempts_rejected_total", count, {"code": code})
           for code, count in sorted((counters.get("attempts_rejected") or {}).items())] or
          [_line(f"{P}_attempts_rejected_total", 0, {"code": "none"})])
    block(f"{P}_attempts_finished_total", "Attempts that reached a terminal state, by outcome.", "counter",
          [_line(f"{P}_attempts_finished_total", count, {"outcome": outcome})
           for outcome, count in sorted((counters.get("attempts_finished") or {}).items())] or
          [_line(f"{P}_attempts_finished_total", 0, {"outcome": "none"})])
    block(f"{P}_attempts_failed_total", "Failed attempts by error code (RUNTIME_OOM, NO_SPEECH, ...).", "counter",
          [_line(f"{P}_attempts_failed_total", count, {"code": code})
           for code, count in sorted((counters.get("attempts_failed") or {}).items())] or
          [_line(f"{P}_attempts_failed_total", 0, {"code": "none"})])
    block(f"{P}_processing_seconds_total", "Engine processing time summed over finished attempts.", "counter",
          [_line(f"{P}_processing_seconds_total", counters.get("processing_seconds", 0.0))])
    block(f"{P}_audio_input_seconds_total", "Audio duration submitted for ASR.", "counter",
          [_line(f"{P}_audio_input_seconds_total", counters.get("audio_input_seconds", 0.0))])
    block(f"{P}_audio_output_seconds_total", "Audio duration produced by TTS.", "counter",
          [_line(f"{P}_audio_output_seconds_total", counters.get("audio_output_seconds", 0.0))])
    block(f"{P}_engine_starts_total", "Engine process starts, including restarts after a death.", "counter",
          [_line(f"{P}_engine_starts_total", counters.get("engine_starts", 0))])
    block(f"{P}_engine_deaths_total", "Engine process deaths observed by the supervisor.", "counter",
          [_line(f"{P}_engine_deaths_total", counters.get("engine_deaths", 0))])
    block(f"{P}_engine_oom_kills_total", "Engine deaths confirmed as OOM kills by cgroup.", "counter",
          [_line(f"{P}_engine_oom_kills_total", counters.get("oom_kills", 0))])
    return "\n".join(out) + "\n"


__all__ = ["CONTENT_TYPE", "Counters", "render"]
