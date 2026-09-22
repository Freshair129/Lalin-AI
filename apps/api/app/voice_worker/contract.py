"""Worker invocation contract v1.0 (LVP-REQ-005) — pydantic เป็น source of truth.

รูป envelope ตาม handoff §6.4: identity + target + admission + input โดย ``kind`` เป็น discriminator
ทุก model ``extra="forbid"`` → ฟิลด์แปลก (``ref_audio``, ``model_path``, ``upstream_url`` …) ถูกปฏิเสธ
ก่อน compute (LVP-REQ-017)

JSON-schema export ไป ``packages/contracts/schemas/lalin-voice-worker.schema.json`` (decision D12) ทำผ่าน
``python -m app.voice_worker.schema --write``; เทสต์ ``test_contract_schema.py`` บังคับให้ไฟล์ที่ commit ตรงกับโมเดลนี้
"""
from __future__ import annotations

import hashlib
import json
import unicodedata
from datetime import datetime, timezone
from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError, field_validator

from .errors import HTTP_STATUS, WorkerError

CONTRACT_VERSION = "1.0"
ID_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"  # path-safe: ไม่มี / \ : หรือ ".."
SHA256_PATTERN = r"^[0-9a-f]{64}$"
TEXT_POLICY_REVISION = "norm-v1"  # NFC + collapse whitespace เท่านั้น — ไม่แปลง ตัวเลข/วันที่/ชื่อ
GLOSSARY_MAX_ITEMS = 64
GLOSSARY_MAX_TERM_CODE_POINTS = 40
GLOSSARY_MAX_TOTAL_CODE_POINTS = 400

