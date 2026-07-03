$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$backendDir = Join-Path $root "backend"
$venvPy = Join-Path $backendDir ".venv\Scripts\python.exe"
$venvPyInstaller = Join-Path $backendDir ".venv\Scripts\pyinstaller.exe"
$distDir = Join-Path $backendDir "dist"
$buildDir = Join-Path $backendDir "build"
$specName = "g-music-backend"
$specFile = Join-Path $backendDir "$specName.spec"
$sidecarDir = Join-Path $root "frontend\src-tauri\binaries"
$entryScript = Join-Path $backendDir "sidecar_entry.py"
$profile = $env:GMUSIC_BACKEND_PROFILE
if ([string]::IsNullOrWhiteSpace($profile)) {
    $profile = "lite"
}

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host " G-Music - build backend sidecar" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

if (-not (Test-Path $venvPy)) {
    Write-Host "[!] Missing backend venv: $venvPy" -ForegroundColor Red
    Write-Host "    Run: powershell -ExecutionPolicy Bypass -File scripts\setup_windows.ps1" -ForegroundColor Yellow
    exit 1
}
Write-Host "[*] Found venv: $venvPy" -ForegroundColor Green

if (-not (Test-Path $entryScript)) {
    Write-Host "[!] Missing sidecar entrypoint: $entryScript" -ForegroundColor Red
    exit 1
}
Write-Host "[*] Found entrypoint: $entryScript" -ForegroundColor Green
Write-Host "[*] Backend profile: $profile" -ForegroundColor Green

if (-not (Test-Path $venvPyInstaller)) {
    Write-Host "[!] PyInstaller is not installed in backend venv; installing it now." -ForegroundColor Yellow
    Write-Host "[i] Ensuring pip is available in backend venv." -ForegroundColor DarkYellow
    & $venvPy -m ensurepip --upgrade
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[!] Failed to bootstrap pip with ensurepip." -ForegroundColor Red
        exit 1
    }
    & $venvPy -m pip install pyinstaller
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
if (Test-Path $specFile) { Remove-Item -Force $specFile }

Push-Location $backendDir
try {
    Write-Host "[*] Running PyInstaller (--onedir). This may take several minutes with ML dependencies." -ForegroundColor Cyan
    $env:GMUSIC_BACKEND_PROFILE = $profile
    & $venvPyInstaller `
        --name $specName `
        --onedir `
        --noconfirm `
        --clean `
        --console `
        sidecar_entry.py

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
