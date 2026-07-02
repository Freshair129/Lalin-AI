"""Pydantic request/response models for the API."""
from __future__ import annotations

from pydantic import BaseModel, Field


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


# ── Dubbing ─────────────────────────────────────────────────
class DubbingRequest(BaseModel):
    source_audio: str = Field(description="ชื่อไฟล์ใน uploads/ ที่จะถอด+พากย์")
    voice_id: str | None = None
    target_lang: str = "ไทย"
    translate: bool = True
    source_lang: str | None = None


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
    do_fx: bool = True
    offset_ms: float | None = Field(
        default=None, description="เลื่อนเสียงร้อง (ms); None = หา phase อัตโนมัติ"
    )
    reverb: float = 0.16
    delay: float = 0.12
    stem_gains: dict[str, float] | None = Field(
        default=None, description="gain ต่อ stem (vocals/drums/bass/other); None = ข้าม 4-stem"
    )


# ── Jobs ────────────────────────────────────────────────────
class JobResponse(BaseModel):
    id: str
    kind: str
    status: str
    progress: float
    message: str
    result: dict | None = None
    error: str | None = None
