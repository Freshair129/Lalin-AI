from __future__ import annotations

from importlib import import_module
import sys

from fastapi import APIRouter, Request

from ..brain import current_summary, get_brain
from ..jobs import jobs

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    brain = get_brain()
    return {
        "status": "ok",
        "service": "g-music",
        "brain": await brain.health(),
        "brain_config": current_summary(),
    }


def _system_telemetry() -> dict:
    """Return only probes available in this runtime; unavailable fields stay null."""
    telemetry = {
        "cpu_percent": None,
        "ram_used_bytes": None,
        "ram_total_bytes": None,
        "gpu_name": None,
        "gpu_percent": None,
        "vram_used_bytes": None,
        "vram_total_bytes": None,
    }

    try:
        psutil = import_module("psutil")
        memory = psutil.virtual_memory()
        telemetry["cpu_percent"] = psutil.cpu_percent(interval=None)
        telemetry["ram_used_bytes"] = memory.used
        telemetry["ram_total_bytes"] = memory.total
    except (ImportError, AttributeError):
        pass

    try:
        # Never cold-import torch from a five-second UI poll: the audio pipeline
        # owns loading it and the status bar degrades to N/A until then.
        torch = sys.modules.get("torch")
        if torch is not None and torch.cuda.is_available():
            device = torch.cuda.current_device()
            free_bytes, total_bytes = torch.cuda.mem_get_info(device)
            telemetry["gpu_name"] = torch.cuda.get_device_name(device)
            telemetry["vram_used_bytes"] = total_bytes - free_bytes
            telemetry["vram_total_bytes"] = total_bytes
    except (ImportError, AttributeError, RuntimeError):
        pass

    return telemetry


@router.get("/runtime/status")
async def runtime_status(request: Request):
    """Best-effort UI status. This endpoint has no control-plane side effects."""
    active = next(
        (job for job in reversed(jobs.list()) if job.status in {"queued", "running"}),
        None,
    )
    config = current_summary()
    return {
        "telemetry": _system_telemetry(),
        "runtime": {
            "profile": getattr(request.app.state, "backend_profile", None),
            "model": config.get("model"),
            "agent": "Lalin",
        },
        "activity": {
            "job_id": active.id if active else None,
            "label": active.message or active.kind if active else None,
            "state": active.status if active else None,
            "progress": active.progress if active else None,
        },
    }
