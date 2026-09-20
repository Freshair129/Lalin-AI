"""Typed worker errors — LVP-REQ-027.

รหัสตามตาราง handoff §6.7 (proposed) บวกส่วนขยาย worker-local ที่ต้องให้ PRP map:
``NOT_FOUND``, ``OUTPUT_NOT_READY``, ``PAYLOAD_ERASED`` (ดู ``PROPOSED_ADDITIONS``)

ข้อความ error ต้อง sanitized: ไม่มี traceback, ไม่มี transcript/ข้อความ/เสียง/credential
"""
from __future__ import annotations

from typing import Any

HTTP_STATUS: dict[str, int] = {
    # input / schema
    "INVALID_REQUEST": 422,
    "UNSUPPORTED_PARAMETER": 422,
    # auth
    "UNAUTHORIZED": 401,
    "SCOPE_DENIED": 403,
    # admission
    "PROFILE_MISMATCH": 409,
    "TARGET_MISMATCH": 409,
    # capacity / runtime availability (ยังไม่ accepted)
    "WORKER_BUSY": 503,
    "MODEL_UNAVAILABLE": 503,
    # audio / ASR
    "AUDIO_TOO_LARGE": 413,
    "AUDIO_FORMAT_UNSUPPORTED": 422,
    "AUDIO_UNINTELLIGIBLE": 422,
    "NO_SPEECH": 422,
    # preset / language / output bounds
    "VOICE_NOT_APPROVED": 422,
    "LANGUAGE_UNSUPPORTED": 422,
    "OUTPUT_LIMIT": 422,
    # lifecycle
    "IDEMPOTENCY_CONFLICT": 409,
    "DEADLINE_EXCEEDED": 409,
    "CANCEL_REQUESTED": 409,
    "EXECUTION_UNKNOWN": 409,
    # runtime failure
    "RUNTIME_OOM": 500,
    "RUNTIME_FAILED": 500,
    "OUTPUT_INVALID": 500,
    # worker-local additions (flag for PRP mapping)
    "NOT_FOUND": 404,
    "OUTPUT_NOT_READY": 409,
    "PAYLOAD_ERASED": 410,
}

PROPOSED_ADDITIONS = frozenset({"NOT_FOUND", "OUTPUT_NOT_READY", "PAYLOAD_ERASED"})


class WorkerError(Exception):
    """ข้อผิดพลาดที่มีรหัสคงที่ + ข้อมูล execution ที่ทราบ (ไม่มีข้อมูลดิบ)."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        attempt_id: str | None = None,
        execution_status: str | None = None,
        safe_to_retry: bool | None = None,
        started: bool | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        if code not in HTTP_STATUS:
            raise ValueError(f"unknown worker error code: {code}")
        super().__init__(message)
        self.code = code
        self.message = message
        self.attempt_id = attempt_id
        self.execution_status = execution_status
        self.safe_to_retry = safe_to_retry
        self.started = started
        self.details = details or {}

    @property
    def http_status(self) -> int:
        return HTTP_STATUS[self.code]

    def to_body(self, request_id: str) -> dict[str, Any]:
        body: dict[str, Any] = {
            "code": self.code,
            "message": self.message,
            "request_id": request_id,
            "attempt_id": self.attempt_id,
            "execution_status": self.execution_status,
            "safe_to_retry": self.safe_to_retry,
            "started": self.started,
        }
        if self.details:
            body["details"] = self.details
        return {"error": body}
