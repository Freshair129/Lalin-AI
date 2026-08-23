"""Resolve requested ML devices lazily when a pipeline starts."""
from __future__ import annotations

from dataclasses import dataclass
from threading import Lock
from typing import Callable, Literal

Device = Literal["auto", "cpu", "cuda"]


class DeviceUnavailableError(RuntimeError):
    """Raised when an explicitly requested accelerator is unavailable."""


@dataclass(frozen=True)
class DeviceResolution:
    requested: Device
    effective: Literal["cpu", "cuda"]
    fallback: bool = False
    reason: str | None = None


def resolve_device(requested: Device, *, cuda_available: Callable[[], bool]) -> DeviceResolution:
    """Resolve ``auto`` without importing an ML runtime in this module."""
    if requested == "auto":
        if cuda_available():
            return DeviceResolution(requested=requested, effective="cuda")
        return DeviceResolution(
            requested=requested,
            effective="cpu",
            fallback=True,
            reason="cuda_unavailable",
        )
    if requested == "cuda" and not cuda_available():
        raise DeviceUnavailableError(
            "ตั้งค่าอุปกรณ์เป็น CUDA แต่ระบบไม่พบ GPU/CUDA ที่พร้อมใช้งาน "
            "— เปลี่ยนค่าเป็น auto หรือ cpu แล้วลองใหม่"
        )
    return DeviceResolution(requested=requested, effective=requested)


def asr_compute_type(effective_device: Literal["cpu", "cuda"]) -> str:
    return "int8" if effective_device == "cpu" else "float16"


class DeviceRegistry:
    """Process-local record of devices resolved by lazy ML pipelines."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._resolved: dict[str, tuple[DeviceResolution, str | None]] = {}

    def reset(self) -> None:
        with self._lock:
            self._resolved.clear()

    def record(self, engine: Literal["tts", "asr"], resolution: DeviceResolution,
               *, compute_type: str | None = None) -> None:
        with self._lock:
            self._resolved[engine] = (resolution, compute_type)

    def snapshot(self, *, tts_requested: Device, asr_requested: Device) -> dict:
        with self._lock:
            values = dict(self._resolved)

        def item(engine: str, requested: Device) -> dict:
            current = values.get(engine)
            if current is None:
                result = {
                    "requested": requested,
                    "effective": None,
                    "fallback": False,
                    "reason": None,
                }
                if engine == "asr":
                    result["compute_type"] = None
                return result
            resolution, compute_type = current
            result = {
                "requested": resolution.requested,
                "effective": resolution.effective,
                "fallback": resolution.fallback,
                "reason": resolution.reason,
            }
            if engine == "asr":
                result["compute_type"] = compute_type
            return result

        return {
            "tts": item("tts", tts_requested),
            "asr": item("asr", asr_requested),
        }


device_registry = DeviceRegistry()


def _torch_cuda_available() -> bool:
    try:
        import torch

        return bool(torch.cuda.is_available())
    except (ImportError, AttributeError, RuntimeError):
        return False


def _ctranslate2_cuda_available() -> bool:
    try:
        import ctranslate2

        return ctranslate2.get_cuda_device_count() > 0
    except (ImportError, AttributeError, RuntimeError):
        return False


def resolve_tts_runtime(
    requested: Device,
    *,
    cuda_available: Callable[[], bool] = _torch_cuda_available,
) -> DeviceResolution:
    resolution = resolve_device(requested, cuda_available=cuda_available)
    device_registry.record("tts", resolution)
    return resolution


def resolve_asr_runtime(
    requested: Device,
    *,
    cuda_available: Callable[[], bool] = _ctranslate2_cuda_available,
) -> tuple[DeviceResolution, str]:
    resolution = resolve_device(requested, cuda_available=cuda_available)
    compute_type = asr_compute_type(resolution.effective)
    device_registry.record("asr", resolution, compute_type=compute_type)
    return resolution, compute_type
