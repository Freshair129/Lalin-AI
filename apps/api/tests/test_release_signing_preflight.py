from __future__ import annotations

import base64
import os
from pathlib import Path
import re
import shutil
import subprocess

import pytest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "tools" / "verify" / "check_tauri_signing_key.ps1"
WORKFLOW = ROOT / ".github" / "workflows" / "release.yml"
POWERSHELL = shutil.which("pwsh") or shutil.which("powershell")

pytestmark = pytest.mark.skipif(
    POWERSHELL is None,
    reason="PowerShell is required for the Windows release preflight",
)


def run_preflight(key: str | None) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    if key is None:
        env.pop("TAURI_SIGNING_PRIVATE_KEY", None)
    else:
        env["TAURI_SIGNING_PRIVATE_KEY"] = key

    return subprocess.run(
        [
            str(POWERSHELL),
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(SCRIPT),
        ],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def test_missing_key_fails_without_echoing_secret() -> None:
    result = run_preflight(None)

    assert result.returncode == 1
    assert "TAURI_SIGNING_PRIVATE_KEY is required" in result.stderr


def test_malformed_key_fails_without_echoing_secret() -> None:
    secret_marker = "not-base64-PRIVATE-MARKER"

    result = run_preflight(secret_marker)

    assert result.returncode == 1
    assert "not a valid base64-encoded Tauri updater key" in result.stderr
    assert secret_marker not in result.stdout
    assert secret_marker not in result.stderr


def test_tauri_key_envelope_passes() -> None:
    decoded = (
        "untrusted comment: rsign encrypted secret key\n"
        "test-payload-that-is-not-a-real-private-key\n"
    )
    encoded = base64.b64encode(decoded.encode("utf-8")).decode("ascii")

    result = run_preflight(encoded)

    assert result.returncode == 0
    assert "Updater signing key preflight passed" in result.stdout
    assert encoded not in result.stdout
    assert encoded not in result.stderr


def test_release_job_grants_only_contents_write() -> None:
    workflow = WORKFLOW.read_text(encoding="utf-8")
    job_match = re.search(
        r"(?ms)^  build-windows:\s*\n(?P<body>.*?)(?=^  [A-Za-z0-9_-]+:\s*$|\Z)",
        workflow,
    )

    assert job_match is not None
    permission_match = re.search(
        r"(?m)^    permissions:\s*\n(?P<body>(?:^      .+\n?)+)",
        job_match.group("body"),
    )
    assert permission_match is not None
    assert permission_match.group("body").strip() == "contents: write"
