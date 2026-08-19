# ═══════════════════════════════════════════════════════════════════
#  build_sidecar.ps1 — bundle backend/ (FastAPI) เป็น standalone .exe
#  แล้ว copy ไปที่ frontend/src-tauri/binaries/ ในชื่อที่ Tauri sidecar ต้องการ
#
#  ใช้ (เครื่อง dev):  powershell -ExecutionPolicy Bypass -File scripts\build_sidecar.ps1
#  ใช้ (CI):           ./scripts/build_sidecar.ps1 -VenvPath "<ws>/backend/.venv-ci" -CreateIfMissing
#
#  สคริปต์ build จาก backend\g-music-backend.spec ที่ track ไว้ใน git เสมอ
#  (เวอร์ชันก่อนหน้าลบ .spec ทิ้งทุกครั้ง ทำให้ hiddenimports ที่แก้ไว้หายหมด)
#
#  ก่อนถือว่า build ผ่าน สคริปต์จะรัน .exe จริงแล้วยิง /health — bundle ที่ขาด
#  โมดูลจะตกตรงนี้ ไม่ใช่ไปตกตอนผู้ใช้เปิดแอป
# ═══════════════════════════════════════════════════════════════════
param(
    [string]$VenvPath = "",
    [switch]$CreateIfMissing
)

$ErrorActionPreference = "Stop"

$root       = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$backendDir = Join-Path $root "backend"
$venvDir    = if ($VenvPath) { $VenvPath } else { Join-Path $backendDir ".venv" }
$venvPy     = Join-Path $venvDir "Scripts\python.exe"
$specName   = "g-music-backend"
$specFile   = Join-Path $backendDir "$specName.spec"
$distDir    = Join-Path $backendDir "dist"
$buildDir   = Join-Path $backendDir "build"
$sidecarDir = Join-Path $root "frontend\src-tauri\binaries"

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host " G-Music - build sidecar (backend -> standalone .exe)" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

# ── 1) venv: ใช้ของเดิม หรือสร้างใหม่แบบ lite (สำหรับ CI) ──────────────────
if (-not (Test-Path $venvPy)) {
    if (-not $CreateIfMissing) {
        Write-Host "[!] not found: $venvPy" -ForegroundColor Red
        Write-Host "    run scripts\setup_windows.ps1 first, or pass -CreateIfMissing" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "[*] creating lite venv at $venvDir (requirements.txt only)" -ForegroundColor Cyan
    & python -m venv $venvDir
    if ($LASTEXITCODE -ne 0) { Write-Host "[!] venv creation failed" -ForegroundColor Red; exit 1 }
    & $venvPy -m pip install --upgrade pip
    & $venvPy -m pip install -r (Join-Path $backendDir "requirements.txt")
    if ($LASTEXITCODE -ne 0) { Write-Host "[!] pip install failed" -ForegroundColor Red; exit 1 }
}
Write-Host "[*] venv: $venvPy" -ForegroundColor Green

# floor ไม่ใช่ pin — venv ของ dev อาจมี pyinstaller ใหม่กว่าอยู่แล้ว การ pin จะ downgrade ให้เปล่า ๆ
& $venvPy -m pip install "pyinstaller>=6.11"
if ($LASTEXITCODE -ne 0) { Write-Host "[!] pyinstaller install failed" -ForegroundColor Red; exit 1 }

# ── 2) target-triple ที่ Tauri sidecar ต้องการต่อท้ายชื่อไฟล์ ─────────────
$targetTriple = "x86_64-pc-windows-msvc"
try {
    $rustcInfo = & rustc -vV 2>$null
    if ($LASTEXITCODE -eq 0 -and $rustcInfo) {
        $hostLine = ($rustcInfo -split "`n") | Where-Object { $_ -match "^host:\s*(\S+)" }
        if ($hostLine -and $Matches -and $Matches[1]) { $targetTriple = $Matches[1] }
    }
} catch {
    Write-Host "[i] rustc not found - using default target-triple" -ForegroundColor DarkYellow
}
Write-Host "[*] target-triple: $targetTriple" -ForegroundColor Green

# ── 3) เคลียร์ output เก่า (ห้ามลบ .spec — เป็น source ที่ track ไว้) ──────
if (Test-Path $distDir)  { Remove-Item -Recurse -Force $distDir }
if (Test-Path $buildDir) { Remove-Item -Recurse -Force $buildDir }
if (-not (Test-Path $specFile)) {
    Write-Host "[!] missing $specFile - this file must be committed to git" -ForegroundColor Red
    exit 1
}

# ── 4) build จาก spec ────────────────────────────────────────────────────
Push-Location $backendDir
try {
    Write-Host "[*] running PyInstaller from the tracked spec..." -ForegroundColor Cyan
    & $venvPy -m PyInstaller --noconfirm --clean $specFile
    if ($LASTEXITCODE -ne 0) { Write-Host "[!] PyInstaller failed" -ForegroundColor Red; exit 1 }
} finally {
    Pop-Location
}

$builtExe = Join-Path $distDir "$specName\$specName.exe"
if (-not (Test-Path $builtExe)) {
    Write-Host "[!] built exe not found at $builtExe" -ForegroundColor Red
    exit 1
}
Write-Host "[*] built: $builtExe" -ForegroundColor Green

# ── 5) smoke test: .exe ต้องบูตแล้วตอบ /health จริง ──────────────────────
Write-Host "[*] smoke test: launching the exe and polling /health ..." -ForegroundColor Cyan
$logOut = Join-Path $backendDir "sidecar-smoke.out"
$logErr = Join-Path $backendDir "sidecar-smoke.err"
$proc = Start-Process -FilePath $builtExe -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $logOut -RedirectStandardError $logErr
$ok = $false
foreach ($i in 1..30) {
    Start-Sleep -Seconds 2
    if ($proc.HasExited) { break }
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:8756/health" -TimeoutSec 3 -UseBasicParsing
        if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch { }
}
if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }

