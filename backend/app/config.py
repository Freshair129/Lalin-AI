"""Application configuration.

ค่าทั้งหมดอ่านจาก environment / ไฟล์ .env ผ่าน pydantic-settings
และยังแก้สดได้ตอนรันผ่าน /brain/config (ดู brain/factory.py)
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BrainProvider = Literal["ollama", "cloud"]
CloudProvider = Literal["anthropic", "openai", "openrouter"]
TtsEngine = Literal["f5", "xtts"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # ── Server ──────────────────────────────────────────────
    host: str = "127.0.0.1"
    port: int = 8756
    data_dir: Path = Path("./data")

    # ── Brain ───────────────────────────────────────────────
    brain_provider: BrainProvider = "ollama"

    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1"

    cloud_provider: CloudProvider = "anthropic"
    cloud_api_key: str = ""
    cloud_model: str = "claude-opus-4-8"
    cloud_base_url: str | None = None

    # ── Speech ──────────────────────────────────────────────
    asr_model: str = "large-v3"
    asr_device: str = "cuda"
    asr_compute_type: str = "float16"

    tts_engine: TtsEngine = "f5"
    tts_device: str = "cuda"
    f5_model_repo: str = "VIZINTZOR/F5-TTS-THAI"

    # ── derived paths ───────────────────────────────────────
    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def outputs_dir(self) -> Path:
        return self.data_dir / "outputs"

    @property
    def voices_dir(self) -> Path:
        """คลังเสียงที่ผู้ใช้บันทึกไว้ (reference สำหรับ clone)."""
        return self.data_dir / "voices"

    def ensure_dirs(self) -> None:
        for d in (self.uploads_dir, self.outputs_dir, self.voices_dir):
            d.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.ensure_dirs()
    return s
