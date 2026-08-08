"""ASR — ถอดเสียงเป็นข้อความ + timestamp ด้วย faster-whisper

ใช้ในไปป์ไลน์ dubbing: ถอดเสียงต้นฉบับออกมาเป็นช่วง ๆ (segments) พร้อมเวลา
แล้วค่อยส่งให้สมองแปลและให้ TTS พากย์ทับตามจังหวะเดิม

โหลดโมเดลแบบ lazy + cache ไว้ (โหลดครั้งเดียวต่อโปรเซส)
"""
# @req FR-03 — ASR segments + timestamps + language detect (FR-03.2/03.3)
from __future__ import annotations

from dataclasses import dataclass, field

from ..config import get_settings

_model = None  # cached WhisperModel


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
    global _model
    if _model is None:
        try:
            from faster_whisper import WhisperModel
        except ImportError as e:  # noqa: BLE001
            raise RuntimeError(
                "ยังไม่ได้ติดตั้ง faster-whisper — รัน scripts/setup_windows.ps1 ก่อน"
            ) from e
        s = get_settings()
        _model = WhisperModel(
            s.asr_model, device=s.asr_device, compute_type=s.asr_compute_type
        )
    return _model


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
