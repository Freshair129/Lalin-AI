# @req FR-19.3 (candidate, CR-005) — engine error → รหัสใน error contract (ไม่ต้องมี speech stack)
"""ขับ ``_Engine.transcribe`` จริงด้วยโมเดลปลอมที่ยก exception ตามที่เจอจริง แล้วตรวจรหัสที่ worker รายงาน

ที่มา: ระหว่าง A/B (2026-09-21) CTranslate2 ยก ``MemoryError("bad allocation")`` (C++ ``std::bad_alloc``)
ทั้งตอนเรียก transcribe และระหว่าง decode — เดิมถูกรายงานเป็น ``RUNTIME_FAILED`` ทั้งที่สัญญามี ``RUNTIME_OOM``
engine module ไม่ import faster_whisper ตอนโหลด จึงรันได้ทั้ง venv หลักและ .venv-speech
"""
from __future__ import annotations

import threading
import time
from types import SimpleNamespace

import pytest

from app.voice_worker.engine_faster_whisper import _Engine, classify_engine_error


def _exc_from_module(module: str, message: str) -> Exception:
    cls = type("ForeignError", (Exception,), {})
    cls.__module__ = module
    return cls(message)


class _Model:
    """แทน WhisperModel: ยกที่ transcribe() (raise_at="call") หรือระหว่างวน segment (raise_at="iterate")"""

    def __init__(self, exc: BaseException, raise_at: str) -> None:
        self.exc, self.raise_at = exc, raise_at

    def transcribe(self, _path, **_kwargs):
        if self.raise_at == "call":
            raise self.exc

        def segments():
            yield SimpleNamespace(start=0.0, end=1.0, text="ส่วนแรก")
            raise self.exc

        return segments(), SimpleNamespace(duration=3.0, language="th")


def _run(tmp_path, exc: BaseException, raise_at: str) -> dict:
    engine = _Engine({"device": "cpu", "compute_type": "int8", "beam_size": 1, "warmup": False})
    engine.model = _Model(exc, raise_at)
    clip = tmp_path / "in.wav"
    clip.write_bytes(b"RIFF")
    return engine.transcribe({"language": "th", "input_path": str(clip)}, threading.Event(), time.monotonic() + 60)


@pytest.mark.parametrize("raise_at", ["call", "iterate"])
def test_bad_alloc_is_reported_as_runtime_oom(tmp_path, raise_at):
    """ข้อความเดียวกับที่เจอจริง: MemoryError('bad allocation') → RUNTIME_OOM ไม่ใช่ RUNTIME_FAILED"""
    result = _run(tmp_path, MemoryError("bad allocation"), raise_at)
    assert result["outcome"] == "FAILED"
    assert result["error"]["code"] == "RUNTIME_OOM"


def test_cuda_oom_message_still_maps_to_runtime_oom(tmp_path):
    result = _run(tmp_path, RuntimeError("CUDA failed with error out of memory"), "iterate")
    assert result["error"]["code"] == "RUNTIME_OOM"


def test_pyav_decode_error_is_audio_format_unsupported(tmp_path):
    result = _run(tmp_path, _exc_from_module("av.error", "Invalid data found when processing input"), "call")
    assert result["error"]["code"] == "AUDIO_FORMAT_UNSUPPORTED"


def test_module_merely_containing_av_is_not_a_decode_error(tmp_path):
    """เดิมเช็ค ``"av" in module`` — โมดูลอย่าง 'java_bridge' หรือ 'savepoint' จะถูกตีเป็นปัญหา format เสียงผิด ๆ"""
    for module in ("java_bridge", "savepoint", "cavity.core"):
        result = _run(tmp_path, _exc_from_module(module, "something unrelated"), "call")
        assert result["error"]["code"] == "RUNTIME_FAILED", module


def test_generic_failure_stays_runtime_failed(tmp_path):
    assert _run(tmp_path, RuntimeError("unexpected"), "iterate")["error"]["code"] == "RUNTIME_FAILED"


@pytest.mark.parametrize(
    "exc, stage, expected",
    [
        (MemoryError(), "thread", "RUNTIME_OOM"),
        (MemoryError("bad allocation"), "decode", "RUNTIME_OOM"),  # OOM ชนะ decode-classification
        (RuntimeError("std::bad_alloc"), "generate", "RUNTIME_OOM"),
        (RuntimeError("decode failed"), "generate", "RUNTIME_FAILED"),  # 'decode' นับเฉพาะตอน stage decode
        (RuntimeError("decode failed"), "decode", "AUDIO_FORMAT_UNSUPPORTED"),
    ],
)
def test_classifier_table(exc, stage, expected):
    assert classify_engine_error(exc, stage=stage) == expected
