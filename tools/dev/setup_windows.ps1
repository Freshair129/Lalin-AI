# ============================================================================
#  Lalin AI / G-Music - Windows API runtime setup
#  Requires Python 3.11. Run from:
#    cd D:\G-Music\apps\api ; ..\..\tools\dev\setup_windows.ps1
# ============================================================================
param(
  [switch]$InstallOptionalRemixDeps
)

$ErrorActionPreference = "Stop"

function Invoke-PipInstall {
  param(
    [Parameter(Mandatory=$true)]
    [string[]]$Arguments,
    [Parameter(Mandatory=$true)]
    [bool]$UseUv
  )

  if ($UseUv) {
    uv pip install @Arguments
  } else {
    pip install @Arguments
  }
}

# Find Python 3.11.
$py311 = $null
$uvPy = Get-ChildItem "$env:APPDATA\uv\python\cpython-3.11*\python.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($uvPy) { $py311 = $uvPy.FullName }

if (-not $py311) {
  try {
    & py -3.11 --version *> $null
    if ($?) { $py311 = "py" }
  } catch {}
}

if (-not $py311) {
  throw "Python 3.11 was not found. Install it first, for example: uv python install 3.11"
}

Write-Host "==> Using Python 3.11: $py311" -ForegroundColor Cyan

# Prefer uv when available; otherwise use venv + pip.
$hasUv = $false
try {
  uv --version *> $null
  $hasUv = $?
} catch {}

if ($hasUv) {
  Write-Host "==> Creating .venv with uv" -ForegroundColor Cyan
  if ($py311 -eq "py") {
    uv venv --python 3.11 .venv
  } else {
    uv venv --python "$py311" .venv
  }
  $env:VIRTUAL_ENV = "$PWD\.venv"
} else {
  Write-Host "==> Creating .venv with venv + pip" -ForegroundColor Cyan
  if ($py311 -eq "py") {
    & py -3.11 -m venv .venv
  } else {
    & $py311 -m venv .venv
  }
  . .\.venv\Scripts\Activate.ps1
  python -m pip install --upgrade pip
}

Write-Host "==> Installing API requirements" -ForegroundColor Cyan
Invoke-PipInstall -UseUv $hasUv -Arguments @("-r", "requirements.txt")

Write-Host "==> Installing PyTorch CUDA 12.1 runtime" -ForegroundColor Cyan
Invoke-PipInstall -UseUv $hasUv -Arguments @("torch", "torchaudio", "--index-url", "https://download.pytorch.org/whl/cu121")

Write-Host "==> Installing speech and mastering models/dependencies" -ForegroundColor Cyan
Invoke-PipInstall -UseUv $hasUv -Arguments @("faster-whisper")
Invoke-PipInstall -UseUv $hasUv -Arguments @("f5-tts")
Invoke-PipInstall -UseUv $hasUv -Arguments @("matchering", "pyloudnorm")
Invoke-PipInstall -UseUv $hasUv -Arguments @("librosa")

if ($InstallOptionalRemixDeps) {
  Write-Host "==> Installing optional Remix dependencies: Demucs / PSOLA / pedalboard" -ForegroundColor Cyan
  Invoke-PipInstall -UseUv $hasUv -Arguments @("demucs", "psola", "pedalboard")
} else {
  Write-Host "==> Skipping optional Remix dependencies" -ForegroundColor Yellow
  Write-Host "   To enable full stem split / auto-tune / vocal FX support:" -ForegroundColor DarkYellow
  Write-Host "   ..\..\tools\dev\setup_windows.ps1 -InstallOptionalRemixDeps" -ForegroundColor DarkYellow
  Write-Host "   Note: psola/pedalboard have license implications. See docs/product/ROADMAP_MUSIC.md" -ForegroundColor DarkYellow
}

Write-Host "==> Preparing .env" -ForegroundColor Cyan
if (-not (Test-Path .env)) { Copy-Item .env.example .env }

Write-Host ""
Write-Host "Done. Start the API with:" -ForegroundColor Green
Write-Host "  .\.venv\Scripts\Activate.ps1 ; uvicorn app.main:app --port 8756" -ForegroundColor Yellow
Write-Host "Open http://127.0.0.1:8756/docs"
