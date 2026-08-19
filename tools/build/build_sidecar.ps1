param(
    [ValidateSet("lite", "full")]
    [string]$Profile = "",
    [string]$VenvPath = "",
    [switch]$CreateIfMissing
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
$backendDir = Join-Path $root "apps\api"
if ($VenvPath) {
    $venvDir = $VenvPath
} else {
    $venvDir = Join-Path $backendDir ".venv"
    if (-not (Test-Path (Join-Path $venvDir "Scripts\python.exe"))) {
        $venvDir = Join-Path $root "backend\.venv"
    }
}
$venvPy = Join-Path $venvDir "Scripts\python.exe"
$venvPyInstaller = Join-Path $venvDir "Scripts\pyinstaller.exe"
$distDir = Join-Path $backendDir "dist"
$buildDir = Join-Path $backendDir "build"
$specName = "g-music-backend"
# .spec ตัวนี้ track ไว้ใน git โดยตั้งใจ (excludes/hiddenimports ที่ปรับด้วยมือหลัง
# วน build จริงหลายรอบ — ดู g-music-backend.spec เอง) ห้ามลบ/regenerate ใหม่เด็ดขาด
# มิฉะนั้น PyInstaller จะไล่ lazy import ตาม torch/demucs/boto3/numba/pyarrow ที่ทำให้
# bundle บวมกลับไปที่ ~458MB (จากที่ลดลงมาเหลือ ~237MB)
$specFile = Join-Path $backendDir "$specName.spec"
$sidecarDir = Join-Path $root "apps\desktop\src-tauri\binaries"
$entryScript = Join-Path $backendDir "sidecar_entry.py"
$profile = $Profile
if ([string]::IsNullOrWhiteSpace($profile)) {
    $profile = $env:GMUSIC_BACKEND_PROFILE
}
if ([string]::IsNullOrWhiteSpace($profile)) {
    $profile = "lite"
}

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host " G-Music - build backend sidecar" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

if (-not (Test-Path $venvPy)) {
    if ($CreateIfMissing) {
        Write-Host "[*] Creating venv: $venvDir" -ForegroundColor Cyan
        py -3.11 -m venv $venvDir
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $venvPy)) {
            Write-Host "[!] Failed to create venv at $venvDir" -ForegroundColor Red
            exit 1
        }
        & $venvPy -m pip install -r (Join-Path $backendDir "requirements.txt")
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[!] Failed to install requirements.txt into the new venv." -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "[!] Missing backend venv: $venvPy" -ForegroundColor Red
        Write-Host "    Run from apps\api: powershell -ExecutionPolicy Bypass -File ..\..\tools\dev\setup_windows.ps1" -ForegroundColor Yellow
        exit 1
    }
}
Write-Host "[*] Found venv: $venvPy" -ForegroundColor Green

if (-not (Test-Path $entryScript)) {
    Write-Host "[!] Missing sidecar entrypoint: $entryScript" -ForegroundColor Red
    exit 1
}
Write-Host "[*] Found entrypoint: $entryScript" -ForegroundColor Green
Write-Host "[*] Backend profile: $profile" -ForegroundColor Green

if (-not (Test-Path $specFile)) {
    Write-Host "[!] Missing tracked spec file: $specFile" -ForegroundColor Red
    Write-Host "    This file is checked into git on purpose (see comment above) — it must" -ForegroundColor Yellow
    Write-Host "    already exist. Do not auto-generate a new one; that drops the excludes" -ForegroundColor Yellow
    Write-Host "    tuning and reinflates the bundle." -ForegroundColor Yellow
    exit 1
}
Write-Host "[*] Found tracked spec: $specFile" -ForegroundColor Green

if (-not (Test-Path $venvPyInstaller)) {
    Write-Host "[!] PyInstaller is not installed in backend venv; installing it now." -ForegroundColor Yellow
    Write-Host "[i] Ensuring pip is available in backend venv." -ForegroundColor DarkYellow
    & $venvPy -m ensurepip --upgrade
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[!] Failed to bootstrap pip with ensurepip." -ForegroundColor Red
        exit 1
    }
    & $venvPy -m pip install "pyinstaller>=6.11"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[!] Failed to install PyInstaller." -ForegroundColor Red
        exit 1
    }
    if (-not (Test-Path $venvPyInstaller)) {
        Write-Host "[!] PyInstaller install completed but executable was not found: $venvPyInstaller" -ForegroundColor Red
        exit 1
    }
}
Write-Host "[*] Found PyInstaller: $venvPyInstaller" -ForegroundColor Green

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
    Write-Host "[i] rustc not found; using default target triple: $targetTriple" -ForegroundColor DarkYellow
}
Write-Host "[*] Target triple: $targetTriple" -ForegroundColor Green

