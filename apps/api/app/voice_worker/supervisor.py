"""Engine process supervisor — LVP-REQ-006/010/012/022.

control process ไม่โหลดโมเดล; engine อยู่ใน child (``multiprocessing`` spawn) ที่ supervisor เป็นเจ้าของ
  • ``runtime_epoch`` ใหม่ทุกครั้งที่ engine start → งานเก่าไม่ map ข้าม epoch
  • readiness = child alive + heartbeat สด + effective device ตรง manifest
  • ``terminate()`` หยุดเฉพาะ child ของตัวเอง (ถือ Process handle) และคืน process-exit evidence
"""
from __future__ import annotations

import multiprocessing
import threading
import time
import uuid
from pathlib import Path
from concurrent.futures import Future
from typing import Any

from . import engine_f5, engine_faster_whisper, engine_stub
from .profile import ProfileManifest
from .timeutil import iso, utc_now

ENGINE_TARGETS = {"stub": engine_stub.serve, "faster-whisper": engine_faster_whisper.serve, "f5-tts": engine_f5.serve}


CGROUP_MEMORY_EVENTS = Path("/sys/fs/cgroup/memory.events")


def cgroup_memory_events(path: Path = CGROUP_MEMORY_EVENTS) -> dict[str, int] | None:
    """ตัวนับใน ``memory.events`` ของ cgroup v2 (Linux container, D11/D13) — None เมื่ออ่านไม่ได้ เช่นบน Windows
    ``oom_kill`` = kernel OOM killer ฆ่า process · ``max`` = จำนวนครั้งที่ชนเพดาน memory (thrash ได้โดยไม่ถูกฆ่า)"""
    try:
        events: dict[str, int] = {}
        for line in path.read_text().splitlines():
            key, _, value = line.partition(" ")
            events[key] = int(value)
        return events
    except (OSError, ValueError):
        return None


def cgroup_oom_kills(path: Path = CGROUP_MEMORY_EVENTS) -> int | None:
    """ใช้ยืนยันว่า engine ตายเพราะ kernel OOM killer จริง แทนการเดาจาก exitcode −9 (SIGKILL มาจากที่อื่นได้)"""
    events = cgroup_memory_events(path)
    return None if events is None else events.get("oom_kill")


def memory_limit_hit_since(baseline: dict[str, int] | None, path: Path = CGROUP_MEMORY_EVENTS) -> bool | None:
    now = cgroup_memory_events(path)
    if baseline is None or now is None or "max" not in baseline or "max" not in now:
        return None
    return now["max"] > baseline["max"]


def oom_killed_since(baseline: int | None, path: Path = CGROUP_MEMORY_EVENTS) -> bool | None:
    """True/False เมื่อวัดได้ทั้งสองจุด · None = ไม่รู้ (ไม่มี cgroup) — ห้ามเดาเป็น True"""
    now = cgroup_oom_kills(path)
    if baseline is None or now is None:
        return None
    return now > baseline


class EngineStartError(RuntimeError):
    """engine ไม่ส่ง hello ภายในเวลา → worker fail-closed."""


class EngineDied(RuntimeError):
    def __init__(self, evidence: dict[str, Any]) -> None:
        super().__init__(evidence.get("kind", "engine_died"))
        self.evidence = evidence


