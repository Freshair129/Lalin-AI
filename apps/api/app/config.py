"""Application configuration.

ค่าทั้งหมดอ่านจาก environment / ไฟล์ .env ผ่าน pydantic-settings
และยังแก้สดได้ตอนรันผ่าน /brain/config (ดู brain/factory.py)
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BrainProvider = Literal["ollama", "cloud"]
CloudProvider = Literal["anthropic", "openai", "openrouter"]
TtsEngine = Literal["f5", "xtts"]
RuntimeDevice = Literal["auto", "cpu", "cuda"]


def _repo_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / ".git").exists() or (parent / "PRODUCT.md").exists():
            return parent
    return Path(__file__).resolve().parents[2]


def _default_data_dir() -> Path:
    if value := os.getenv("GMUSIC_DATA_DIR"):
        return Path(value)
    return _repo_root() / "runtime" / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # ── Server ──────────────────────────────────────────────
    host: str = "127.0.0.1"
    port: int = 8756
    data_dir: Path = Field(default_factory=_default_data_dir)

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
    asr_device: RuntimeDevice = "auto"
    asr_compute_type: str = "auto"

    tts_engine: TtsEngine = "f5"
    tts_device: RuntimeDevice = "auto"
    f5_model_repo: str = "VIZINTZOR/F5-TTS-THAI"

    # 0 = ยังไม่มี measured budget จึงบังคับเฉพาะ single-GPU FIFO ก่อน
    gpu_min_free_mb: dict[str, int] = Field(
        default_factory=lambda: {"tts": 0, "dubbing": 0, "remix": 0}
    )

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
        if not self.data_dir.is_absolute():
            self.data_dir = (_repo_root() / self.data_dir).resolve()
        for d in (self.uploads_dir, self.outputs_dir, self.voices_dir):
            d.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.ensure_dirs()
    return s
