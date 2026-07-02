# ═══════════════════════════════════════════════════════════════════
#  build_sidecar.ps1 — bundle backend/ (FastAPI) เป็น standalone .exe
#  แล้ว copy ไปที่ frontend/src-tauri/binaries/ ในชื่อที่ Tauri sidecar ต้องการ
#
#  ใช้:  powershell -ExecutionPolicy Bypass -File scripts\build_sidecar.ps1
#
#  ⚠️ SCAFFOLDING — สคริปต์นี้ยังไม่เคยรัน end-to-end จริงในสภาพแวดล้อมนี้
#     (worker นี้แก้ได้แค่ scripts/docs/tauri.conf.json ห้ามรัน build จริง)
#     ต้องมีคนรัน PyInstaller build จริงอย่างน้อย 1 ครั้งเพื่อ validate ก่อนใช้งาน
#     ดู docs/PACKAGING_SIDECAR.md สำหรับ known-limitations แบบละเอียด
# ═══════════════════════════════════════════════════════════════════
$ErrorActionPreference = "Stop"

$root       = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$backendDir = Join-Path $root "backend"
$venvPy     = Join-Path $backendDir ".venv\Scripts\python.exe"
$venvPyInstaller = Join-Path $backendDir ".venv\Scripts\pyinstaller.exe"
$distDir    = Join-Path $backendDir "dist"
$buildDir   = Join-Path $backendDir "build"
$specName   = "g-music-backend"
$specFile   = Join-Path $backendDir "$specName.spec"

$sidecarDir = Join-Path $root "frontend\src-tauri\binaries"

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host " G-Music — build sidecar (backend -> standalone .exe)" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

# ── 1) Guard: ต้องมี backend/.venv (Python 3.11) ────────────────────
# เหตุผล: heavy ML deps (torch/f5-tts/demucs/...) ต้องถูกติดตั้งใน venv
# นี้อยู่ก่อนแล้ว (ผ่าน scripts/setup_windows.ps1) — PyInstaller ต้องรัน
# จาก python ตัวเดียวกับที่ import ML libs ได้ ไม่งั้น bundle จะขาด deps
if (-not (Test-Path $venvPy)) {
    Write-Host "[!] ไม่พบ backend\.venv — สร้าง venv ก่อน" -ForegroundColor Red
    Write-Host "    รัน:  cd backend ; ..\scripts\setup_windows.ps1" -ForegroundColor Yellow
    Write-Host "    (ต้องเป็น Python 3.11 — torch/f5-tts ยังไม่มี wheel สำหรับ 3.12/3.13)" -ForegroundColor Yellow
    exit 1
}
Write-Host "[*] พบ venv: $venvPy" -ForegroundColor Green

# ── 2) Guard: ต้องมี pyinstaller ใน venv (ถ้าไม่มี ติดตั้งให้อัตโนมัติ) ──
$hasPyInstaller = Test-Path $venvPyInstaller
if (-not $hasPyInstaller) {
    Write-Host "[!] ไม่พบ pyinstaller ใน venv — จะลองติดตั้งให้" -ForegroundColor Yellow
    Write-Host "    (ถ้าไม่อยากให้สคริปต์ติดตั้งเอง ยกเลิกแล้วรันเอง:" -ForegroundColor Yellow
    Write-Host "     backend\.venv\Scripts\python.exe -m pip install pyinstaller)" -ForegroundColor Yellow
    & $venvPy -m pip install pyinstaller
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[!] ติดตั้ง pyinstaller ล้มเหลว — หยุด" -ForegroundColor Red
        exit 1
    }
    if (-not (Test-Path $venvPyInstaller)) {
        Write-Host "[!] ติดตั้งแล้วแต่ยังหา pyinstaller.exe ไม่เจอที่ $venvPyInstaller" -ForegroundColor Red
        exit 1
    }
}
Write-Host "[*] พบ pyinstaller: $venvPyInstaller" -ForegroundColor Green

