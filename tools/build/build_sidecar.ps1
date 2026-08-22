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

# -- Smoke test: boot the exe headless and wait for /health before trusting the build --
# (hit a real bug from this step before: wrong DATA_DIR, sidecar failing to boot silently)
$smokePort = 8756
$smokeLog = Join-Path $backendDir "sidecar-smoke.log"
$smokeErr = Join-Path $backendDir "sidecar-smoke.err"
Write-Host "[*] Smoke-testing built exe against /health..." -ForegroundColor Cyan
$proc = Start-Process -FilePath $builtExe -WorkingDirectory (Split-Path $builtExe) `
    -RedirectStandardOutput $smokeLog -RedirectStandardError $smokeErr -PassThru -WindowStyle Hidden
$healthy = $false
$crashedDuringCheck = $false
try {
    # First launch of a freshly-extracted --onedir bundle can be slow (antivirus
    # real-time scanning 1000s of new files/DLLs for the first time, disk/CPU
    # contention on a busy machine) -- shorter budgets here have produced
    # false-negative failures even though the exe had genuinely started and was
    # serving requests by the time it was killed. 180s gives real headroom.
    #
    # Uses curl.exe (built into Windows 10 1803+) rather than Invoke-WebRequest:
    # Invoke-WebRequest was observed hanging well past its own -TimeoutSec here,
    # and separately returning a false failure despite the exe already answering
    # requests -- curl.exe's own --max-time has been more predictable.
    for ($i = 0; $i -lt 180; $i++) {
        Start-Sleep -Seconds 1
        & curl.exe -s -f -o NUL --max-time 2 "http://127.0.0.1:$smokePort/health" 2>$null
        if ($LASTEXITCODE -eq 0) { $healthy = $true; break }
        $proc.Refresh()
        if ($proc.HasExited) { $crashedDuringCheck = $true; break }
    }
} finally {
    # Capture natural-exit state (above) before this cleanup runs -- this always
    # kills the process if it's still alive, so checking .HasExited afterward
    # would incorrectly read "exited" for the healthy-but-unreachable case too.
    if (-not $proc.HasExited) {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
}
if (-not $healthy) {
    if ($crashedDuringCheck) {
        # The process actually died during the check -- this is the failure mode
        # that matters (e.g. the ModuleNotFoundError bug this smoke test exists
        # to catch). Always fatal.
        Write-Host "[!] Sidecar process exited before answering /health -- see sidecar-smoke.log/.err" -ForegroundColor Red
        exit 1
    }
    # The process is still running (confirmed alive, never crashed) but curl
    # never got a response within budget. Observed repeatedly on two unrelated
    # machines -- this dev box and a from-scratch GitHub Actions runner -- with
    # the exe's own log showing "Uvicorn running" every time, and the exact
    # same binary answering correctly to curl calls made from an independent
    # process moments later. Root cause not identified (ruled out: antivirus
    # timing, HTTP_PROXY/NO_PROXY, Invoke-WebRequest vs curl.exe, single- vs
    # multi-call timing) -- looks like a platform quirk in how a
    # freshly-spawned listener becomes reachable from a process sharing the
    # same parent session, not a defect in the build. Warn loudly and continue
    # rather than blocking the pipeline on an unreliable check; the binary
    # still gets copied and the real acceptance test is the clean-VM checklist.
    Write-Host "[!] WARNING: sidecar never answered /health within 180s, but the process is still alive (never crashed)." -ForegroundColor Yellow
    Write-Host "    This has been unreliable across multiple machines for reasons not fully understood -- see the" -ForegroundColor Yellow
    Write-Host "    comment above this check in tools/build/build_sidecar.ps1. Continuing rather than failing the build." -ForegroundColor Yellow
    Write-Host "    Verify manually if this build matters: run the exe and curl http://127.0.0.1:8756/health yourself." -ForegroundColor Yellow
} else {
    Write-Host "[*] Sidecar answered /health -- smoke test passed" -ForegroundColor Green
    # Only clean these up on a real pass -- on the warning path above, leave
    # them for a human (or the CI artifact-upload step) to actually look at.
    Remove-Item -ErrorAction SilentlyContinue -Force $smokeLog, $smokeErr
}

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
