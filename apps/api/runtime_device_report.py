"""Report workstation CPU/GPU runtime readiness for G-Music."""
from __future__ import annotations

import importlib.util
import json
import platform
import sys

from app.config import get_settings


def module_available(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def main() -> int:
    settings = get_settings()
    report: dict = {
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "settings": {
            "asr_device": settings.asr_device,
            "asr_compute_type": settings.asr_compute_type,
            "tts_device": settings.tts_device,
        },
        "modules": {
            name: module_available(name)
            for name in ("torch", "ctranslate2", "faster_whisper", "f5_tts", "demucs")
        },
        "strategy": {
            "lite_installer": "CPU-safe shell sidecar; does not bundle ML-heavy routers or model weights",
            "workstation_default": "Prefer CUDA when the local speech runtime is known-good",
            "speech_fallback": "Use ASR_DEVICE=cpu ASR_COMPUTE_TYPE=int8 TTS_DEVICE=cpu for deterministic smoke/fallback",
            "user_choice_required": True,
        },
    }

    torch_cuda_available = False
    try:
        import torch

        torch_cuda_available = torch.cuda.is_available()
        report["torch"] = {
            "version": torch.__version__,
            "cuda_available": torch_cuda_available,
            "cuda_version": torch.version.cuda,
            "device_count": torch.cuda.device_count(),
            "device_name": torch.cuda.get_device_name(0) if torch_cuda_available else None,
        }
    except Exception as exc:  # noqa: BLE001
        report["torch_error"] = repr(exc)

    ctranslate2_cuda_device_count = 0
    try:
        import ctranslate2

        ctranslate2_cuda_device_count = ctranslate2.get_cuda_device_count()
        report["ctranslate2"] = {
            "version": ctranslate2.__version__,
            "cuda_device_count": ctranslate2_cuda_device_count,
        }
    except Exception as exc:  # noqa: BLE001
        report["ctranslate2_error"] = repr(exc)

    missing = [name for name, present in report["modules"].items() if not present]
    runtime_errors = []
    if settings.tts_device == "cuda" and not torch_cuda_available:
        runtime_errors.append("TTS_DEVICE is cuda but torch.cuda.is_available() is false")
    if settings.asr_device == "cuda" and ctranslate2_cuda_device_count < 1:
        runtime_errors.append("ASR_DEVICE is cuda but CTranslate2 reports no CUDA devices")

    report["missing_modules"] = missing
    report["runtime_errors"] = runtime_errors
    print(json.dumps(report, ensure_ascii=False, indent=2))

    if missing:
        print("FAIL: missing runtime modules: " + ", ".join(missing), file=sys.stderr)
        return 1
    if runtime_errors:
        print("FAIL: runtime configuration errors: " + "; ".join(runtime_errors), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