class EngineSupervisor:
    def __init__(self, manifest: ProfileManifest, *, heartbeat_stale_seconds: float = 2.0, hello_timeout_seconds: float = 30.0) -> None:
        self.manifest = manifest
        self.heartbeat_stale_seconds = heartbeat_stale_seconds
        self.hello_timeout_seconds = hello_timeout_seconds
        self._ctx = multiprocessing.get_context("spawn")
        self._lock = threading.Lock()
        self._seq = 0
        self._proc: Any = None
        self._conn: Any = None
        self._reader: threading.Thread | None = None
        self._pending: dict[str, tuple[Future, Future]] = {}
        self._stopping = False
        self.epoch: str | None = None
        self.alive = False
        self.busy = False
        self.pid: int | None = None
        self.engine_info: dict[str, Any] = {}
        self.effective_device: str | None = None
        self.residency: dict[str, Any] | None = None
        self.last_heartbeat_monotonic: float | None = None
        self.last_observed_at: str | None = None
        self.exit_evidence: dict[str, Any] | None = None
        self._oom_baseline: int | None = None  # cgroup oom_kill ตอน engine เริ่ม (Linux เท่านั้น)

    # ── observations ─────────────────────────────────────────
    def _bump(self) -> int:
        self._seq += 1
        self.last_observed_at = iso(utc_now())
        return self._seq

    @property
    def observation_seq(self) -> int:
        return self._seq

    def heartbeat_age(self) -> float | None:
        if self.last_heartbeat_monotonic is None:
            return None
        return time.monotonic() - self.last_heartbeat_monotonic

    def ready(self) -> tuple[bool, str | None]:
        with self._lock:
            if not self.alive or self.epoch is None:
                return False, "engine_not_running"
            age = self.heartbeat_age()
            if age is None or age > self.heartbeat_stale_seconds:
                return False, "heartbeat_stale"
            if self.effective_device != self.manifest.device:
                return False, "device_mismatch"
            if isinstance(self.residency, dict) and self.residency.get("warm") is False:
                return False, "warming_up"
            return True, None

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            age = self.heartbeat_age()
            ready, reason = (False, "engine_not_running")
            if self.alive and self.epoch is not None:
                if age is None or age > self.heartbeat_stale_seconds:
                    reason = "heartbeat_stale"
                elif self.effective_device != self.manifest.device:
                    reason = "device_mismatch"
                elif isinstance(self.residency, dict) and self.residency.get("warm") is False:
                    reason = "warming_up"  # engine จริงยังอุ่น CUDA kernel/JIT ไม่เสร็จ — ยังไม่รับงาน
                else:
                    ready, reason = True, None
            return {
                "runtime_epoch": self.epoch,
                "engine": dict(self.engine_info),
                "alive": self.alive,
                "pid": self.pid,
                "busy": self.busy,
                "ready": ready,
                "reason": reason,
                "heartbeat_age_seconds": None if age is None else round(age, 3),
                "device": {"configured": self.manifest.device, "effective": self.effective_device},
                "residency": self.residency or {"provenance": "unavailable"},
                "exit_evidence": self.exit_evidence,
                "observed_at": self.last_observed_at,
                "observation_seq": self._seq,
            }

    # ── lifecycle ────────────────────────────────────────────
    def _engine_options(self) -> dict[str, Any]:
        """manifest.engine_options + device/assets ที่ profile ตรวจแล้ว (engine ห้ามหา path/อุปกรณ์เอง)."""
        return {
            **dict(self.manifest.engine_options),
            "device": self.manifest.device,
            "assets": {asset.role: asset.path for asset in self.manifest.assets},
        }

    def start(self) -> str:
        with self._lock:
            if self.alive:
                return self.epoch or ""
        target = ENGINE_TARGETS.get(self.manifest.engine)
        if target is None:
            raise EngineStartError(f"engine '{self.manifest.engine}' has no registered process target")
        parent_conn, child_conn = self._ctx.Pipe(duplex=True)
        proc = self._ctx.Process(
            target=target,
            args=(child_conn, self._engine_options()),
            name="lalin-voice-worker-engine",
            daemon=True,
        )
        events_baseline = cgroup_memory_events()
        oom_baseline = None if events_baseline is None else events_baseline.get("oom_kill")
        proc.start()
        child_conn.close()
        deadline = time.monotonic() + self.hello_timeout_seconds
        hello: dict[str, Any] | None = None
        while time.monotonic() < deadline:
            try:
                if parent_conn.poll(0.1):
                    message = parent_conn.recv()
                    if message.get("op") == "hello":
                        hello = message
                        break
            except (EOFError, OSError):
                break
            if not proc.is_alive():
                break
        if hello is None:
            died = not proc.is_alive()
            if not died:
                proc.terminate()
            proc.join(2.0)
            parent_conn.close()
            if died:
                # เดิมรายงานว่า "did not report hello within the configured timeout" แม้ engine ถูก kill ไปแล้ว
                # (เจอใต้เพดาน memory 1.5 GB: engine โดน OOM killer ระหว่างโหลดโมเดล, exitcode −9)
                oom = oom_killed_since(oom_baseline)
                cause = " — killed by the out-of-memory killer (raise the memory limit)" if oom else ""
                raise EngineStartError(f"engine process exited before hello (exitcode {proc.exitcode}){cause}")
            # ยังไม่ตายแต่ไม่ทัน: ใต้เพดาน memory ที่ไม่มี swap engine อาจ thrash (kernel ไล่ page cache ของไฟล์โมเดลซ้ำ ๆ)
            # แทนที่จะถูกฆ่า — เจอที่ --memory 1500m · ตัวนับ ``max`` บอกว่าชนเพดานระหว่างโหลดหรือไม่
            hit = memory_limit_hit_since(events_baseline)
            cause = " — the container hit its memory limit while loading (raise the memory limit)" if hit else ""
            raise EngineStartError(f"engine process did not report hello within the configured timeout{cause}")
        epoch = f"ep-{uuid.uuid4().hex[:12]}-{(self.manifest.manifest_sha256 or '0' * 8)[:8]}"
        with self._lock:
            self._proc = proc
            self._conn = parent_conn
            self._stopping = False
            self.epoch = epoch
            self.alive = True
            self.busy = False
            self.pid = proc.pid
            self.engine_info = {
                "name": hello.get("engine"),
                "version": hello.get("engine_version"),
                "labeled_stub": bool(hello.get("labeled_stub", False)),
            }
            self.effective_device = hello.get("effective_device")
            self.residency = hello.get("residency")
            self.last_heartbeat_monotonic = time.monotonic()
            self.exit_evidence = None
            self._oom_baseline = oom_baseline
            self._bump()
        reader = threading.Thread(target=self._reader_loop, args=(parent_conn, proc, epoch), name="voice-worker-engine-reader", daemon=True)
        self._reader = reader
        reader.start()
        return epoch

    def _reader_loop(self, conn: Any, proc: Any, epoch: str) -> None:
        while True:
            try:
                if not conn.poll(0.2):
                    if not proc.is_alive():
                        break
                    continue
                message = conn.recv()
            except (EOFError, OSError, BrokenPipeError):
                break
            self._handle(message)
        self._on_dead(proc, epoch)

    def _handle(self, message: dict[str, Any]) -> None:
        op = message.get("op")
        with self._lock:
            if op == "heartbeat":
                self.last_heartbeat_monotonic = time.monotonic()
                self.busy = bool(message.get("busy"))
                if message.get("residency") is not None:
                    self.residency = message["residency"]
                self._bump()
                return
            if op == "started":
                pair = self._pending.get(message.get("request_id", ""))
                self.last_heartbeat_monotonic = time.monotonic()
                self.busy = True
                self._bump()
                if pair and not pair[0].done():
                    pair[0].set_result(message)
                return
            if op == "result":
                pair = self._pending.pop(message.get("request_id", ""), None)
                self.last_heartbeat_monotonic = time.monotonic()
                self.busy = False
                self._bump()
                if pair:
                    if not pair[0].done():
                        pair[0].set_result({"op": "started", "implied": True})
                    if not pair[1].done():
                        pair[1].set_result(message)
                return

    def _on_dead(self, proc: Any, epoch: str) -> None:
        proc.join(2.0)
        with self._lock:
            intentional = self._stopping
            evidence = {
                "kind": "process_exit",
                "pid": proc.pid,
                "exitcode": proc.exitcode,
                "exited": not proc.is_alive(),
                "intentional": intentional,
                "runtime_epoch": epoch,
                "vram_reclaimed": None,
                # D13: True = kernel OOM killer ยืนยันจาก cgroup · None = วัดไม่ได้ (ไม่ใช่ Linux cgroup v2)
                "oom_killed": None if intentional else oom_killed_since(self._oom_baseline),
                "observed_at": iso(utc_now()),
            }
            if self.epoch == epoch:
                self.alive = False
                self.busy = False
                self.exit_evidence = evidence
                self._bump()
            pending = list(self._pending.values())
            self._pending.clear()
        for started, result in pending:
            if not started.done():
                started.set_exception(EngineDied(evidence))
            if not result.done():
                result.set_exception(EngineDied(evidence))

    def submit(self, request_id: str, kind: str, payload: dict[str, Any], budget_seconds: float) -> tuple[Future, Future]:
        with self._lock:
            if not self.alive or self._conn is None:
                raise EngineDied(self.exit_evidence or {"kind": "engine_not_running", "observed_at": iso(utc_now())})
            started: Future = Future()
            result: Future = Future()
            self._pending[request_id] = (started, result)
            try:
                self._conn.send({"op": "execute", "request_id": request_id, "kind": kind, "budget_seconds": budget_seconds, "input": payload})
            except (BrokenPipeError, EOFError, OSError):
                self._pending.pop(request_id, None)
                raise EngineDied({"kind": "engine_pipe_broken", "observed_at": iso(utc_now())}) from None
            return started, result

    def cancel(self, request_id: str) -> bool:
        with self._lock:
            if not self.alive or self._conn is None:
                return False
            try:
                self._conn.send({"op": "cancel", "request_id": request_id})
                return True
            except (BrokenPipeError, EOFError, OSError):
                return False

    def stop(self, grace_seconds: float = 2.0) -> dict[str, Any]:
        """graceful: ส่ง shutdown → รอ → terminate ถ้ายังไม่จบ; คืน evidence."""
        with self._lock:
            proc, conn = self._proc, self._conn
            self._stopping = True
        if proc is None:
            return {"kind": "engine_not_running", "exited": True, "observed_at": iso(utc_now())}
        if conn is not None:
            try:
                conn.send({"op": "shutdown"})
            except (BrokenPipeError, EOFError, OSError):
                pass
        proc.join(grace_seconds)
        if proc.is_alive():
            proc.terminate()
            proc.join(grace_seconds)
        if proc.is_alive():
            proc.kill()
            proc.join(1.0)
        if conn is not None:
            try:
                conn.close()
            except OSError:
                pass
        self._await_reader()
        return dict(self.exit_evidence or {"kind": "process_exit", "pid": proc.pid, "exitcode": proc.exitcode, "exited": not proc.is_alive(), "intentional": True, "observed_at": iso(utc_now())})

    def terminate(self, grace_seconds: float = 3.0) -> dict[str, Any]:
        """hard stop เฉพาะ child ของ supervisor นี้ (pid ที่ถือ handle อยู่) — ไม่แตะ process อื่นบนเครื่อง."""
        with self._lock:
            proc, conn = self._proc, self._conn
            self._stopping = True
        if proc is None:
            return {"kind": "engine_not_running", "exited": True, "observed_at": iso(utc_now())}
        proc.terminate()
        proc.join(grace_seconds)
        if proc.is_alive():
            proc.kill()
            proc.join(1.0)
        if conn is not None:
            try:
                conn.close()
            except OSError:
                pass
        self._await_reader()
        evidence = dict(self.exit_evidence or {})
        evidence.update({"kind": "process_exit", "pid": proc.pid, "exitcode": proc.exitcode, "exited": not proc.is_alive(), "intentional": True, "vram_reclaimed": None, "observed_at": iso(utc_now())})
        return evidence

    def _await_reader(self) -> None:
        reader = self._reader
        if reader is not None and reader is not threading.current_thread():
            reader.join(5.0)


__all__ = ["EngineDied", "EngineStartError", "EngineSupervisor", "cgroup_memory_events", "cgroup_oom_kills", "memory_limit_hit_since", "oom_killed_since"]