if (Test-Path $distDir) { Remove-Item -Recurse -Force $distDir }
if (Test-Path $buildDir) { Remove-Item -Recurse -Force $buildDir }

Push-Location $backendDir
try {
    Write-Host "[*] Running PyInstaller from tracked spec (--onedir). This may take several minutes with ML dependencies." -ForegroundColor Cyan
    $env:GMUSIC_BACKEND_PROFILE = $profile
    & $venvPyInstaller --noconfirm --clean $specFile

    if ($LASTEXITCODE -ne 0) {
        Write-Host "[!] PyInstaller failed; inspect the log above." -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}

$builtExe = Join-Path $distDir "$specName\$specName.exe"
if (-not (Test-Path $builtExe)) {
    Write-Host "[!] Expected built executable was not found: $builtExe" -ForegroundColor Red
    exit 1
}
Write-Host "[*] Built executable: $builtExe" -ForegroundColor Green

# ── Smoke test: boot the exe headless และรอ /health ก่อนเชื่อว่า build ใช้ได้จริง ──
# (เจอบั๊กจริงจากขั้นนี้มาแล้ว: DATA_DIR ผิดที่, sidecar boot ไม่ขึ้นเงียบ ๆ)
$smokePort = 8756
$smokeLog = Join-Path $backendDir "sidecar-smoke.log"
$smokeErr = Join-Path $backendDir "sidecar-smoke.err"
Write-Host "[*] Smoke-testing built exe against /health…" -ForegroundColor Cyan
$proc = Start-Process -FilePath $builtExe -WorkingDirectory (Split-Path $builtExe) `
    -RedirectStandardOutput $smokeLog -RedirectStandardError $smokeErr -PassThru -WindowStyle Hidden
$healthy = $false
try {
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        try {
            $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$smokePort/health" -UseBasicParsing -TimeoutSec 2
            if ($resp.StatusCode -eq 200) { $healthy = $true; break }
        } catch { }
        if ($proc.HasExited) { break }
    }
} finally {
    if (-not $proc.HasExited) {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
}
if (-not $healthy) {
    Write-Host "[!] Sidecar did not answer /health within 30s — see sidecar-smoke.log/.err" -ForegroundColor Red
    exit 1
}
Write-Host "[*] Sidecar answered /health — smoke test passed" -ForegroundColor Green

# smoke test สร้าง data/ ไว้ข้าง exe (sidecar_entry.py ตั้ง DATA_DIR ที่นั่น) — ต้องไม่ให้
# หลุดติดไปกับ binaries/ ที่ copy ให้ Tauri (เคยเป็นบั๊กมาแล้ว)
$leakedData = Join-Path $distDir "$specName\data"
if (Test-Path $leakedData) { Remove-Item -Recurse -Force $leakedData }
Remove-Item -ErrorAction SilentlyContinue -Force $smokeLog, $smokeErr

if (-not (Test-Path $sidecarDir)) {
    New-Item -ItemType Directory -Path $sidecarDir -Force | Out-Null
} else {
    Get-ChildItem -LiteralPath $sidecarDir -Force | Remove-Item -Recurse -Force
}

$targetExeName = "$specName-$targetTriple.exe"
$targetExePath = Join-Path $sidecarDir $targetExeName

Write-Host "[*] Copying PyInstaller onedir output to: $sidecarDir" -ForegroundColor Cyan
Copy-Item -Path (Join-Path $distDir "$specName\*") -Destination $sidecarDir -Recurse -Force

$copiedExe = Join-Path $sidecarDir "$specName.exe"
if (Test-Path $copiedExe) {
    Move-Item -Path $copiedExe -Destination $targetExePath -Force
} elseif (-not (Test-Path $targetExePath)) {
    Write-Host "[!] Could not find copied executable: $copiedExe" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Green
Write-Host " Sidecar ready:" -ForegroundColor Green
Write-Host "   $targetExePath" -ForegroundColor Yellow
Write-Host "=====================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Notes:" -ForegroundColor Cyan
Write-Host " - PyInstaller --onedir dependencies are copied next to the executable."
Write-Host " - Model weights are not embedded; first run may download/cache models."
Write-Host " - Run cargo check or tauri build next to validate Tauri sidecar integration."