# ── 3) หา target-triple ของเครื่องนี้ (Tauri sidecar ต้องมี suffix นี้) ──
# Tauri v2 คาดว่าไฟล์ sidecar จะชื่อ `<name>-<target-triple>.exe`
# ปกติเครื่อง Windows x64 คือ x86_64-pc-windows-msvc
# ถ้ามี rustc ในเครื่องจะ query ให้ตรงจริง ไม่งั้น fallback เป็นค่า default นี้
$targetTriple = "x86_64-pc-windows-msvc"
try {
    $rustcInfo = & rustc -vV 2>$null
    if ($LASTEXITCODE -eq 0 -and $rustcInfo) {
        $hostLine = ($rustcInfo -split "`n") | Where-Object { $_ -match "^host:\s*(\S+)" }
        if ($hostLine -and $Matches -and $Matches[1]) {
            $targetTriple = $Matches[1]
        }
    }
} catch {
    Write-Host "[i] ไม่พบ rustc — ใช้ target-triple default: $targetTriple" -ForegroundColor DarkYellow
}
Write-Host "[*] target-triple: $targetTriple" -ForegroundColor Green

# ── 4) เคลียร์ build เก่า (idempotent) ───────────────────────────────
if (Test-Path $distDir)  { Remove-Item -Recurse -Force $distDir }
if (Test-Path $buildDir) { Remove-Item -Recurse -Force $buildDir }
if (Test-Path $specFile) { Remove-Item -Force $specFile }

# ── 5) รัน PyInstaller ────────────────────────────────────────────────
# ⚠️ heavy-dep caveat: ถ้า venv นี้ลง torch/demucs/f5-tts/matchering ครบ
#    ไฟล์ .exe ที่ได้จะใหญ่มาก (หลาย GB — torch+cuDNN/cuBLAS DLLs หนักสุด)
#    และ PyInstaller อาจ "มองไม่เห็น" native extension บางตัว (โดยเฉพาะ
#    torch, ctranslate2 ของ faster-whisper, demucs) ต้องเพิ่ม --collect-all
#    / --collect-binaries ทีละ package เมื่อเจอ ModuleNotFoundError ตอนรัน .exe จริง
#    รายการที่มักต้องเพิ่ม (ยังไม่ยืนยันด้วย build จริง):
#      --collect-all torch --collect-all torchaudio --collect-all ctranslate2
#      --collect-all faster_whisper --collect-all librosa --collect-data f5_tts
#    แนะนำ: build แบบ --onedir (ไม่ใช่ --onefile) เพราะโมเดล ML ขนาดใหญ่
#    รวมกับ startup ที่ต้อง extract ทุกครั้งจะช้ามากถ้าใช้ --onefile
$entryScript = Join-Path $backendDir "sidecar_entry.py"
if (-not (Test-Path $entryScript)) {
    Write-Host "[i] ไม่พบ $entryScript — จะสร้างไฟล์ entrypoint เล็ก ๆ ให้อัตโนมัติ" -ForegroundColor DarkYellow
    @"
# sidecar_entry.py — จุดเริ่มของ g-music-backend.exe (สร้างอัตโนมัติโดย build_sidecar.ps1)
# รัน uvicorn app.main:app แบบฝังในตัว exe เดียว (ไม่ต้องพึ่ง uvicorn CLI)
import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=8756, log_level="info")
"@ | Set-Content -Path $entryScript -Encoding utf8
}

