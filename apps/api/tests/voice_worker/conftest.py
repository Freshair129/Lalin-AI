# @req FR-19 (candidate, CR-005) — fixtures ของ voice worker; ไม่ใช้ fixtures ของ Studio (ไม่ import app.main)
"""fixtures: manifest factory, settings factory, worker (TestClient + runtime) และ envelope helpers.

หมายเหตุเครื่องนี้: pytest ต้องรันด้วย --basetemp <writable> (ดู docs/validation/2026-09-20-HEADLESS-VOICE-WORKER-H0-REVIEW.md §7)
"""
from __future__ import annotations

import copy
import hashlib
import json
import time
from contextlib import ExitStack
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from typing import Any, Callable

import pytest
from fastapi.testclient import TestClient

from app.voice_worker.app import create_worker_app
from app.voice_worker.profile import ProfileManifest, load_manifest
from app.voice_worker.runtime import WorkerRuntime
from app.voice_worker.settings import WorkerSettings
from app.voice_worker.timeutil import iso, utc_now

ISSUER = "prp-coordinator-a"
OTHER_ISSUER = "prp-coordinator-b"
INFERENCE_TOKEN = "inference-token-aaaaaaaaaaaaaaaaaaaa"
OTHER_TOKEN = "inference-token-bbbbbbbbbbbbbbbbbbbb"
MANAGEMENT_TOKEN = "management-token-cccccccccccccccccc"
PRESET_ID = "preset-stub-th"
PRESET_REV = "r1"
SAMPLE_AUDIO = b"RIFF" + b"\x00" * 60 + b"WAVEfmt " + b"\x10\x00\x00\x00" + b"\x01" * 256


def base_manifest(kind: str) -> dict[str, Any]:
    common = {
        "profile_revision": "rev-test-1",
        "kind": kind,
        "physical_resource_id": "cpu-test-host",
        "device": "cpu",
        "engine": "stub",
        "engine_options": {"work_seconds": 0.2, "slice_seconds": 0.02, "heartbeat_seconds": 0.1},
        "max_concurrency": 1,
        "limits": {"max_audio_bytes": 1024 * 1024, "max_audio_seconds": 60, "max_text_code_points": 800,
                   "max_output_seconds": 60, "speed_min": 0.8, "speed_max": 1.2},
        "assets": [],
    }
    if kind == "asr":
        return {**common, "profile_id": "asr-stub-01", "runtime_id": "speech-stub-asr", "languages": ["th", "en", "auto"]}
    return {
        **common,
        "profile_id": "tts-stub-01",
        "runtime_id": "speech-stub-tts",
        "languages": ["th", "en"],
        "output_formats": ["wav"],
        "voices": [{"voice_preset_id": PRESET_ID, "voice_revision": PRESET_REV, "language": "th",
                    "ref_text": "[stub] synthetic reference transcript", "rights_status": "stub-synthetic"}],
    }


def write_manifest(directory: Path, kind: str = "asr", **overrides: Any) -> Path:
    data = base_manifest(kind)
    for key, value in overrides.items():
        if key in {"engine_options", "limits"} and isinstance(value, dict):
            data[key] = {**data.get(key, {}), **value}
        else:
            data[key] = value
    path = directory / f"profile-{kind}.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def make_settings(directory: Path, manifest_path: Path, **overrides: Any) -> WorkerSettings:
    values: dict[str, Any] = {
        "profile_path": manifest_path,
        "data_dir": directory / "worker-data",
        "inference_credentials": {ISSUER: INFERENCE_TOKEN, OTHER_ISSUER: OTHER_TOKEN},
        "management_token": MANAGEMENT_TOKEN,
        "heartbeat_stale_seconds": 2.0,
        "cancel_grace_seconds": 0.5,
        "terminate_grace_seconds": 3.0,
    }
    values.update(overrides)
    return WorkerSettings(**values)


