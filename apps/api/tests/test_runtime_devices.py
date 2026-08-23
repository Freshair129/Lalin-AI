"""G-09 — requested/effective device resolution without boot-time ML imports."""
from __future__ import annotations

import pytest


def test_auto_falls_back_to_cpu_when_cuda_is_unavailable():
    from app.runtime_devices import resolve_device

    resolved = resolve_device("auto", cuda_available=lambda: False)

    assert resolved.effective == "cpu"
    assert resolved.fallback is True
    assert resolved.reason == "cuda_unavailable"


def test_explicit_cuda_fails_clearly_when_cuda_is_unavailable():
    from app.runtime_devices import DeviceUnavailableError, resolve_device

    with pytest.raises(DeviceUnavailableError, match="ตั้งค่าอุปกรณ์เป็น CUDA"):
        resolve_device("cuda", cuda_available=lambda: False)


def test_asr_compute_type_follows_effective_device():
    from app.runtime_devices import asr_compute_type

    assert asr_compute_type("cpu") == "int8"
    assert asr_compute_type("cuda") == "float16"


def test_settings_default_to_auto_devices(monkeypatch, tmp_path):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.delenv("ASR_DEVICE", raising=False)
    monkeypatch.delenv("TTS_DEVICE", raising=False)
    from app.config import Settings

    settings = Settings(_env_file=None)

    assert settings.asr_device == "auto"
    assert settings.tts_device == "auto"


def test_runtime_status_reports_unresolved_devices_without_importing_torch(client, monkeypatch):
    import sys
    from app.runtime_devices import device_registry

    device_registry.reset()
    monkeypatch.delitem(sys.modules, "torch", raising=False)

    response = client.get("/runtime/status")

    assert response.status_code == 200
    assert response.json()["runtime"]["devices"] == {
        "tts": {"requested": "auto", "effective": None, "fallback": False, "reason": None},
        "asr": {"requested": "auto", "effective": None, "fallback": False, "reason": None,
                "compute_type": None},
    }
    assert "torch" not in sys.modules


def test_resolving_asr_records_cpu_int8_in_runtime_registry():
    from app.runtime_devices import device_registry, resolve_asr_runtime

    device_registry.reset()
    resolved, compute_type = resolve_asr_runtime("auto", cuda_available=lambda: False)

    assert resolved.effective == "cpu"
    assert compute_type == "int8"
    assert device_registry.snapshot(tts_requested="auto", asr_requested="auto")["asr"] == {
        "requested": "auto",
        "effective": "cpu",
        "fallback": True,
        "reason": "cuda_unavailable",
        "compute_type": "int8",
    }


def test_tts_pipeline_passes_effective_cpu_to_f5(monkeypatch):
    import sys
    import types
    from app.config import get_settings
    from app.pipelines import tts
    from app.runtime_devices import device_registry

    captured: dict[str, object] = {}

    class FakeF5:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    torch = types.ModuleType("torch")
    torch.cuda = types.SimpleNamespace(is_available=lambda: False)
    cached = types.ModuleType("cached_path")
    cached.cached_path = lambda value: value
    f5_pkg = types.ModuleType("f5_tts")
    f5_api = types.ModuleType("f5_tts.api")
    f5_api.F5TTS = FakeF5
    monkeypatch.setitem(sys.modules, "torch", torch)
    monkeypatch.setitem(sys.modules, "cached_path", cached)
    monkeypatch.setitem(sys.modules, "f5_tts", f5_pkg)
    monkeypatch.setitem(sys.modules, "f5_tts.api", f5_api)
    monkeypatch.setattr(get_settings(), "tts_device", "auto")
    monkeypatch.setattr(tts, "_f5", None)
    device_registry.reset()

    tts._get_f5()

    assert captured["device"] == "cpu"


def test_asr_pipeline_passes_cpu_int8_to_faster_whisper(monkeypatch):
    import sys
    import types
    from app.config import get_settings
    from app.pipelines import asr
    from app.runtime_devices import device_registry

    captured: dict[str, object] = {}

    class FakeWhisper:
        def __init__(self, model_name, **kwargs):
            captured.update({"model_name": model_name, **kwargs})

    ctranslate2 = types.ModuleType("ctranslate2")
    ctranslate2.get_cuda_device_count = lambda: 0
    faster_whisper = types.ModuleType("faster_whisper")
    faster_whisper.WhisperModel = FakeWhisper
    monkeypatch.setitem(sys.modules, "ctranslate2", ctranslate2)
    monkeypatch.setitem(sys.modules, "faster_whisper", faster_whisper)
    monkeypatch.setattr(get_settings(), "asr_device", "auto")
    monkeypatch.setattr(asr, "_model", None)
    monkeypatch.setattr(asr, "_model_name", None)
    device_registry.reset()

    asr._get_model()

    assert captured["device"] == "cpu"
    assert captured["compute_type"] == "int8"
