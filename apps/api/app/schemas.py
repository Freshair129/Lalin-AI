"""Pydantic request/response models for the API."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


# ── Brain ───────────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str = Field(pattern="^(system|user|assistant)$")
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    temperature: float = 0.7
    max_tokens: int = 2048
    stream: bool = False


class BrainConfigRequest(BaseModel):
    provider: str | None = Field(default=None, description="ollama | cloud")
    ollama_base_url: str | None = None
    ollama_model: str | None = None
    cloud_provider: str | None = Field(default=None, description="anthropic | openai | openrouter")
    cloud_model: str | None = None
    cloud_api_key: str | None = None


class TranslateRequest(BaseModel):
    text: str
    target_lang: str = "ไทย"
    source_lang: str | None = None


# ── TTS / Voice clone ───────────────────────────────────────
class TTSRequest(BaseModel):
    text: str
    voice_id: str | None = Field(
        default=None, description="id ของเสียงในคลัง (voices/) ถ้าเว้นว่างใช้เสียงเริ่มต้น"
    )
    language: str = "th"  # th | en
    speed: float = 1.0
    release_gpu_model: bool = Field(
        default=False,
        description="ล้างโมเดล TTS ที่งานนี้โหลดเองหลังสังเคราะห์ และคืน receipt ในผล job",
    )


# ── Dubbing ─────────────────────────────────────────────────
class DubbingRequest(BaseModel):
    source_audio: str = Field(description="ชื่อไฟล์ใน uploads/ ที่จะถอด+พากย์")
    voice_id: str | None = None
    target_lang: str = "ไทย"
    translate: bool = True
    source_lang: str | None = None


class DubbingSegmentSpeaker(BaseModel):
    segment_id: str = Field(min_length=1, max_length=128)
    speaker_id: str = Field(
        min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$"
    )


class DubbingSpeakerVoice(BaseModel):
    speaker_id: str = Field(
        min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$"
    )
    voice_id: str = Field(
        min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$"
    )


class DubbingRenderRequest(BaseModel):
    analysis_job_id: str = Field(min_length=1, max_length=128)
    segment_speakers: list[DubbingSegmentSpeaker] = Field(
        min_length=1, max_length=10000
    )
    speaker_voices: list[DubbingSpeakerVoice] = Field(min_length=1, max_length=32)
    target_lang: str = "ไทย"
    translate: bool = True


class DubbingClipExportRequest(BaseModel):
    analysis_job_id: str = Field(min_length=1, max_length=128)
    segment_ids: list[str] = Field(min_length=1, max_length=1000)


class DubbingVoiceoverRequest(BaseModel):
    analysis_job_id: str = Field(min_length=1, max_length=128)
    segment_ids: list[str] = Field(min_length=1, max_length=100)
    segment_speakers: list[DubbingSegmentSpeaker] = Field(min_length=1, max_length=100)
    speaker_voices: list[DubbingSpeakerVoice] = Field(min_length=1, max_length=32)
    target_lang: str = "ไทย"
    translate: bool = True


# ── Mastering ───────────────────────────────────────────────
class MasteringRequest(BaseModel):
    source_audio: str = Field(description="ชื่อไฟล์ใน uploads/")
    reference_audio: str | None = Field(
        default=None, description="เพลงอ้างอิงใน uploads/ (Matchering); เว้นว่าง = master อัตโนมัติ"
    )
    target_lufs: float = -14.0  # มาตรฐาน streaming
    target_format: str = "wav"  # wav | mp3


# ── Music remix (Suno finishing studio) ─────────────────────
class RemixRequest(BaseModel):
    source_audio: str = Field(description="เพลง/เดโม่มีเสียงร้องใน uploads/ (mp3/mp4/wav)")
    beat_audio: str = Field(description="beat ปลายทางใน uploads/ (mp3/mp4/wav)")
    target_lufs: float = -14.0
    do_autotune: bool = True
    autotune_strength: float = 1.0
    key_override: str | None = None
    do_fx: bool = True
    phrase_bars: int = 0
    beats_per_bar: int = Field(default=4, ge=1, le=16)
    offset_ms: float | None = Field(
        default=None, description="เลื่อนเสียงร้อง (ms); None = หา phase อัตโนมัติ"
    )
    reverb: float = 0.16
    delay: float = 0.12
    stem_gains: dict[str, float] | None = Field(
        default=None, description="gain ต่อ stem (vocals/drums/bass/other); None = ข้าม 4-stem"
    )
    preview_id: str | None = None
    preview_revision: int | None = Field(default=None, ge=1)
    map_digest: str | None = None
    accept_warp: bool = False
    window_bars: int = Field(default=4, ge=1, le=64)
    hop_bars: int = Field(default=2, ge=1, le=63)


class RemixPreviewRenderSettings(BaseModel):
    target_lufs: float = -14.0
    do_autotune: bool = True
    autotune_strength: float = 1.0
    key_override: str | None = None
    do_fx: bool = True
    reverb: float = 0.16
    delay: float = 0.12
    stem_gains: dict[str, float] | None = None


class RemixPreviewRequest(BaseModel):
    contract_version: Literal[1] = 1
    source_audio: str
    beat_audio: str
    phrase_bars: int = Field(default=0, ge=0, le=64)
    beats_per_bar: int = Field(default=4, ge=1, le=16)
    offset_mode: Literal["auto", "manual"] = "auto"
    offset_ms: float | None = None
    warp_mode: Literal["off", "suggest", "manual"] = "suggest"
    window_bars: int = Field(default=4, ge=1, le=64)
    hop_bars: int = Field(default=2, ge=1, le=63)
    render_settings: RemixPreviewRenderSettings = Field(default_factory=RemixPreviewRenderSettings)
    preview_id: str | None = None
    base_revision: int | None = Field(default=None, ge=1)
    anchors: list[dict] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_preview_contract(self):
        if self.hop_bars >= self.window_bars:
            raise ValueError("hop_bars must be less than window_bars")
        if self.offset_mode == "manual" and self.offset_ms is None:
            raise ValueError("manual offset requires offset_ms")
        if self.offset_mode == "auto" and self.offset_ms is not None:
            raise ValueError("auto offset must omit offset_ms")
        if self.preview_id is None and self.warp_mode == "manual":
            raise ValueError("manual warp requires preview_id and base_revision")
        if self.preview_id is not None and self.base_revision is None:
            raise ValueError("preview revision requires base_revision")
        if self.warp_mode == "manual" and not self.anchors:
            raise ValueError("manual warp requires anchors")
        return self


# ── Jobs ────────────────────────────────────────────────────
class JobResponse(BaseModel):
    id: str
    kind: str
    status: str
    progress: float
    message: str
    result: dict | None = None
    error: str | None = None