def auth(token: str = INFERENCE_TOKEN) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@dataclass
class Worker:
    client: TestClient
    runtime: WorkerRuntime
    manifest: ProfileManifest
    settings: WorkerSettings
    manifest_path: Path

    @property
    def epoch(self) -> str:
        return self.runtime.supervisor.epoch or ""

    def envelope(self, attempt_id: str, *, kind: str | None = None, epoch: str | None = None,
                 start_in: float = 60.0, deadline_in: float = 120.0, **overrides: Any) -> dict[str, Any]:
        now = utc_now()
        kind = kind or self.manifest.kind
        start_in = min(start_in, deadline_in)  # start window ต้องไม่อยู่หลัง deadline (envelope ที่ PRP ออกจริง)
        env: dict[str, Any] = {
            "contract_version": "1.0",
            "invocation_id": f"inv-{attempt_id}",
            "attempt_id": attempt_id,
            "kind": kind,
            "target": {
                "runtime_id": self.manifest.runtime_id,
                "runtime_epoch": epoch or self.epoch,
                "physical_resource_id": self.manifest.physical_resource_id,
                "profile_id": self.manifest.profile_id,
                "profile_revision": self.manifest.profile_revision,
            },
            "admission": {
                "lease_id": f"lease-{attempt_id}",
                "start_before": iso(now + timedelta(seconds=start_in)),
                "deadline_at": iso(now + timedelta(seconds=deadline_in)),
                "content_fence": "fence-1",
            },
        }
        if kind == "asr":
            env["input"] = {"language": "th", "audio_sha256": "0" * 64, "audio_bytes": 1, "declared_mime_type": "audio/wav"}
        else:
            env["input"] = {"text": "สวัสดีครับ ยินดีต้อนรับ", "voice_preset_id": PRESET_ID, "voice_revision": PRESET_REV, "response_format": "wav"}
        for key, value in overrides.items():
            if isinstance(value, dict) and isinstance(env.get(key), dict):
                env[key] = {**env[key], **value}
            else:
                env[key] = value
        return env

    def post_asr(self, env: dict[str, Any], audio: bytes = SAMPLE_AUDIO, *, token: str = INFERENCE_TOKEN, fix_digest: bool = True):
        env = copy.deepcopy(env)
        if fix_digest:
            env["input"]["audio_sha256"] = hashlib.sha256(audio).hexdigest()
            env["input"]["audio_bytes"] = len(audio)
        return self.client.post(
            "/worker/v1/operations",
            data={"envelope": json.dumps(env, ensure_ascii=False)},
            files={"audio": ("clip.wav", audio, env["input"].get("declared_mime_type", "audio/wav"))},
            headers=auth(token),
        )

    def post_tts(self, env: dict[str, Any], *, token: str = INFERENCE_TOKEN):
        return self.client.post("/worker/v1/operations", json=env, headers=auth(token))

    def post(self, env: dict[str, Any], **kwargs: Any):
        return self.post_asr(env, **kwargs) if env["kind"] == "asr" else self.post_tts(env, **{k: v for k, v in kwargs.items() if k == "token"})

    def status(self, attempt_id: str, *, token: str = INFERENCE_TOKEN):
        return self.client.get(f"/worker/v1/operations/{attempt_id}", headers=auth(token))

    def wait_terminal(self, attempt_id: str, *, timeout: float = 15.0, token: str = INFERENCE_TOKEN) -> dict[str, Any]:
        deadline = time.monotonic() + timeout
        last: dict[str, Any] = {}
        while time.monotonic() < deadline:
            response = self.status(attempt_id, token=token)
            assert response.status_code == 200, response.text
            last = response.json()
            if last["execution_status"] in {"FINISHED", "UNKNOWN"}:
                return last
            time.sleep(0.05)
        raise AssertionError(f"attempt {attempt_id} did not reach a terminal state: {last}")

    def wait_ready(self, *, timeout: float = 15.0) -> dict[str, Any]:
        deadline = time.monotonic() + timeout
        last: dict[str, Any] = {}
        while time.monotonic() < deadline:
            last = self.client.get("/worker/v1/readiness", headers=auth()).json()
            if last["ready"]:
                return last
            time.sleep(0.1)
        raise AssertionError(f"worker did not become ready: {last}")


WorkerFactory = Callable[..., Worker]


@pytest.fixture()
def worker_factory(tmp_path_factory) -> WorkerFactory:
    stack = ExitStack()

    def factory(kind: str = "asr", *, manifest: dict[str, Any] | None = None, settings: dict[str, Any] | None = None,
                engine_options: dict[str, Any] | None = None, data_dir: Path | None = None) -> Worker:
        directory = tmp_path_factory.mktemp("voice-worker")
        overrides = dict(manifest or {})
        if engine_options:
            overrides["engine_options"] = {**overrides.get("engine_options", {}), **engine_options}
        manifest_path = write_manifest(directory, kind, **overrides)
        settings_values = dict(settings or {})
        if data_dir is not None:
            settings_values["data_dir"] = data_dir
        worker_settings = make_settings(directory, manifest_path, **settings_values)
        loaded = load_manifest(manifest_path)
        app = create_worker_app(worker_settings, loaded)
        client = stack.enter_context(TestClient(app))
        return Worker(client=client, runtime=app.state.runtime, manifest=loaded, settings=worker_settings, manifest_path=manifest_path)

    yield factory
    stack.close()
