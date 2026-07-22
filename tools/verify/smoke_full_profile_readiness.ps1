param(
    [string]$PythonPath
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
$backendDir = Join-Path $root "apps\api"
if ([string]::IsNullOrWhiteSpace($PythonPath)) {
    $PythonPath = Join-Path $backendDir ".venv\Scripts\python.exe"
    if (-not (Test-Path $PythonPath)) {
        $PythonPath = Join-Path $root "backend\.venv\Scripts\python.exe"
    }
}

if (-not (Test-Path $PythonPath)) {
    Write-Host "[!] Missing backend Python: $PythonPath" -ForegroundColor Red
    Write-Host "    Run: powershell -ExecutionPolicy Bypass -File scripts\setup_windows.ps1" -ForegroundColor Yellow
    exit 1
}

$probe = @'
import importlib.util
import json
import sys

from fastapi.testclient import TestClient

from app.main import create_app

required_modules = [
    "torch",
    "torchaudio",
    "faster_whisper",
    "f5_tts",
    "matchering",
    "pyloudnorm",
    "librosa",
    "demucs",
    "psola",
    "pedalboard",
    "soundfile",
    "imageio_ffmpeg",
]
required_routes = {
    "/health",
    "/tts",
    "/dubbing",
    "/dubbing/refine",
    "/mastering",
    "/music/remix",
    "/music/export",
}

missing_modules = [name for name in required_modules if importlib.util.find_spec(name) is None]
app = create_app("full")
client = TestClient(app)
root = client.get("/").json()
route_paths = {getattr(route, "path", "") for route in app.routes}
missing_routes = sorted(required_routes - route_paths)

payload = {
    "profile": root.get("profile"),
    "features": root.get("features"),
    "missing_modules": missing_modules,
    "missing_routes": missing_routes,
}
print(json.dumps(payload, indent=2))

if root.get("profile") != "full":
    print("FAIL: expected full backend profile", file=sys.stderr)
    raise SystemExit(1)
if missing_modules:
    print("FAIL: missing required full-profile modules: " + ", ".join(missing_modules), file=sys.stderr)
    raise SystemExit(1)
if missing_routes:
    print("FAIL: missing required full-profile routes: " + ", ".join(missing_routes), file=sys.stderr)
    raise SystemExit(1)

print("PASS: full profile boots with ML routes and required workstation modules available")
'@

Push-Location $backendDir
try {
    $probe | & $PythonPath -
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}
