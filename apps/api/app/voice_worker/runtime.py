"""Worker runtime — orchestrates receipts, capacity, supervisor และ payload store.

รับงาน → รัน → คืนผล ตาม handoff §6.6:
  1. dedupe ก่อน (same issuer+attempt_id): digest เดิม → receipt เดิม, ต่าง → IDEMPOTENCY_CONFLICT
  2. input checks (422) → target/epoch/profile (409) → window/deadline (409) → readiness (503) → capacity (503)
  3. commit ACCEPTED receipt → เก็บ payload → DISPATCHING → engine → RUNNING → FINISHED
  4. watchdog: เกิน deadline+grace → cancel → ยังไม่กลับ → terminate child ของตัวเอง → process-exit evidence → epoch ใหม่
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import threading
from datetime import timedelta
from pathlib import Path
from typing import Any

from .. import __version__ as studio_api_version
from . import WORKER_CONTRACT_VERSION, WORKER_NAME
from .admission import check_asr_input, check_target, check_tts_input, check_window
from .auth import Principal
from .contract import TEXT_POLICY_REVISION, AsrEnvelope, TtsEnvelope, envelope_digest
from .errors import WorkerError
from .profile import ALLOWED_ENGINES, ProfileManifest
from .receipts import Receipt, ReceiptStore
from .settings import WorkerSettings
from .storage import PayloadStore, validate_wav_output
from .supervisor import EngineDied, EngineSupervisor
from .timeutil import iso, utc_now

logger = logging.getLogger("lalin.voice_worker")


class Capacity:
    """local safety cap (LVP-REQ-012/021) — ไม่ใช่ global scheduler; ไม่มีคิว."""

    def __init__(self, slots: int) -> None:
        self.slots = slots
        self._used = 0
        self._lock = threading.Lock()

    def try_acquire(self) -> bool:
        with self._lock:
            if self._used >= self.slots:
                return False
            self._used += 1
            return True

    def release(self) -> None:
        with self._lock:
            self._used = max(0, self._used - 1)

    @property
    def in_use(self) -> int:
        with self._lock:
            return self._used


class WorkerRuntime:
    def __init__(self, settings: WorkerSettings, manifest: ProfileManifest) -> None:
        self.settings = settings
        self.manifest = manifest
        self.store = ReceiptStore(settings.receipts_path)
        self.payloads = PayloadStore(settings.attempts_dir)
        self.supervisor = EngineSupervisor(
            manifest,
            heartbeat_stale_seconds=settings.heartbeat_stale_seconds,
            hello_timeout_seconds=settings.engine_hello_timeout_seconds,
        )
        self.capacity = Capacity(manifest.max_concurrency)
        self.draining = False
        self.started_at: str | None = None
        self.last_reconcile: dict[str, Any] | None = None
        self._tasks: set[asyncio.Task[Any]] = set()
        self._restart_lock = asyncio.Lock()

    # ── lifecycle ────────────────────────────────────────────
    async def startup(self) -> None:
        self.settings.validate_runtime()
        epoch = await asyncio.to_thread(self.supervisor.start)
        now = utc_now()
        self.last_reconcile = {"epoch": epoch, **self.store.reconcile(epoch, now)}
        self._sweep(now)
        self.started_at = iso(now)
        logger.info("voice-worker started profile=%s epoch=%s engine=%s", self.manifest.profile_id, epoch, self.manifest.engine)

    async def shutdown(self) -> None:
        self.draining = True
        epoch = self.supervisor.epoch
        evidence = await asyncio.to_thread(self.supervisor.stop, self.settings.terminate_grace_seconds)
        if epoch is not None:
            self.store.mark_engine_lost(epoch, evidence=evidence, compute_stopped=bool(evidence.get("exited")), now=utc_now())
        for task in list(self._tasks):
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)

    def _sweep(self, now: Any) -> dict[str, Any]:
        report = self.store.sweep(
            now,
            payload_ttl=timedelta(hours=self.settings.payload_ttl_hours),
            receipt_horizon=timedelta(hours=self.settings.receipt_horizon_hours),
        )
        for issuer, attempt_id in report["expired_payloads"]:
            self.payloads.erase(issuer, attempt_id)
        return report

    async def _restart_engine(self, old_epoch: str | None, evidence: dict[str, Any], *, exclude: tuple[str, str] | None) -> None:
        async with self._restart_lock:
            if self.supervisor.alive:
                return
            now = utc_now()
            if old_epoch is not None:
                self.store.mark_engine_lost(old_epoch, evidence=evidence, compute_stopped=bool(evidence.get("exited")), now=now, exclude=exclude)
            if self.draining:
                return
            try:
                await asyncio.to_thread(self.supervisor.start)
            except Exception as exc:  # noqa: BLE001 — readiness จะเป็น false; ไม่ raise เข้า request path
                logger.error("engine restart failed: %s", exc.__class__.__name__)

    # ── observation ──────────────────────────────────────────
    def describe(self) -> dict[str, Any]:
        snap = self.supervisor.snapshot()
        profile = self.manifest.describe()
        profile["device"] = snap["device"]
        profile["state"] = {
            "configured": True,
            "supported": self.manifest.engine in ALLOWED_ENGINES,
            "loaded": snap["alive"],
            "ready": snap["ready"],
            "ready_reason": snap["reason"],
            "qualified": False,
            "qualification_note": "stub engine — not qualified for speech; no quality or GPU evidence"
            if self.manifest.engine == "stub" else "Slice B engine — real speech path; Thai quality/GPU qualification evidence pending",
        }
        return {
            "contract_version": WORKER_CONTRACT_VERSION,
            "worker": {"name": WORKER_NAME, "version": studio_api_version, "source_commit": self.settings.source_commit},
            "runtime_id": self.manifest.runtime_id,
            "runtime_epoch": snap["runtime_epoch"],
            "physical_resource_id": self.manifest.physical_resource_id,
            "engine": snap["engine"] or {"name": self.manifest.engine, "version": None, "labeled_stub": self.manifest.engine == "stub"},
            "profiles": [profile],
            "capabilities": {
                "operations": [self.manifest.kind],
                "cancel": "cooperative_ack+own_process_terminate",
                "async_status": True,
                "output_fetch": self.manifest.kind == "tts",
                "erase_payload": True,
                "text_policy_revision": TEXT_POLICY_REVISION if self.manifest.kind == "tts" else None,
            },
            "capacity": {"max_concurrency": self.manifest.max_concurrency, "in_use": self.capacity.in_use},
            "residency": snap["residency"],
            "draining": self.draining,
            "observed_at": snap["observed_at"] or iso(utc_now()),
            "observation_seq": snap["observation_seq"],
        }

    def readiness(self) -> dict[str, Any]:
        snap = self.supervisor.snapshot()
        ready = bool(snap["ready"]) and not self.draining
        reason = "draining" if self.draining else snap["reason"]
        return {
            "ready": ready,
            "runtime_id": self.manifest.runtime_id,
            "runtime_epoch": snap["runtime_epoch"],
            "profiles": [{"profile_id": self.manifest.profile_id, "profile_revision": self.manifest.profile_revision, "ready": ready, "reason": reason}],
            "engine_alive": snap["alive"],
            "heartbeat_age_seconds": snap["heartbeat_age_seconds"],
            "device": snap["device"],
            "residency": snap["residency"],
            "draining": self.draining,
            "last_reconcile": self.last_reconcile,
            "observed_at": snap["observed_at"] or iso(utc_now()),
            "observation_seq": snap["observation_seq"],
        }

    # ── intake ───────────────────────────────────────────────
    async def submit(self, principal: Principal, envelope: AsrEnvelope | TtsEnvelope, audio: bytes | None) -> tuple[int, dict[str, Any]]:
        issuer = principal.issuer
        attempt_id = envelope.attempt_id
        digest = envelope_digest(envelope)

        existing = self.store.get(issuer, attempt_id)
        if existing is not None:
            return self._dedupe(existing, digest)

        # ลำดับ: profile/kind/target (409) → input (422/413) → window (409) → readiness (503) → capacity (503)
        check_target(envelope, self.manifest, self.supervisor.epoch)
        engine_input = self._validate_input(envelope, audio)
        now = utc_now()
        budget = check_window(envelope, now, timedelta(seconds=self.settings.clock_skew_tolerance_seconds))

        ready, reason = self.supervisor.ready()
        if reason == "device_mismatch":
            snap = self.supervisor.snapshot()
            raise WorkerError("TARGET_MISMATCH", "runtime effective device does not match the bound profile device", attempt_id=attempt_id,
                              started=False, details={"reason": "device_mismatch", "configured": snap["device"]["configured"],
                                                      "effective": snap["device"]["effective"]})
        if self.draining or not ready:
            raise WorkerError("MODEL_UNAVAILABLE", "worker is not ready for inference", attempt_id=attempt_id, started=False,
                              details={"reason": "draining" if self.draining else reason})
        if not self.capacity.try_acquire():
            raise WorkerError("WORKER_BUSY", "local capacity exhausted; not queued", attempt_id=attempt_id, started=False,
                              details={"max_concurrency": self.manifest.max_concurrency})

        try:
            receipt, created = self.store.accept(
                issuer=issuer, attempt_id=attempt_id, invocation_id=envelope.invocation_id, kind=envelope.kind,
                payload_digest=digest, profile_id=self.manifest.profile_id, profile_revision=self.manifest.profile_revision,
                runtime_id=self.manifest.runtime_id, runtime_epoch=self.supervisor.epoch or "",
                lease_id=envelope.admission.lease_id, content_fence=envelope.admission.content_fence,
                start_before=envelope.admission.start_before, deadline_at=envelope.admission.deadline_at,
                payload_state="AVAILABLE" if envelope.kind == "asr" else "NONE", now=now,
            )
            if not created:
                self.capacity.release()
                return self._dedupe(receipt, digest)
        except Exception:
            self.capacity.release()
            raise
        if envelope.kind == "asr" and audio is not None:
            try:
                engine_input["input_path"] = str(self.payloads.write_input(issuer, attempt_id, audio))
            except OSError as exc:
                self.capacity.release()
                self._finish_failed(issuer, attempt_id, "RUNTIME_FAILED", f"could not stage input payload: {exc.__class__.__name__}",
                                    {"kind": "never_started", "observed_at": iso(now)}, compute_stopped=True, safe_to_retry=True)
                raise WorkerError("RUNTIME_FAILED", "could not stage input payload", attempt_id=attempt_id, started=False,
                                  execution_status="FINISHED", safe_to_retry=True) from None

        self._sweep(now)
        task = asyncio.create_task(self._run_attempt(issuer, attempt_id, envelope, engine_input, budget))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        logger.info("attempt accepted issuer=%s attempt=%s kind=%s", issuer, attempt_id, envelope.kind)
        return 202, receipt.to_status()

    def _dedupe(self, existing: Receipt, digest: str) -> tuple[int, dict[str, Any]]:
        if existing.payload_digest != digest:
            raise WorkerError("IDEMPOTENCY_CONFLICT", "attempt_id already accepted with different immutable content",
                              attempt_id=existing.attempt_id, execution_status=existing.execution_status,
                              safe_to_retry=False, started=existing.execution_status not in {"ACCEPTED"})
        return 200, existing.to_status()

    def _validate_input(self, envelope: AsrEnvelope | TtsEnvelope, audio: bytes | None) -> dict[str, Any]:
        if isinstance(envelope, AsrEnvelope):
            check_asr_input(envelope, self.manifest)
            if audio is None:
                raise WorkerError("INVALID_REQUEST", "asr requires multipart audio", attempt_id=envelope.attempt_id, started=False)
            if len(audio) == 0:
                raise WorkerError("INVALID_REQUEST", "audio part is empty", attempt_id=envelope.attempt_id, started=False)
            if len(audio) > self.manifest.limits.max_audio_bytes:
                raise WorkerError("AUDIO_TOO_LARGE", "audio bytes exceed the profile limit", attempt_id=envelope.attempt_id, started=False,
                                  details={"max_audio_bytes": self.manifest.limits.max_audio_bytes})
            if len(audio) != envelope.input.audio_bytes or hashlib.sha256(audio).hexdigest() != envelope.input.audio_sha256:
                raise WorkerError("INVALID_REQUEST", "audio bytes do not match declared audio_bytes/audio_sha256", attempt_id=envelope.attempt_id,
                                  started=False)
            return {"language": envelope.input.language, "declared_mime_type": envelope.input.declared_mime_type,
                    "max_audio_seconds": self.manifest.limits.max_audio_seconds}
        if audio is not None:
            raise WorkerError("INVALID_REQUEST", "tts uses application/json without an audio part", attempt_id=envelope.attempt_id, started=False)
        return check_tts_input(envelope, self.manifest)

    # ── execution ────────────────────────────────────────────
    async def _run_attempt(self, issuer: str, attempt_id: str, envelope: AsrEnvelope | TtsEnvelope, engine_input: dict[str, Any], budget: float) -> None:
        epoch = self.supervisor.epoch
        request_id = f"{hashlib.sha256(issuer.encode()).hexdigest()[:12]}:{attempt_id}"
        output_path: Path | None = None
        try:
            dispatching = self.store.mark_dispatching(issuer, attempt_id, utc_now())
            if dispatching is None:
                self.payloads.erase(issuer, attempt_id)
                return
            payload = dict(engine_input)
            if envelope.kind == "tts":
                output_path = self.payloads.output_path(issuer, attempt_id, engine_input["response_format"])
                payload["output_path"] = str(output_path)
            try:
                started_f, result_f = self.supervisor.submit(request_id, envelope.kind, payload, budget)
            except EngineDied as died:
                self._finish_failed(issuer, attempt_id, "MODEL_UNAVAILABLE", "engine not running at dispatch", died.evidence,
                                    compute_stopped=True, safe_to_retry=True)
                return

            # wrap ครั้งเดียว + shield ทุกครั้งที่ wait_for: timeout ต้องไม่ cancel future ของ engine
            # (ไม่งั้นรอบถัดไปได้ CancelledError แทน TimeoutError และ attempt ค้าง RUNNING โดยไม่มี evidence)
            started_aw = asyncio.wrap_future(started_f)
            result_aw = asyncio.wrap_future(result_f)
            result_aw.add_done_callback(lambda fut: None if fut.cancelled() else fut.exception())
            try:
                await asyncio.wait_for(asyncio.shield(started_aw), timeout=min(5.0, max(0.5, budget)))
            except asyncio.TimeoutError:
                pass  # engine ยังไม่ ack start — รอ result ต่อภายใน budget; watchdog ด้านล่างจัดการ
            except EngineDied as died:
                await self._engine_lost(issuer, attempt_id, epoch, died.evidence, code="RUNTIME_FAILED", message="engine died before start")
                return
            self.store.mark_running(issuer, attempt_id, utc_now())

            message: dict[str, Any]
            try:
                message = await asyncio.wait_for(asyncio.shield(result_aw), timeout=budget + self.settings.cancel_grace_seconds)
            except asyncio.TimeoutError:
                self.supervisor.cancel(request_id)
                try:
                    message = await asyncio.wait_for(asyncio.shield(result_aw), timeout=self.settings.cancel_grace_seconds)
                except asyncio.TimeoutError:
                    evidence = await asyncio.to_thread(self.supervisor.terminate, self.settings.terminate_grace_seconds)
                    exited = bool(evidence.get("exited"))
                    self.store.finish(
                        issuer, attempt_id, outcome="FAILED", result=None,
                        error={"code": "DEADLINE_EXCEEDED", "message": "engine did not stop cooperatively; own engine process terminated"},
                        usage={"processing_seconds": None, "provenance": "unavailable"},
                        compute_stopped=True if exited else None, stop_evidence=evidence,
                        safe_to_retry=exited, now=utc_now(),
                    )
                    await self._restart_engine(epoch, evidence, exclude=(issuer, attempt_id))
                    return
                except EngineDied as died:
                    await self._engine_lost(issuer, attempt_id, epoch, died.evidence, code="RUNTIME_FAILED", message="engine died during cancel")
                    return
            except EngineDied as died:
                await self._engine_lost(issuer, attempt_id, epoch, died.evidence, code="RUNTIME_FAILED", message="engine died during execution")
                return

            self._finish_from_engine(issuer, attempt_id, envelope, engine_input, message, output_path)
        except Exception as exc:  # noqa: BLE001 — ห้ามให้ attempt ค้าง RUNNING โดยไม่มี evidence
            logger.exception("attempt runner failed attempt=%s", attempt_id)
            self._finish_failed(issuer, attempt_id, "RUNTIME_FAILED", f"worker internal error: {exc.__class__.__name__}",
                                {"kind": "worker_exception", "observed_at": iso(utc_now())}, compute_stopped=None, safe_to_retry=False)
        finally:
            self.capacity.release()

    async def _engine_lost(self, issuer: str, attempt_id: str, epoch: str | None, evidence: dict[str, Any], *, code: str, message: str) -> None:
        if evidence.get("oom_killed") is True:
            # D13: cgroup ยืนยันว่า kernel OOM killer ฆ่า engine → รายงานเป็น OOM (PRP ต้องขยายเพดาน ไม่ใช่ไล่หาบั๊ก)
            code, message = "RUNTIME_OOM", f"{message}: killed by the out-of-memory killer"
        exited = bool(evidence.get("exited"))
        self._finish_failed(issuer, attempt_id, code, message, evidence, compute_stopped=True if exited else None, safe_to_retry=exited)
        await self._restart_engine(epoch, evidence, exclude=(issuer, attempt_id))

    def _finish_failed(self, issuer: str, attempt_id: str, code: str, message: str, evidence: dict[str, Any], *,
                       compute_stopped: bool | None, safe_to_retry: bool | None) -> None:
        self.payloads.erase(issuer, attempt_id)
        self.store.finish(
            issuer, attempt_id, outcome="FAILED", result=None, error={"code": code, "message": message},
            usage={"processing_seconds": None, "provenance": "unavailable"}, compute_stopped=compute_stopped,
            stop_evidence=evidence, safe_to_retry=safe_to_retry, now=utc_now(),
        )

    def _finish_from_engine(self, issuer: str, attempt_id: str, envelope: AsrEnvelope | TtsEnvelope, engine_input: dict[str, Any],
                            message: dict[str, Any], output_path: Path | None) -> None:
        outcome = message.get("outcome")
        result = message.get("result")
        error = message.get("error")
        usage = message.get("usage") or {"processing_seconds": None, "provenance": "unavailable"}
        evidence = message.get("stop_evidence") or {"kind": "engine_returned", "observed_at": iso(utc_now())}
        safe_to_retry: bool | None = None
        if outcome == "CANCELLED":
            safe_to_retry = True
        if outcome == "SUCCEEDED" and envelope.kind == "tts" and output_path is not None:
            try:
                metadata = validate_wav_output(output_path, max_seconds=self.manifest.limits.max_output_seconds)
                result = {
                    "kind": "tts", "engine": (result or {}).get("engine"), "provenance": (result or {}).get("provenance"),
                    "voice_preset_id": engine_input["voice_preset_id"], "voice_revision": engine_input["voice_revision"],
                    "language": engine_input["language"], "text_policy_revision": TEXT_POLICY_REVISION,
                    "text_code_points": engine_input["text_code_points"], **metadata,
                }
                usage = {**usage, "audio_output_seconds": metadata["duration_seconds"]}
            except ValueError as invalid:
                outcome = "FAILED"
                error = {"code": str(invalid), "message": "engine output failed validation; not published"}
                result = None
                output_path.unlink(missing_ok=True)
        if outcome == "SUCCEEDED" and envelope.kind == "asr":
            self.payloads.delete_input(issuer, attempt_id)
        if outcome != "SUCCEEDED":
            self.payloads.erase(issuer, attempt_id)
            if outcome not in {"FAILED", "CANCELLED"}:
                outcome, error = "FAILED", {"code": "RUNTIME_FAILED", "message": "engine returned an unknown outcome"}
        receipt = self.store.finish(
            issuer, attempt_id, outcome=outcome, result=result if outcome == "SUCCEEDED" else None, error=error, usage=usage,
            compute_stopped=True, stop_evidence=evidence, safe_to_retry=safe_to_retry, now=utc_now(),
        )
        if receipt is not None and receipt.payload_state in {"ERASED", "ERASE_REQUESTED", "EXPIRED"}:
            # erase fence ถูกตั้งระหว่างทำ → ทิ้ง bytes ที่มาช้า ไม่ publish
            self.payloads.erase(issuer, attempt_id)
            self.store.mark_erased(issuer, attempt_id, utc_now())

    # ── queries ──────────────────────────────────────────────
    def status(self, principal: Principal, attempt_id: str) -> dict[str, Any]:
        receipt = self.store.get(principal.issuer, attempt_id)
        if receipt is None:
            raise WorkerError("NOT_FOUND", "operation not found in this scope", attempt_id=attempt_id)
        return receipt.to_status()

    def cancel(self, principal: Principal, attempt_id: str) -> tuple[int, dict[str, Any]]:
        receipt, disposition = self.store.request_cancel(principal.issuer, attempt_id, utc_now())
        if receipt is None:
            raise WorkerError("NOT_FOUND", "operation not found in this scope", attempt_id=attempt_id)
        if disposition == "ACK":
            request_id = f"{hashlib.sha256(principal.issuer.encode()).hexdigest()[:12]}:{attempt_id}"
            delivered = self.supervisor.cancel(request_id)
            if not delivered:
                disposition = "UNSUPPORTED"
        if disposition == "CANCELLED_BEFORE_START":
            self.payloads.erase(principal.issuer, attempt_id)
        http = 202 if disposition in {"ACK", "UNSUPPORTED"} else 200
        return http, {"attempt_id": attempt_id, "disposition": disposition, **receipt.to_status()}

    def output_file(self, principal: Principal, attempt_id: str) -> tuple[Path, dict[str, Any]]:
        receipt = self.store.get(principal.issuer, attempt_id)
        if receipt is None:
            raise WorkerError("NOT_FOUND", "operation not found in this scope", attempt_id=attempt_id)
        if receipt.kind != "tts":
            raise WorkerError("INVALID_REQUEST", "asr operations return structured results, not binary output", attempt_id=attempt_id)
        if receipt.payload_state in {"ERASED", "EXPIRED", "ERASE_REQUESTED"}:
            raise WorkerError("PAYLOAD_ERASED", "payload was erased or expired", attempt_id=attempt_id, execution_status=receipt.execution_status)
        if not receipt.is_terminal or receipt.operation_outcome != "SUCCEEDED" or receipt.result is None:
            raise WorkerError("OUTPUT_NOT_READY", "output is not available yet", attempt_id=attempt_id, execution_status=receipt.execution_status)
        path = self.payloads.existing_output(principal.issuer, attempt_id)
        if path is None:
            raise WorkerError("OUTPUT_INVALID", "validated output missing on disk", attempt_id=attempt_id)
        return path, receipt.result

    def erase(self, principal: Principal, attempt_id: str) -> tuple[int, dict[str, Any]]:
        receipt = self.store.request_erase(principal.issuer, attempt_id, utc_now())
        if receipt is None:
            raise WorkerError("NOT_FOUND", "operation not found in this scope", attempt_id=attempt_id)
        if receipt.payload_state == "ERASE_REQUESTED":
            # ยังทำอยู่: ลบ input ทันที คง directory ให้ engine เขียนจนจบ แล้ว fence ทิ้ง output ตอน finish (ไม่ publish)
            self.payloads.delete_input(principal.issuer, attempt_id)
            return 202, {"attempt_id": attempt_id, "payload_state": receipt.payload_state, "execution_status": receipt.execution_status}
        self.payloads.erase(principal.issuer, attempt_id)
        return 200, {"attempt_id": attempt_id, "payload_state": receipt.payload_state, "execution_status": receipt.execution_status}


__all__ = ["Capacity", "WorkerRuntime"]
