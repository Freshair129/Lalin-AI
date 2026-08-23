"""ASR — ถอดเสียงเป็นข้อความ + timestamp ด้วย faster-whisper

ใช้ในไปป์ไลน์ dubbing: ถอดเสียงต้นฉบับออกมาเป็นช่วง ๆ (segments) พร้อมเวลา
แล้วค่อยส่งให้สมองแปลและให้ TTS พากย์ทับตามจังหวะเดิม

โหลดโมเดลแบบ lazy + cache ไว้ (โหลดครั้งเดียวต่อโปรเซส)
"""
# @req FR-03 — ASR segments + timestamps + language detect (FR-03.2/03.3)
# @req NFR-01 — เป้าความเร็ว transcription <= 0.5x realtime (NFR-01.3)
from __future__ import annotations

from dataclasses import dataclass, field

from ..config import get_settings
from ..runtime_devices import resolve_asr_runtime

_model = None  # cached WhisperModel
_model_name: str | None = None


@dataclass
class Segment:
    start: float
    end: float
    text: str


@dataclass
class Transcript:
    language: str
    duration: float
    segments: list[Segment] = field(default_factory=list)

    @property
    def text(self) -> str:
        return " ".join(s.text.strip() for s in self.segments)


def _get_model():
    global _model, _model_name
    s = get_settings()
    if _model is None or _model_name != s.asr_model:
        try:
            from faster_whisper import WhisperModel
        except ImportError as e:  # noqa: BLE001
            raise RuntimeError(
                "ยังไม่ได้ติดตั้ง faster-whisper — รัน scripts/setup_windows.ps1 ก่อน"
            ) from e
        resolution, compute_type = resolve_asr_runtime(s.asr_device)
        _model = WhisperModel(
            s.asr_model, device=resolution.effective, compute_type=compute_type
        )
        _model_name = s.asr_model
    return _model


def set_model(name: str) -> None:
    """Select the model for the next transcription and release the cached instance."""
    global _model, _model_name
    settings = get_settings()
    settings.asr_model = name
    _model = None
    _model_name = None


def transcribe(audio_path: str, language: str | None = None) -> Transcript:
    """ถอดเสียงเป็น Transcript (sync; เรียกผ่าน run_in_executor ใน job)."""
    model = _get_model()
    segments, info = model.transcribe(
        audio_path,
        language=language,  # None = ตรวจภาษาอัตโนมัติ (รองรับ th/en)
        vad_filter=True,    # ตัดช่วงเงียบ ช่วยให้ timestamp คมขึ้น
        word_timestamps=False,
    )
    segs = [Segment(start=s.start, end=s.end, text=s.text) for s in segments]
    return Transcript(
        language=info.language, duration=info.duration, segments=segs
    )
