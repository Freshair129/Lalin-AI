"""Explicit resource classification for background job call sites."""
from __future__ import annotations

from collections.abc import Callable, Mapping
import subprocess
import sys
from typing import Protocol

from ..runtime_devices import Device, DeviceResolution


class ResourceJob(Protocol):
    kind: str


class GpuAdmissionError(RuntimeError):
    """A GPU probe cannot run, rather than merely finding insufficient VRAM."""


def resource_for_device(resolution: DeviceResolution) -> str:
    return "gpu" if resolution.effective == "cuda" else "cpu"


def resource_for_requested_device(
    requested: Device,
    *,
    resolve_auto: Callable[[], DeviceResolution],
) -> str:
    """Classify explicit devices without failing before the durable job exists."""
    if requested == "cuda":
        return "gpu"
    if requested == "cpu":
        return "cpu"
    return resource_for_device(resolve_auto())


def automatic_torch_resource() -> str:
    try:
        import torch

        return "gpu" if torch.cuda.is_available() else "cpu"
    except (ImportError, AttributeError, RuntimeError):
        return "cpu"


def has_required_vram(
    job: ResourceJob,
    *,
    minimum_mb: Mapping[str, int],
    mem_get_info: Callable[[], tuple[int, int]],
) -> bool:
    required_mb = max(0, minimum_mb.get(job.kind, 0))
    if required_mb == 0:
        return True
    free_bytes, _total_bytes = mem_get_info()
    return free_bytes >= required_mb * 1024 * 1024


def configured_gpu_probe(job: ResourceJob) -> bool:
    from ..config import get_settings

    thresholds = get_settings().gpu_min_free_mb
    kind = "remix" if job.kind == "music-remix-preview" else job.kind
    minimum = max(0, thresholds.get(kind, 0))
    if minimum == 0:
        return True
    if getattr(sys, "frozen", False) and kind == "remix":
        free = external_remix_free_vram()
        if free is None:
            raise GpuAdmissionError("ตรวจ GPU ไม่ได้ — ตรวจ GMUSIC_DEMUCS_PYTHON และติดตั้ง torch ที่รองรับ CUDA")
        return free >= minimum * 1024 * 1024
    try:
        import torch

        if not torch.cuda.is_available():
            return False
        return has_required_vram(
            job,
            minimum_mb={job.kind: minimum},
            mem_get_info=lambda: torch.cuda.mem_get_info(torch.cuda.current_device()),
        )
    except (ImportError, AttributeError, RuntimeError):
        return False


def external_remix_free_vram() -> int | None:
    from ..utils.external_python import demucs_python, RESET_DLL_SEARCH

    python = demucs_python()
    if not python:
        return None
    code = RESET_DLL_SEARCH + "import torch; print(torch.cuda.mem_get_info()[0] if torch.cuda.is_available() else -1)"
    try:
        result = subprocess.run([python, "-c", code], capture_output=True, text=True, timeout=30, check=True)
        value = int(result.stdout.strip())
        return value if value >= 0 else None
    except (OSError, ValueError, subprocess.SubprocessError):
        return None
