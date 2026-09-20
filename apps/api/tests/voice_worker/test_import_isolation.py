# @req FR-19.1 (candidate) — LVP-AT-002: import side effects ของ worker
"""รันใน subprocess สะอาด (pytest process นี้ import app.main ไปแล้วจาก Studio tests):
boot worker + เรียก readiness แล้วต้องไม่มี torch / app.brain / app.routers / app.main / app.config / app.jobs / app.pipelines
ใน sys.modules และต้องไม่สร้าง Studio data dirs (DATA_DIR ชี้ marker ที่ต้องยังไม่ถูกสร้าง)"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from .conftest import INFERENCE_TOKEN, ISSUER, write_manifest

API_ROOT = Path(__file__).resolve().parents[2]

PROBE = r"""
import json, os, pathlib, sys
from app.voice_worker.app import create_worker_app
from app.voice_worker.profile import load_manifest
from app.voice_worker.settings import WorkerSettings
from fastapi.testclient import TestClient
manifest_path, data_dir, issuer, token = sys.argv[1:5]
manifest = load_manifest(manifest_path)
settings = WorkerSettings(profile_path=manifest_path, data_dir=data_dir, inference_credentials={issuer: token})
app = create_worker_app(settings, manifest)
with TestClient(app) as client:
    live = client.get("/health/live")
    ready = client.get("/worker/v1/readiness", headers={"Authorization": f"Bearer {token}"}).json()
    describe = client.get("/worker/v1/describe", headers={"Authorization": f"Bearer {token}"}).json()
mods = set(sys.modules)
studio = pathlib.Path(os.environ["DATA_DIR"])
print(json.dumps({
    "live": live.status_code,
    "ready": ready["ready"],
    "engine": describe["engine"],
    "torch": "torch" in mods,
    "ctranslate2": "ctranslate2" in mods,
    "f5_tts": "f5_tts" in mods,
    "app_main": "app.main" in mods,
    "app_config": "app.config" in mods,
    "app_brain": any(m.startswith("app.brain") for m in mods),
    "app_routers": any(m.startswith("app.routers") for m in mods),
    "app_jobs": any(m.startswith("app.jobs") for m in mods),
    "app_pipelines": any(m.startswith("app.pipelines") for m in mods),
    "studio_data_dir_exists": studio.exists(),
}))
"""


def test_worker_boot_has_no_studio_or_ml_imports_and_creates_no_studio_dirs(tmp_path):
    manifest_path = write_manifest(tmp_path, "asr")
    studio_marker = tmp_path / "studio-data-must-not-exist"
    env = {**os.environ, "DATA_DIR": str(studio_marker), "GMUSIC_BACKEND_PROFILE": "voice-worker", "PYTHONIOENCODING": "utf-8"}
    for key in list(env):
        if key.startswith("LALIN_VOICE_WORKER_"):
            env.pop(key)
    completed = subprocess.run(
        [sys.executable, "-c", PROBE, str(manifest_path), str(tmp_path / "worker-data"), ISSUER, INFERENCE_TOKEN],
        cwd=str(API_ROOT), env=env, capture_output=True, text=True, timeout=180, encoding="utf-8",
    )
    assert completed.returncode == 0, completed.stderr
    report = json.loads(completed.stdout.strip().splitlines()[-1])
    assert report["live"] == 200
    assert report["ready"] is True
    assert report["engine"]["name"] == "stub" and report["engine"]["labeled_stub"] is True
    for key in ("torch", "ctranslate2", "f5_tts", "app_main", "app_config", "app_brain", "app_routers", "app_jobs", "app_pipelines"):
        assert report[key] is False, f"{key} was imported by the worker control process"
    assert report["studio_data_dir_exists"] is False
    assert not studio_marker.exists()