IdStr = Annotated[str, Field(pattern=ID_PATTERN)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Target(StrictModel):
    runtime_id: IdStr
    runtime_epoch: str = Field(min_length=1, max_length=128)
    physical_resource_id: IdStr
    profile_id: IdStr
    profile_revision: str = Field(min_length=1, max_length=128)


class Admission(StrictModel):
    lease_id: str = Field(min_length=1, max_length=256)
    start_before: datetime
    deadline_at: datetime
    content_fence: str | None = Field(default=None, max_length=256)

    @field_validator("start_before", "deadline_at")
    @classmethod
    def _require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("timestamp must include a timezone offset")
        return value.astimezone(timezone.utc)


class AsrInput(StrictModel):
    language: str = Field(default="auto", min_length=2, max_length=8)
    audio_sha256: str = Field(pattern=SHA256_PATTERN)
    audio_bytes: int = Field(gt=0)
    declared_mime_type: str = Field(min_length=3, max_length=64)
    # D15 (a): ศัพท์ของงานนี้ (ชื่อคน/ชื่อสินค้า) → whisper ``initial_prompt`` เป็นแค่ bias ของ decoder ไม่ใช่คำสั่ง
    # optional เสมอ ไม่มี default ระดับ profile · ไม่ echo กลับ ไม่เก็บใน receipt/log (อาจมีชื่อลูกค้า) · อยู่ใน envelope_digest
    # วัดแล้ว: ช่วยเสียงสะอาด แต่ตัดเนื้อหาบนเสียงไกล/มีเสียงรบกวน — caller เลือกใช้เฉพาะเสียงสะอาด
    glossary: list[str] | None = Field(default=None, min_length=1, max_length=GLOSSARY_MAX_ITEMS)

    @field_validator("glossary")
    @classmethod
    def _bounded_glossary(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        terms = [normalize_text(term) for term in value]
        for term in terms:
            if not 1 <= len(term) <= GLOSSARY_MAX_TERM_CODE_POINTS:
                raise ValueError(f"each glossary term must be 1-{GLOSSARY_MAX_TERM_CODE_POINTS} code points after norm-v1")
            if any(unicodedata.category(ch) in {"Cc", "Cf"} for ch in term):
                raise ValueError("glossary terms must not contain control or format characters")
        if sum(len(term) for term in terms) > GLOSSARY_MAX_TOTAL_CODE_POINTS:
            raise ValueError(f"glossary exceeds {GLOSSARY_MAX_TOTAL_CODE_POINTS} code points in total")
        return terms


def glossary_prompt(terms: list[str] | None) -> str | None:
    """glossary → ``initial_prompt`` ของ whisper: คั่นด้วยจุลภาค (รูปเดียวกับที่ใช้วัด A/B ใน D15 proposal §4.2)"""
    return ", ".join(terms) if terms else None


class TtsInput(StrictModel):
    text: str = Field(min_length=1, max_length=20_000)  # ceiling ของ schema; profile limit บังคับจริง
    voice_preset_id: IdStr
    voice_revision: str = Field(min_length=1, max_length=128)
    response_format: Literal["wav", "mp3"] = "wav"
    speed: float | None = Field(default=None, gt=0, le=4)


class _EnvelopeBase(StrictModel):
    contract_version: Literal["1.0"]
    invocation_id: IdStr
    attempt_id: IdStr
    target: Target
    admission: Admission


class AsrEnvelope(_EnvelopeBase):
    kind: Literal["asr"]
    input: AsrInput


class TtsEnvelope(_EnvelopeBase):
    kind: Literal["tts"]
    input: TtsInput


Envelope = Annotated[Union[AsrEnvelope, TtsEnvelope], Field(discriminator="kind")]
_envelope_adapter: TypeAdapter[Any] = TypeAdapter(Envelope)


def parse_envelope(data: Any) -> AsrEnvelope | TtsEnvelope:
    """แปลง dict → envelope; โยน ``WorkerError`` (422) ที่ sanitized แล้วเมื่อ schema ไม่ผ่าน."""
    try:
        return _envelope_adapter.validate_python(data)
    except ValidationError as exc:
        raise classify_validation_error(exc) from None


def classify_validation_error(exc: ValidationError) -> WorkerError:
    """map pydantic errors → รหัสคงที่ โดยไม่คัดลอกค่าที่ผู้เรียกส่งมา (มีแค่ตำแหน่งฟิลด์)."""
    extra: list[str] = []
    locs: list[str] = []
    bad_kind = False
    for err in exc.errors():
        loc = ".".join(str(part) for part in err.get("loc", ()) if not str(part).endswith("Envelope"))
        if err.get("type") == "extra_forbidden":
            extra.append(loc)
        elif err.get("type") in {"union_tag_invalid", "union_tag_not_found"}:
            bad_kind = True
        else:
            locs.append(loc)
    if extra:
        return WorkerError(
            "UNSUPPORTED_PARAMETER",
            "envelope contains fields outside the worker contract",
            details={"unsupported_parameters": sorted(set(extra))},
        )
    if bad_kind:
        return WorkerError("INVALID_REQUEST", "unsupported operation kind", details={"allowed_kinds": ["asr", "tts"]})
    return WorkerError(
        "INVALID_REQUEST",
        "envelope failed schema validation",
        details={"invalid_fields": sorted(set(locs))[:20]},
    )


def envelope_digest(envelope: AsrEnvelope | TtsEnvelope) -> str:
    """immutable payload digest สำหรับ idempotency (LVP-REQ-020) — ครอบทั้ง target/admission/input."""
    payload = envelope.model_dump(mode="json")
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def normalize_text(text: str) -> str:
    """policy ``norm-v1``: NFC + ยุบช่องว่างซ้อนเป็นหนึ่งช่อง + ตัดขอบ — ไม่แตะจำนวนเงิน/วันที่/รหัส."""
    normalized = unicodedata.normalize("NFC", text)
    return " ".join(normalized.split())


# ── response contracts (decision D12) ──────────────────────────────────────
# โมเดลด้านล่างเป็น "เอกสาร" ของรูปที่ runtime.py/receipts.py/errors.py คืนจริงอยู่แล้ว (dict ธรรมดา)
# ไม่ได้ใช้ validate ใน hot path — ใช้เพื่อ export JSON Schema (schema.py) + เทสต์ sync (test_contract_schema.py)
# ต้องแก้ที่นี่ก่อนเสมอเมื่อ runtime เปลี่ยนรูป response แล้วรัน `python -m app.voice_worker.schema --write`

ExecutionStatus = Literal["ACCEPTED", "DISPATCHING", "RUNNING", "FINISHED", "UNKNOWN"]
OperationOutcome = Literal["SUCCEEDED", "FAILED", "CANCELLED"]
PayloadState = Literal["NONE", "AVAILABLE", "ERASE_REQUESTED", "ERASED", "EXPIRED"]
CancelDisposition = Literal["ACK", "UNSUPPORTED", "CANCELLED_BEFORE_START", "ALREADY_FINISHED"]
ErrorCode = Literal[tuple(sorted(HTTP_STATUS))]  # ตรงกับ errors.HTTP_STATUS ทุกคีย์เสมอ


class StopEvidence(BaseModel):
    """หลักฐานการหยุด compute — ``kind`` เป็น discriminator แบบหลวม (ไม่ใช้ pydantic discriminator จริง)
    เพราะคีย์ที่เหลือต่างกันไปตาม kind (``process_exit`` มี pid/exitcode/exited/intentional/runtime_epoch/
    vram_reclaimed; ``never_started``/``engine_returned``/… มีแค่ observed_at) — จึงยอม extra fields."""

    model_config = ConfigDict(extra="allow")

    kind: str
    observed_at: str | None = None


class UsageReport(StrictModel):
    processing_seconds: float | None = None
    audio_input_seconds: float | None = None
    audio_output_seconds: float | None = None
    provenance: str | None = None


class OperationError(StrictModel):
    """``receipts.Receipt.error`` — เสมอมีแค่สองคีย์นี้ (ต่างจาก ``ErrorBody`` ของ HTTP error envelope)."""

    code: ErrorCode
    message: str


class AsrResult(StrictModel):
    kind: Literal["asr"]
    engine: str | None = None
    text: str
    language: str | None = None
    duration_seconds: float | None = None
    segments: list[Any] = Field(default_factory=list)
    provenance: str | None = None
    # D15: มีเฉพาะเมื่อ request ส่ง glossary — true = engine ใช้เป็น initial_prompt จริง, false = engine นี้ไม่รองรับ (เช่น stub)
    glossary_applied: bool | None = None


class TtsResult(StrictModel):
    kind: Literal["tts"]
    engine: str | None = None
    provenance: str | None = None
    voice_preset_id: IdStr
    voice_revision: str
    language: str
    text_policy_revision: str
    text_code_points: int
    format: str
    mime_type: str
    channels: int
    sample_rate: int
    sample_width_bytes: int
    duration_seconds: float
    bytes: int
    sha256: str = Field(pattern=SHA256_PATTERN)


OperationResult = Annotated[Union[AsrResult, TtsResult], Field(discriminator="kind")]


class OperationStatus(StrictModel):
    """``Receipt.to_status()`` — GET /operations/{attempt_id} และ body ของ POST /operations."""

    attempt_id: IdStr
    invocation_id: IdStr
    kind: Literal["asr", "tts"]
    runtime_id: IdStr
    runtime_epoch: str = Field(min_length=1, max_length=128)
    profile_id: IdStr
    profile_revision: str = Field(min_length=1, max_length=128)
    content_fence: str | None = Field(default=None, max_length=256)
    execution_status: ExecutionStatus
    operation_outcome: OperationOutcome | None = None
    cancellation_requested: bool
    compute_stopped: bool | None = None
    stop_evidence: StopEvidence | None = None
    payload_state: PayloadState
    result: OperationResult | None = None
    error: OperationError | None = None
    usage: UsageReport | None = None
    safe_to_retry: bool | None = None
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None


class CancelResponse(OperationStatus):
    """``WorkerRuntime.cancel()`` — ``OperationStatus`` บวก ``disposition``."""

    disposition: CancelDisposition


class ErasePayloadResponse(StrictModel):
    """``WorkerRuntime.erase()``."""

    attempt_id: IdStr
    payload_state: PayloadState
    execution_status: ExecutionStatus


class ErrorBody(StrictModel):
    """``WorkerError.to_body()`` — ส่วนใน ``{"error": ...}``; ``details`` ขาดหายได้ (ไม่ใช่แค่ null)."""

    code: ErrorCode
    message: str
    request_id: str
    attempt_id: str | None = None
    execution_status: ExecutionStatus | None = None
    safe_to_retry: bool | None = None
    started: bool | None = None
    details: dict[str, Any] | None = None


class ErrorResponse(StrictModel):
    error: ErrorBody


# ── describe() / readiness() ────────────────────────────────────────────────

class WorkerInfo(StrictModel):
    name: str
    version: str
    source_commit: str | None = None


class EngineInfo(StrictModel):
    name: str | None = None
    version: str | None = None
    labeled_stub: bool


class ProfileLimits(StrictModel):
    max_audio_bytes: int
    max_audio_seconds: float
    max_text_code_points: int
    max_output_seconds: float
    speed_min: float
    speed_max: float


class VoicePresetPublic(StrictModel):
    voice_preset_id: IdStr
    voice_revision: str
    language: str
    rights_status: str


class AssetPublic(StrictModel):
    role: str
    sha256: str = Field(pattern=SHA256_PATTERN)


class DeviceInfo(StrictModel):
    configured: str
    effective: str | None = None


class ProfileState(StrictModel):
    configured: bool
    supported: bool
    loaded: bool
    ready: bool
    ready_reason: str | None = None
    qualified: bool
    qualification_note: str


class ProfileDescribe(StrictModel):
    profile_id: IdStr
    profile_revision: str = Field(min_length=1, max_length=128)
    kind: Literal["asr", "tts"]
    engine: str
    languages: list[str]
    accepted_audio_formats: list[str]
    output_formats: list[str]
    limits: ProfileLimits
    max_concurrency: int
    voices: list[VoicePresetPublic]
    assets: list[AssetPublic]
    manifest_sha256: str
    device: DeviceInfo
    state: ProfileState


class Capabilities(StrictModel):
    operations: list[Literal["asr", "tts"]]
    cancel: str
    async_status: bool
    output_fetch: bool
    erase_payload: bool
    text_policy_revision: str | None = None
    asr_glossary: bool = False  # D15: true = engine ของ profile นี้ใช้ AsrInput.glossary จริง


class CapacityInfo(StrictModel):
    max_concurrency: int
    in_use: int


class Residency(StrictModel):
    """``supervisor.snapshot()["residency"]`` — อาจเหลือแค่ ``{"provenance": "unavailable"}`` ก่อน engine ตอบ hello."""

    engine: str | None = None
    model_loaded: bool | None = None
    device: str | None = None
    vram_bytes_allocated: int | None = None
    vram_bytes_reserved: int | None = None
    provenance: str


class DescribeResponse(StrictModel):
    contract_version: Literal["1.0"]
    worker: WorkerInfo
    runtime_id: IdStr
    runtime_epoch: str | None = None
    physical_resource_id: IdStr
    engine: EngineInfo
    profiles: list[ProfileDescribe]
    capabilities: Capabilities
    capacity: CapacityInfo
    residency: Residency
    draining: bool
    observed_at: str
    observation_seq: int


class ReadinessProfileEntry(StrictModel):
    profile_id: IdStr
    profile_revision: str = Field(min_length=1, max_length=128)
    ready: bool
    reason: str | None = None


class ReconcileReport(StrictModel):
    epoch: str
    never_started: int
    unknown: int


class OomLockout(StrictModel):
    """D18: engine ถูก OOM killer ฆ่าติดกันครบเกณฑ์ → worker หยุด restart engine และไม่ ready จนกว่า operator จะ restart"""
    reason: Literal["repeated_oom"]
    consecutive_oom_kills: int
    threshold: int
    since: str
    action: str


class ReadinessResponse(StrictModel):
    ready: bool
    runtime_id: IdStr
    runtime_epoch: str | None = None
    profiles: list[ReadinessProfileEntry]
    engine_alive: bool
    heartbeat_age_seconds: float | None = None
    device: DeviceInfo
    residency: Residency
    draining: bool
    oom_lockout: OomLockout | None = None
    last_reconcile: ReconcileReport | None = None
    observed_at: str
    observation_seq: int


__all__ = [
    "CONTRACT_VERSION",
    "ID_PATTERN",
    "TEXT_POLICY_REVISION",
    "Admission",
    "AssetPublic",
    "AsrEnvelope",
    "AsrInput",
    "AsrResult",
    "CancelDisposition",
    "CancelResponse",
    "Capabilities",
    "CapacityInfo",
    "DescribeResponse",
    "DeviceInfo",
    "EngineInfo",
    "Envelope",
    "ErasePayloadResponse",
    "ErrorBody",
    "ErrorCode",
    "ErrorResponse",
    "ExecutionStatus",
    "OperationError",
    "OperationOutcome",
    "OperationResult",
    "OperationStatus",
    "OomLockout",
    "PayloadState",
    "ProfileDescribe",
    "ProfileLimits",
    "ProfileState",
    "ReadinessProfileEntry",
    "ReadinessResponse",
    "ReconcileReport",
    "Residency",
    "StopEvidence",
    "Target",
    "TtsEnvelope",
    "TtsInput",
    "TtsResult",
    "UsageReport",
    "VoicePresetPublic",
    "WorkerInfo",
    "classify_validation_error",
    "envelope_digest",
    "glossary_prompt",
    "normalize_text",
    "parse_envelope",
]
