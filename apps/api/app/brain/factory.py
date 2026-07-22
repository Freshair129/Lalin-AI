"""Brain factory — สร้าง/สลับ provider ของสมองตอนรันไทม์

เก็บ instance ปัจจุบันไว้ใน module-level state เพื่อให้สลับ cloud ↔ ollama
ได้สดผ่าน /brain/config โดยไม่ต้องรีสตาร์ตเซิร์ฟเวอร์
"""
from __future__ import annotations

from dataclasses import dataclass
from importlib import import_module

from ..config import Settings, get_settings
from .base import LLMProvider
from .ollama_provider import OllamaProvider


@dataclass
class BrainConfig:
    """ค่าที่ override ได้สดตอนรัน (ทับค่าจาก .env)."""

    provider: str | None = None  # "ollama" | "cloud"
    ollama_base_url: str | None = None
    ollama_model: str | None = None
    cloud_provider: str | None = None
    cloud_model: str | None = None
    cloud_api_key: str | None = None


_override = BrainConfig()
_current: LLMProvider | None = None


def _build(settings: Settings) -> LLMProvider:
    provider = _override.provider or settings.brain_provider
    if provider == "ollama":
        return OllamaProvider(
            base_url=_override.ollama_base_url or settings.ollama_base_url,
            model=_override.ollama_model or settings.ollama_model,
        )
    CloudProvider = import_module(".cloud_provider", __package__).CloudProvider
    return CloudProvider(
        provider=_override.cloud_provider or settings.cloud_provider,
        api_key=_override.cloud_api_key or settings.cloud_api_key,
        model=_override.cloud_model or settings.cloud_model,
        base_url=settings.cloud_base_url,
    )


def get_brain() -> LLMProvider:
    """คืนสมองปัจจุบัน (สร้างครั้งแรกแบบ lazy)."""
    global _current
    if _current is None:
        _current = _build(get_settings())
    return _current


def reconfigure(cfg: BrainConfig) -> LLMProvider:
    """อัปเดต override แล้วสร้างสมองใหม่ — ใช้โดย POST /brain/config."""
    global _override, _current
    # อัปเดตเฉพาะฟิลด์ที่ส่งมา (ไม่ใช่ None)
    for f in ("provider", "ollama_base_url", "ollama_model", "cloud_provider", "cloud_model", "cloud_api_key"):
        v = getattr(cfg, f)
        if v is not None:
            setattr(_override, f, v)
    _current = _build(get_settings())
    return _current


def current_summary() -> dict:
    settings = get_settings()
    provider = _override.provider or settings.brain_provider
    if provider == "ollama":
        return {
            "provider": "ollama",
            "model": _override.ollama_model or settings.ollama_model,
            "base_url": _override.ollama_base_url or settings.ollama_base_url,
        }
    return {
        "provider": "cloud",
        "cloud_provider": _override.cloud_provider or settings.cloud_provider,
        "model": _override.cloud_model or settings.cloud_model,
        "has_api_key": bool(_override.cloud_api_key or settings.cloud_api_key),
    }
