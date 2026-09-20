"""Admission + input checks ก่อน compute — LVP-REQ-011/013/015/017/018/022.

envelope ถือเป็นคำรับรองจาก coordinator ที่ authenticate แล้ว (D3); worker ตรวจเฉพาะ local invariants:
target ตรง runtime จริง, epoch ปัจจุบัน, profile ตรง, start window/deadline ยังใช้ได้, input อยู่ในขอบเขต profile
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from .contract import AsrEnvelope, TtsEnvelope, normalize_text
from .errors import WorkerError
from .profile import ProfileManifest


def check_target(envelope: AsrEnvelope | TtsEnvelope, manifest: ProfileManifest, current_epoch: str | None) -> None:
    target = envelope.target
    if target.runtime_id != manifest.runtime_id:
        raise WorkerError("TARGET_MISMATCH", "runtime_id does not match this worker", attempt_id=envelope.attempt_id, started=False,
                          details={"reason": "runtime_id"})
    if target.physical_resource_id != manifest.physical_resource_id:
        raise WorkerError("TARGET_MISMATCH", "physical_resource_id does not match this worker's bound resource", attempt_id=envelope.attempt_id,
                          started=False, details={"reason": "physical_resource_id"})
    if current_epoch is None or target.runtime_epoch != current_epoch:
        raise WorkerError("TARGET_MISMATCH", "runtime_epoch is stale; requalify before dispatch", attempt_id=envelope.attempt_id, started=False,
                          details={"reason": "stale_epoch", "current_epoch": current_epoch})
    if envelope.kind != manifest.kind:
        raise WorkerError("PROFILE_MISMATCH", "operation kind is not served by this profile", attempt_id=envelope.attempt_id, started=False,
                          details={"reason": "kind", "profile_kind": manifest.kind})
    if target.profile_id != manifest.profile_id or target.profile_revision != manifest.profile_revision:
        raise WorkerError("PROFILE_MISMATCH", "profile_id/profile_revision do not match the loaded profile", attempt_id=envelope.attempt_id,
                          started=False, details={"reason": "profile", "profile_id": manifest.profile_id, "profile_revision": manifest.profile_revision})


def check_window(envelope: AsrEnvelope | TtsEnvelope, now: datetime, skew_tolerance: timedelta) -> float:
    """คืน remaining budget (วินาที) จาก deadline_at; หมดอายุ → DEADLINE_EXCEEDED started=false."""
    admission = envelope.admission
    if admission.deadline_at <= now:
        raise WorkerError("DEADLINE_EXCEEDED", "deadline_at already passed at receipt", attempt_id=envelope.attempt_id, started=False,
                          execution_status=None, safe_to_retry=True, details={"reason": "deadline_passed"})
    if admission.start_before + skew_tolerance < now:
        raise WorkerError("DEADLINE_EXCEEDED", "start window expired before the worker could admit the attempt", attempt_id=envelope.attempt_id,
                          started=False, execution_status=None, safe_to_retry=True, details={"reason": "start_window_expired"})
    if admission.deadline_at < admission.start_before:
        raise WorkerError("INVALID_REQUEST", "deadline_at precedes start_before", attempt_id=envelope.attempt_id, started=False)
    return (admission.deadline_at - now).total_seconds()


def check_asr_input(envelope: AsrEnvelope, manifest: ProfileManifest) -> None:
    inp = envelope.input
    if inp.language not in manifest.languages:
        raise WorkerError("LANGUAGE_UNSUPPORTED", "language hint is not qualified for this profile", attempt_id=envelope.attempt_id, started=False,
                          details={"supported_languages": list(manifest.languages)})
    if inp.declared_mime_type.split(";")[0].strip().lower() not in manifest.accepted_audio_formats:
        raise WorkerError("AUDIO_FORMAT_UNSUPPORTED", "declared audio format is not accepted by this profile", attempt_id=envelope.attempt_id,
                          started=False, details={"accepted_audio_formats": list(manifest.accepted_audio_formats)})
    if inp.audio_bytes > manifest.limits.max_audio_bytes:
        raise WorkerError("AUDIO_TOO_LARGE", "declared audio size exceeds the profile limit", attempt_id=envelope.attempt_id, started=False,
                          details={"max_audio_bytes": manifest.limits.max_audio_bytes})


def check_tts_input(envelope: TtsEnvelope, manifest: ProfileManifest) -> dict[str, Any]:
    """ตรวจ preset/format/speed/ความยาวข้อความ; คืน normalized parameters สำหรับ engine."""
    inp = envelope.input
    voice = manifest.voice(inp.voice_preset_id, inp.voice_revision)
    if voice is None:
        raise WorkerError("VOICE_NOT_APPROVED", "voice preset/revision is not approved for this profile", attempt_id=envelope.attempt_id,
                          started=False, details={"approved_voices": [v.public() for v in manifest.voices]})
    if inp.response_format not in manifest.output_formats:
        raise WorkerError("UNSUPPORTED_PARAMETER", "response_format is not offered by this profile", attempt_id=envelope.attempt_id, started=False,
                          details={"output_formats": list(manifest.output_formats)})
    speed = 1.0 if inp.speed is None else float(inp.speed)
    if not (manifest.limits.speed_min <= speed <= manifest.limits.speed_max):
        raise WorkerError("INVALID_REQUEST", "speed is outside the qualified range", attempt_id=envelope.attempt_id, started=False,
                          details={"speed_min": manifest.limits.speed_min, "speed_max": manifest.limits.speed_max})
    normalized = normalize_text(inp.text)
    if not normalized:
        raise WorkerError("INVALID_REQUEST", "text is empty after normalization", attempt_id=envelope.attempt_id, started=False)
    if len(normalized) > manifest.limits.max_text_code_points:
        raise WorkerError("INVALID_REQUEST", "text exceeds the profile code-point limit after normalization", attempt_id=envelope.attempt_id,
                          started=False, details={"max_text_code_points": manifest.limits.max_text_code_points, "code_points": len(normalized)})
    return {
        "text": normalized,
        "text_code_points": len(normalized),
        "language": voice.language,
        "voice_preset_id": voice.preset_id,
        "voice_revision": voice.revision,
        "ref_text": voice.ref_text,
        "ref_audio": voice.ref_audio,
        "speed": speed,
        "response_format": inp.response_format,
    }


__all__ = ["check_asr_input", "check_target", "check_tts_input", "check_window"]