if (-not $ok) {
    Write-Host "[!] the exe did not answer /health within 60s - the bundle is incomplete" -ForegroundColor Red
    Write-Host "    add the missing module to hiddenimports in $specFile, then re-run." -ForegroundColor Yellow
    if (Test-Path $logErr) {
        Write-Host "--- stderr ---" -ForegroundColor Yellow
        Get-Content $logErr -Tail 40
    }
    exit 1
}
Write-Host "[*] smoke test passed" -ForegroundColor Green
Remove-Item $logOut, $logErr -ErrorAction SilentlyContinue

# ── 6) copy ไป binaries/ พร้อม _internal (ต้องอยู่ข้าง ๆ .exe เสมอ) ───────
# sidecar_entry.py สร้าง data/ ข้าง ๆ ตัว exe ตอน smoke test — ห้าม copy เข้า bundle
# (ไม่งั้น installer จะพก data/ เปล่า ๆ ของเครื่อง build ไปด้วย)
$smokeData = Join-Path $distDir "$specName\data"
if (Test-Path $smokeData) { Remove-Item -Recurse -Force $smokeData }

if (Test-Path $sidecarDir) { Remove-Item -Recurse -Force $sidecarDir }   # กันเศษจาก build ก่อนหน้า
New-Item -ItemType Directory -Path $sidecarDir -Force | Out-Null
Copy-Item -Path (Join-Path $distDir "$specName\*") -Destination $sidecarDir -Recurse -Force

$copiedExe = Join-Path $sidecarDir "$specName.exe"
$targetExe = Join-Path $sidecarDir "$specName-$targetTriple.exe"
if (Test-Path $copiedExe) {
    Move-Item -Path $copiedExe -Destination $targetExe -Force
} elseif (-not (Test-Path $targetExe)) {
    Write-Host "[!] $copiedExe not found after copy" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Green
Write-Host " done - sidecar: $targetExe" -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Green
Write-Host " note: model weights (F5-TTS ckpt, whisper) are NOT bundled -"
Write-Host "       they download to the HF cache on first use, by design."
Write-Host " note: this is the LITE runtime. torch/whisper/f5-tts/demucs are"
Write-Host "       excluded in the spec; users install them via the Plugins tab."