Push-Location $backendDir
try {
    Write-Host "[*] รัน PyInstaller (--onedir, อาจใช้เวลานานหลายนาทีถ้ามี torch)..." -ForegroundColor Cyan
    & $venvPyInstaller `
        --name $specName `
        --onedir `
        --noconfirm `
        --clean `
        --console `
        sidecar_entry.py

    if ($LASTEXITCODE -ne 0) {
        Write-Host "[!] PyInstaller ล้มเหลว — ดู log ด้านบน" -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}

# PyInstaller --onedir จะสร้าง backend\dist\g-music-backend\g-music-backend.exe
# พร้อมโฟลเดอร์ dependency ข้าง ๆ (_internal\ เป็นต้น)
$builtExe = Join-Path $distDir "$specName\$specName.exe"
if (-not (Test-Path $builtExe)) {
    Write-Host "[!] ไม่พบไฟล์ที่ build แล้วที่ $builtExe — ตรวจ log PyInstaller ด้านบน" -ForegroundColor Red
    exit 1
}
Write-Host "[*] build เสร็จ: $builtExe" -ForegroundColor Green

# ── 6) copy ไป frontend/src-tauri/binaries/ ตามชื่อที่ Tauri ต้องการ ───
# Tauri v2 sidecar (bundle.externalBin) อ้างถึงแค่ตัว .exe เดียว แต่ PyInstaller
# --onedir ผลิตโฟลเดอร์ dependency (_internal\) มาด้วยเสมอ — .exe จะรันไม่ได้ถ้า
# _internal\ ไม่อยู่ข้าง ๆ กัน จึง copy ทั้งโฟลเดอร์ dist\g-music-backend\* แบบ flat
# เข้า binaries\ ผลลัพธ์คือ binaries\_internal\... ซึ่งตรงกับ
# tauri.conf.json -> bundle.resources ("binaries/_internal/**/*") ที่ประกาศไว้
# ให้ Tauri bundle โฟลเดอร์นี้เข้า installer ด้วย (แยกจาก externalBin ที่รวมแค่ .exe)
if (-not (Test-Path $sidecarDir)) {
    New-Item -ItemType Directory -Path $sidecarDir -Force | Out-Null
}

$targetExeName = "$specName-$targetTriple.exe"
$targetExePath = Join-Path $sidecarDir $targetExeName

Write-Host "[*] copy ผลลัพธ์ทั้งโฟลเดอร์ไปที่ $sidecarDir ..." -ForegroundColor Cyan
# copy dependency files (_internal เป็นต้น) เข้า sidecarDir โดยตรง (idempotent: overwrite)
Copy-Item -Path (Join-Path $distDir "$specName\*") -Destination $sidecarDir -Recurse -Force

# เปลี่ยนชื่อ .exe ให้ตรง target-triple suffix ที่ Tauri ต้องการ
$copiedExe = Join-Path $sidecarDir "$specName.exe"
if (Test-Path $copiedExe) {
    Move-Item -Path $copiedExe -Destination $targetExePath -Force
} elseif (-not (Test-Path $targetExePath)) {
    Write-Host "[!] ไม่พบ $copiedExe หลัง copy — ตรวจโครงสร้าง dist\ ด้วยตนเอง" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Green
Write-Host " เสร็จ (best-effort) — sidecar อยู่ที่:" -ForegroundColor Green
Write-Host "   $targetExePath" -ForegroundColor Yellow
Write-Host "=====================================================" -ForegroundColor Green
Write-Host ""
Write-Host "หมายเหตุ:" -ForegroundColor Cyan
Write-Host " - โฟลเดอร์ dependency (_internal\ ฯลฯ) ถูก copy ไปที่ $sidecarDir ด้วย"
Write-Host "   ต้องอยู่ข้าง ๆ ไฟล์ .exe เสมอ (Tauri จะรวมทั้งโฟลเดอร์ผ่าน externalBin ไม่ได้"
Write-Host "   โดยตรง — ดู docs/PACKAGING_SIDECAR.md เรื่อง resources/ เพิ่มเติม)"
Write-Host " - model weights (F5-TTS ckpt, faster-whisper large-v3 ฯลฯ) *ไม่ได้*ถูกฝังใน .exe นี้"
Write-Host "   จะโหลดผ่าน cached_path/huggingface cache ตอนรันครั้งแรกตามปกติของ tts.py/asr.py"
Write-Host " - ยังไม่ได้ทดสอบรันจริง (double-click / spawn จาก Tauri) — ต้อง validate ด้วยมือ"
