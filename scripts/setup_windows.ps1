# ═══════════════════════════════════════════════════════════════════
#  G-Music — ติดตั้งสภาพแวดล้อมบน Windows (PowerShell)
#  ต้องมี Python 3.11 (ML stack ยังไม่รองรับ 3.12/3.13)
#  รัน:  cd D:\G-Music\backend ; ..\scripts\setup_windows.ps1
# ═══════════════════════════════════════════════════════════════════
$ErrorActionPreference = "Stop"

# ── หา Python 3.11 ──────────────────────────────────────────────────
$py311 = $null
# 1) uv-managed (เร็วสุด)
$uvPy = Get-ChildItem "$env:APPDATA\uv\python\cpython-3.11*\python.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($uvPy) { $py311 = $uvPy.FullName }
# 2) py launcher
if (-not $py311) { try { & py -3.11 --version *> $null; if ($?) { $py311 = "py -3.11" } } catch {} }
if (-not $py311) { throw "ไม่พบ Python 3.11 — ติดตั้งก่อน เช่น  uv python install 3.11" }
Write-Host "==> ใช้ Python 3.11: $py311" -ForegroundColor Cyan

# ── ตรวจ uv (ถ้ามีใช้ uv, ไม่มีใช้ venv+pip) ────────────────────────
$hasUv = $false
try { uv --version *> $null; $hasUv = $? } catch {}

if ($hasUv) {
  Write-Host "==> สร้าง venv ด้วย uv" -ForegroundColor Cyan
  uv venv --python "$py311" .venv
  $env:VIRTUAL_ENV = "$PWD\.venv"
  $pipInstall = { param($a) uv pip install @a }
} else {
  Write-Host "==> สร้าง venv ด้วย venv+pip" -ForegroundColor Cyan
  & $py311 -m venv .venv
  . .\.venv\Scripts\Activate.ps1
  python -m pip install --upgrade pip
  $pipInstall = { param($a) pip install @a }
}

Write-Host "==> ติดตั้งไลบรารีหลัก (API)" -ForegroundColor Cyan
& $pipInstall @("-r", "requirements.txt")

Write-Host "==> ติดตั้ง PyTorch (CUDA 12.1 — เหมาะกับ RTX 3060)" -ForegroundColor Cyan
& $pipInstall @("torch", "torchaudio", "--index-url", "https://download.pytorch.org/whl/cu121")

Write-Host "==> ติดตั้งโมเดลเสียง" -ForegroundColor Cyan
& $pipInstall @("faster-whisper")          # ASR
& $pipInstall @("f5-tts")                   # voice clone (ไทย/อังกฤษ)
& $pipInstall @("matchering", "pyloudnorm") # mastering
& $pipInstall @("librosa")                  # time-stretch สำหรับ dubbing
# XTTS (ทางเลือก) — ติดตั้งเมื่อต้องการ:  & $pipInstall @("coqui-tts")

Write-Host "==> เตรียมไฟล์ config" -ForegroundColor Cyan
if (-not (Test-Path .env)) { Copy-Item .env.example .env }

Write-Host ""
Write-Host "เสร็จแล้ว! รันเซิร์ฟเวอร์ด้วย:" -ForegroundColor Green
Write-Host "  .\.venv\Scripts\Activate.ps1 ; uvicorn app.main:app --port 8756" -ForegroundColor Yellow
Write-Host "เปิด http://127.0.0.1:8756/docs"
