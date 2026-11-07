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
# Build into a fresh, uniquely-named dist/build dir every run instead of
# deleting a previous run's in place. On this dev machine a prior run's
# output directory has been observed staying locked (empty of files, but the
# directory handle itself held open by something -- never conclusively
# identified, and 60s+ of retries did not clear it) well past any plausible
# antivirus-scan window. Building fresh sidesteps needing to know why.
$runId = [guid]::NewGuid().ToString("N").Substring(0, 8)
$distDir = Join-Path $backendDir "dist-$runId"
$buildDir = Join-Path $backendDir "build-$runId"
$specName = "g-music-backend"
# This .spec file is intentionally tracked in git (excludes/hiddenimports were
# hand-tuned after several real builds -- see g-music-backend.spec itself).
# NEVER delete or regenerate it: PyInstaller will chase lazy imports through
# torch/demucs/boto3/numba/pyarrow and the bundle balloons back to ~458MB
# (down from the ~237MB it is with the tuned excludes).
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

if ($profile -eq "full") {
    & $venvPy -m pip install -r (Join-Path $backendDir "requirements-full.txt")
    if ($LASTEXITCODE -ne 0) { throw "Failed to install full profile requirements." }
}

if (-not (Test-Path $specFile)) {
    Write-Host "[!] Missing tracked spec file: $specFile" -ForegroundColor Red
    Write-Host "    This file is checked into git on purpose (see comment above) -- it must" -ForegroundColor Yellow
    Write-Host "    already exist. Do not auto-generate a new one; that drops the excludes" -ForegroundColor Yellow
    Write-Host "    tuning and reinflates the bundle." -ForegroundColor Yellow
    exit 1
}
Write-Host "[*] Found tracked spec: $specFile" -ForegroundColor Green

# Invoked via "python -m PyInstaller" below rather than the Scripts\pyinstaller.exe
# console-script wrapper: that wrapper embeds an absolute path to its own venv's
# python.exe at install time, so it silently breaks (fails instantly, no output)
# if the venv directory is ever moved/renamed after pip installed it -- "python -m"
# has no such problem since it just resolves through the interpreter that ran it.
& $venvPy -m PyInstaller --version *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] PyInstaller is not installed in venv; installing it now." -ForegroundColor Yellow
    Write-Host "[i] Ensuring pip is available in venv." -ForegroundColor DarkYellow
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
    & $venvPy -m PyInstaller --version *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[!] PyInstaller install completed but 'python -m PyInstaller' still fails." -ForegroundColor Red
        exit 1
    }
}
Write-Host "[*] Found PyInstaller (python -m PyInstaller) in: $venvPy" -ForegroundColor Green

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

# Best-effort cleanup of any leftover dist-*/build-* dirs from earlier runs.
# Non-fatal: this run has its own fresh $distDir/$buildDir regardless, so a
# stale directory that won't delete (locked by something -- see note above)
# is left behind for a human to clean up later rather than blocking the build.
Get-ChildItem -Path $backendDir -Directory -Filter "dist-*" -ErrorAction SilentlyContinue |
    ForEach-Object { try { Remove-Item -Recurse -Force $_.FullName -ErrorAction Stop } catch { } }
Get-ChildItem -Path $backendDir -Directory -Filter "build-*" -ErrorAction SilentlyContinue |
    ForEach-Object { try { Remove-Item -Recurse -Force $_.FullName -ErrorAction Stop } catch { } }

Push-Location $backendDir
try {
    Write-Host "[*] Running PyInstaller from tracked spec (--onedir). This may take several minutes with ML dependencies." -ForegroundColor Cyan
    $env:GMUSIC_BACKEND_PROFILE = $profile
    & $venvPy -m PyInstaller --noconfirm --clean --distpath $distDir --workpath $buildDir $specFile

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

# Fail closed: only a validated response from this freshly spawned sidecar is a pass.
Write-Host "[*] Smoke-testing built exe against /health..." -ForegroundColor Cyan
& (Join-Path $PSScriptRoot "smoke_sidecar.ps1") -Executable $builtExe -LogDirectory $backendDir

# The smoke test creates a data/ dir next to the exe (sidecar_entry.py points DATA_DIR
# there) -- must not leak into binaries/ that gets copied for Tauri (was a real bug).
$leakedData = Join-Path $distDir "$specName\data"
if (Test-Path $leakedData) { Remove-Item -Recurse -Force $leakedData }

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

# Explicit exit 0 matters here: curl.exe's failed attempts inside the smoke-test
# loop above leave $LASTEXITCODE non-zero, and only *external* commands touch
# $LASTEXITCODE (pure cmdlets like Write-Host/Copy-Item don't reset it) -- a
# script invoked via `pwsh -File` with no explicit exit uses that stale value as
# its own exit code. Without this, CI reported step failure even on the
# genuinely-successful warning path above. Confirmed real: this is exactly what
# happened on the v0.1.0-rc1 CI run before this fix.
exit 0
