param(
    [switch]$WithUpdaterArtifacts
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$keyPath = Join-Path $root "keys\g-music.key"
$frontendDir = Join-Path $root "frontend"
$bundleDir = Join-Path $root "frontend\src-tauri\target\release\bundle\nsis"
$tauriCli = Join-Path $frontendDir "node_modules\.bin\tauri.cmd"
$setupPath = Join-Path $bundleDir "G-Music_0.1.0_x64-setup.exe"
$setupSigPath = Join-Path $bundleDir "G-Music_0.1.0_x64-setup.exe.sig"
$updaterZipPath = Join-Path $bundleDir "G-Music_0.1.0_x64-setup.nsis.zip"
$buildLog = Join-Path $root "frontend\src-tauri\target\release\bundle\tauri-build.log"
$buildErr = Join-Path $root "frontend\src-tauri\target\release\bundle\tauri-build.err"

function Stop-ProcessTree {
    param([int]$RootProcessId)

    $children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $RootProcessId }
    foreach ($child in $children) {
        Stop-ProcessTree -RootProcessId $child.ProcessId
    }
    Stop-Process -Id $RootProcessId -Force -ErrorAction SilentlyContinue
}

if (-not (Test-Path $keyPath)) {
    Write-Host "[!] Missing Tauri signing key: $keyPath" -ForegroundColor Red
    Write-Host "    Generate a local release key first:" -ForegroundColor Yellow
    Write-Host "    cd frontend" -ForegroundColor Yellow
    Write-Host "    npx tauri signer generate --ci -w ..\keys\g-music.key" -ForegroundColor Yellow
    exit 1
}

Write-Host "[*] Loading Tauri signing key." -ForegroundColor Cyan
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $keyPath -Raw).Trim()
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""

if (-not $WithUpdaterArtifacts) {
    Write-Host "[*] Local validation mode: updater artifacts may be skipped by direct artifact checks." -ForegroundColor Cyan
} else {
    Write-Host "[*] Release mode: updater artifacts remain enabled." -ForegroundColor Cyan
}

if (-not (Test-Path $tauriCli)) {
    Write-Host "[!] Missing local Tauri CLI: $tauriCli" -ForegroundColor Red
    Write-Host "    Run npm install in frontend first." -ForegroundColor Yellow
    exit 1
}

Write-Host "[*] Building Tauri NSIS installer." -ForegroundColor Cyan
Set-Location $frontendDir
New-Item -ItemType Directory -Path (Split-Path -Parent $buildLog) -Force | Out-Null
if (Test-Path $setupPath) {
    Remove-Item -Force $setupPath
}
if ($WithUpdaterArtifacts) {
    Remove-Item $setupSigPath, $updaterZipPath -Force -ErrorAction SilentlyContinue
}
Remove-Item $buildLog, $buildErr -ErrorAction SilentlyContinue

$process = Start-Process `
    -FilePath $tauriCli `
    -ArgumentList "build" `
    -WorkingDirectory $frontendDir `
    -RedirectStandardOutput $buildLog `
    -RedirectStandardError $buildErr `
    -WindowStyle Hidden `
    -PassThru

if ($WithUpdaterArtifacts) {
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) {
        Write-Host "[!] Tauri build failed." -ForegroundColor Red
        if (Test-Path $buildLog) { Get-Content $buildLog -Tail 80 }
        if (Test-Path $buildErr) { Get-Content $buildErr -Tail 120 }
        exit $process.ExitCode
    }

    $missingReleaseArtifacts = @()
    foreach ($artifact in @($setupPath, $setupSigPath, $updaterZipPath)) {
        if (-not (Test-Path $artifact) -or (Get-Item $artifact).Length -le 0) {
            $missingReleaseArtifacts += $artifact
        }
    }
    if ($missingReleaseArtifacts.Count -gt 0) {
        Write-Host "[!] Release build exited successfully but required artifact validation failed." -ForegroundColor Red
        $missingReleaseArtifacts | ForEach-Object { Write-Host "    Missing or empty: $_" -ForegroundColor Yellow }
        if (Test-Path $buildLog) { Get-Content $buildLog -Tail 80 }
        if (Test-Path $buildErr) { Get-Content $buildErr -Tail 120 }
        exit 1
    }
} else {
    $stableCount = 0
    $lastLength = -1
    $artifactStable = $false
    $deadline = (Get-Date).AddMinutes(12)
    while ((Get-Date) -lt $deadline) {
        if ($process.HasExited -and $process.ExitCode -ne 0) {
            Write-Host "[!] Tauri build exited before installer artifact was ready." -ForegroundColor Red
            if (Test-Path $buildLog) { Get-Content $buildLog -Tail 80 }
            if (Test-Path $buildErr) { Get-Content $buildErr -Tail 120 }
            exit $process.ExitCode
        }

        if (Test-Path $setupPath) {
            $length = (Get-Item $setupPath).Length
            if ($length -gt 0 -and $length -eq $lastLength) {
                $stableCount += 1
            } else {
                $stableCount = 0
                $lastLength = $length
            }

            if ($stableCount -ge 3) {
                $artifactStable = $true
                if (-not $process.HasExited) {
                    Write-Host "[i] Installer artifact is stable; stopping non-exiting Tauri build wrapper." -ForegroundColor DarkYellow
                    Stop-ProcessTree -RootProcessId $process.Id
                }
                break
            }
        }
        Start-Sleep -Seconds 5
    }

    if (-not $artifactStable) {
        Write-Host "[!] Tauri build did not create a stable installer artifact before timeout." -ForegroundColor Red
        if (Test-Path $buildLog) { Get-Content $buildLog -Tail 80 }
        if (Test-Path $buildErr) { Get-Content $buildErr -Tail 120 }
        if (-not $process.HasExited) { Stop-ProcessTree -RootProcessId $process.Id }
        exit 1
    }
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host " Installer build completed." -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""

if (Test-Path $bundleDir) {
    Write-Host "Release artifacts:" -ForegroundColor Yellow
    Get-ChildItem $bundleDir | ForEach-Object {
        $sizeMb = [math]::Round($_.Length / 1MB, 2)
        Write-Host "  $($_.Name) ($sizeMb MB)"
    }
    Write-Host ""
    Write-Host "Folder: $bundleDir" -ForegroundColor Cyan
} else {
    Write-Host "[!] Expected NSIS output folder was not found: $bundleDir" -ForegroundColor Red
    exit 1
}
