"""Explicit resource classification for background job call sites."""
from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Protocol

from ..runtime_devices import Device, DeviceResolution


class ResourceJob(Protocol):
    kind: str


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
    if max(0, thresholds.get(job.kind, 0)) == 0:
        return True
    try:
        import torch

        if not torch.cuda.is_available():
            return False
        return has_required_vram(
            job,
            minimum_mb=thresholds,
            mem_get_info=lambda: torch.cuda.mem_get_info(torch.cuda.current_device()),
        )
    except (ImportError, AttributeError, RuntimeError):
        return False
