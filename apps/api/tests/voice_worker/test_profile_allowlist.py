# @req FR-19.1/FR-19.2 (candidate) — LVP-AT-001/002: fail-closed entrypoint + route allowlist
"""worker ต้อง mount เฉพาะ allowlist, ไม่มี CORS/docs, และ profile ผิด/หาย → exit non-zero ไม่ fallback เป็น full"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import pytest

from app.voice_worker.app import ROUTE_ALLOWLIST, registered_routes
from app.voice_worker.profile import ProfileError, load_manifest

from .conftest import INFERENCE_TOKEN, ISSUER, write_manifest

STUDIO_PREFIXES = ("/brain", "/fs", "/files", "/projects", "/plugins", "/packs", "/voices", "/speech", "/tts",
                   "/dubbing", "/mastering", "/music", "/render", "/jobs", "/agent", "/runtime", "/docs", "/openapi.json", "/redoc")


def test_registered_routes_match_allowlist_exactly(worker_factory):
    worker = worker_factory("asr")
    routes = registered_routes(worker.client.app)
    assert routes == set(ROUTE_ALLOWLIST)
    for _method, path in routes:
        assert path == "/health/live" or path.startswith("/worker/v1/")
        assert not any(path == prefix or path.startswith(prefix + "/") for prefix in STUDIO_PREFIXES), path
    assert ("GET", "/health") not in routes  # Studio /health (มี brain) ต้องไม่โผล่


def test_no_cors_middleware_and_no_docs(worker_factory):
    worker = worker_factory("asr")
    middleware_names = [m.cls.__name__ for m in worker.client.app.user_middleware]
    assert not any("CORS" in name for name in middleware_names), middleware_names
    for path in ("/docs", "/openapi.json", "/redoc"):
        assert worker.client.get(path).status_code == 404, path


def _clear_worker_env(monkeypatch):
    for key in list(os.environ):
        if key.startswith("LALIN_VOICE_WORKER_"):
            monkeypatch.delenv(key, raising=False)


def test_missing_profile_fails_closed_without_starting_server(monkeypatch):
    from app.voice_worker.__main__ import EXIT_CONFIG_ERROR, main

    _clear_worker_env(monkeypatch)
    monkeypatch.setenv("GMUSIC_BACKEND_PROFILE", "voice-worker")  # env ของ Studio ต้องไม่มีผลใด ๆ
    calls: list[dict] = []
    assert main(run_server=lambda *a, **kw: calls.append(kw)) == EXIT_CONFIG_ERROR
    assert calls == []


@pytest.mark.parametrize(
    "overrides, message_part",
    [
        ({"device": "auto"}, "auto"),
        ({"engine": "f5"}, "allowlist"),
        ({"kind": "tts", "voices": [{"voice_preset_id": "p", "voice_revision": "r1", "language": "th", "ref_text": "   ", "rights_status": "approved"}],
          "languages": ["th"]}, "ref_text"),
        ({"kind": "tts", "voices": [{"voice_preset_id": "p", "voice_revision": "r1", "language": "th", "ref_text": "x", "rights_status": "unknown"}],
          "languages": ["th"]}, "rights_status"),
        ({"languages": ["ja"]}, "ไม่รองรับ"),
        ({"limits": {"max_audio_bytes": 20 * 1024 * 1024}}, "เพดาน"),
        ({"max_concurrency": 0}, "max_concurrency"),
        ({"assets": [{"role": "ckpt", "path": "missing.pt", "sha256": "0" * 64}]}, "ไม่พบ"),
    ],
)
def test_invalid_manifest_is_rejected(tmp_path, overrides, message_part):
    overrides = dict(overrides)
    kind = overrides.pop("kind", "asr")
    path = write_manifest(tmp_path, kind, **overrides)
    with pytest.raises(ProfileError) as exc:
        load_manifest(path)
    assert message_part in str(exc.value)


def test_asset_checksum_mismatch_is_rejected_without_download(tmp_path):
    asset = tmp_path / "model.bin"
    asset.write_bytes(b"not-the-pinned-weights")
    path = write_manifest(tmp_path, "asr", assets=[{"role": "ckpt", "path": "model.bin", "sha256": "1" * 64}])
    with pytest.raises(ProfileError, match="checksum"):
        load_manifest(path)
    good = write_manifest(tmp_path / "ok" if (tmp_path / "ok").mkdir() is None else tmp_path, "asr",
                          assets=[{"role": "ckpt", "path": str(asset), "sha256": hashlib.sha256(asset.read_bytes()).hexdigest()}])
    manifest = load_manifest(good)
    assert manifest.assets[0].sha256 == hashlib.sha256(asset.read_bytes()).hexdigest()


def test_invalid_manifest_makes_main_exit_nonzero(tmp_path, monkeypatch):
    from app.voice_worker.__main__ import EXIT_CONFIG_ERROR, main

    _clear_worker_env(monkeypatch)
    path = write_manifest(tmp_path, "asr", device="auto")
    monkeypatch.setenv("LALIN_VOICE_WORKER_PROFILE_PATH", str(path))
    monkeypatch.setenv("LALIN_VOICE_WORKER_DATA_DIR", str(tmp_path / "wd"))
    calls: list[dict] = []
    assert main(run_server=lambda *a, **kw: calls.append(kw)) == EXIT_CONFIG_ERROR
    assert calls == []


def test_valid_manifest_starts_uvicorn_on_loopback_with_single_worker(tmp_path, monkeypatch):
    from fastapi import FastAPI

    from app.voice_worker.__main__ import main

    _clear_worker_env(monkeypatch)
    path = write_manifest(tmp_path, "asr")
    monkeypatch.setenv("LALIN_VOICE_WORKER_PROFILE_PATH", str(path))
    monkeypatch.setenv("LALIN_VOICE_WORKER_DATA_DIR", str(tmp_path / "wd"))
    monkeypatch.setenv("LALIN_VOICE_WORKER_INFERENCE_CREDENTIALS", json.dumps({ISSUER: INFERENCE_TOKEN}))
    captured: dict = {}

    def fake_run(app, **kwargs):
        captured["app"] = app
        captured.update(kwargs)

    assert main(run_server=fake_run) == 0
    assert isinstance(captured["app"], FastAPI)  # app object → uvicorn ไม่สามารถ fork หลาย workers
    assert captured["host"] == "127.0.0.1"
    assert captured["workers"] == 1
    assert captured["port"] == 8790


def test_short_or_shared_tokens_fail_closed(tmp_path, monkeypatch):
    from app.voice_worker.__main__ import EXIT_CONFIG_ERROR, main

    _clear_worker_env(monkeypatch)
    path = write_manifest(tmp_path, "asr")
    monkeypatch.setenv("LALIN_VOICE_WORKER_PROFILE_PATH", str(path))
    monkeypatch.setenv("LALIN_VOICE_WORKER_DATA_DIR", str(tmp_path / "wd"))
    monkeypatch.setenv("LALIN_VOICE_WORKER_INFERENCE_CREDENTIALS", json.dumps({ISSUER: "short"}))
    assert main(run_server=lambda *a, **kw: None) == EXIT_CONFIG_ERROR
    monkeypatch.setenv("LALIN_VOICE_WORKER_INFERENCE_CREDENTIALS", json.dumps({ISSUER: INFERENCE_TOKEN}))
    monkeypatch.setenv("LALIN_VOICE_WORKER_MANAGEMENT_TOKEN", INFERENCE_TOKEN)
    assert main(run_server=lambda *a, **kw: None) == EXIT_CONFIG_ERROR


def test_data_dir_must_not_be_studio_runtime_data(tmp_path):
    from app.voice_worker.settings import ConfigError, WorkerSettings

    settings = WorkerSettings(profile_path=None, data_dir=tmp_path / "runtime" / "data", inference_credentials={ISSUER: INFERENCE_TOKEN})
    with pytest.raises(ConfigError, match="runtime/data"):
        settings.validate_runtime()


def test_non_loopback_host_is_rejected_in_phase_1(tmp_path):
    from app.voice_worker.settings import ConfigError, WorkerSettings

    settings = WorkerSettings(host="0.0.0.0", data_dir=tmp_path / "wd", inference_credentials={ISSUER: INFERENCE_TOKEN})
    with pytest.raises(ConfigError, match="loopback"):
        settings.validate_runtime()
