param(
    [switch]$WithUpdaterArtifacts
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
$keyPath = Join-Path $root "keys\g-music.key"
$frontendDir = Join-Path $root "apps\desktop"
$tauriConfigPath = Join-Path $frontendDir "src-tauri\tauri.conf.json"
$bundleDir = Join-Path $frontendDir "src-tauri\target\release\bundle\nsis"
$tauriCli = Join-Path $frontendDir "node_modules\.bin\tauri.cmd"
$buildLog = Join-Path $frontendDir "src-tauri\target\release\bundle\tauri-build.log"
$buildErr = Join-Path $frontendDir "src-tauri\target\release\bundle\tauri-build.err"
$releaseBuildConfig = Join-Path $frontendDir "src-tauri\target\release\bundle\tauri-release-no-updater.json"

if (-not (Test-Path $tauriConfigPath)) {
    Write-Host "[!] Missing Tauri config: $tauriConfigPath" -ForegroundColor Red
    exit 1
}

try {
    $tauriConfig = Get-Content $tauriConfigPath -Raw | ConvertFrom-Json
    $version = [string]$tauriConfig.version
} catch {
    Write-Host "[!] Could not read Tauri version from $tauriConfigPath" -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrWhiteSpace($version)) {
    Write-Host "[!] Tauri config does not define a release version." -ForegroundColor Red
    exit 1
}

$setupPath = Join-Path $bundleDir ("G-Music_{0}_x64-setup.exe" -f $version)
$setupSigPath = "$setupPath.sig"

function Test-ArtifactReady {
    param(
        [string[]]$Paths,
        [datetime]$NotBefore,
        [hashtable]$PreviousLengths
    )

    foreach ($path in $Paths) {
        if (-not (Test-Path $path)) {
            return $false
        }
        $item = Get-Item $path
        if ($item.Length -le 0 -or $item.LastWriteTime -lt $NotBefore) {
            return $false
        }
        if (-not $PreviousLengths.ContainsKey($path) -or $PreviousLengths[$path] -ne $item.Length) {
            $PreviousLengths[$path] = $item.Length
            return $false
        }
    }
    return $true
}

function Test-ArtifactFresh {
    param(
        [string[]]$Paths,
        [datetime]$NotBefore
    )

    foreach ($path in $Paths) {
        if (-not (Test-Path $path)) {
            return $false
        }
        $item = Get-Item $path
        if ($item.Length -le 0 -or $item.LastWriteTime -lt $NotBefore) {
            return $false
        }
    }
    return $true
}

function Test-BuildLogHasSuccessfulBundle {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        return $false
    }
    return [bool](Select-String -Path $Path -Pattern "Finished 1 bundle" -Quiet)
}

function Test-BuildLogHasError {
    param([string[]]$Paths)
    foreach ($path in $Paths) {
        if ((Test-Path $path) -and (Select-String -Path $path -Pattern "\bError\b|failed" -Quiet)) {
            return $true
        }
    }
    return $false
}

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
    Write-Host "    Run npm install in apps\desktop first." -ForegroundColor Yellow
    exit 1
}

Write-Host "[*] Building Tauri NSIS installer." -ForegroundColor Cyan
Set-Location $frontendDir
New-Item -ItemType Directory -Path (Split-Path -Parent $buildLog) -Force | Out-Null
if (Test-Path $setupPath) {
    Remove-Item -Force $setupPath
}
if ($WithUpdaterArtifacts) {
    Remove-Item $setupSigPath -Force -ErrorAction SilentlyContinue
}
Remove-Item $buildLog, $buildErr -ErrorAction SilentlyContinue
Remove-Item $releaseBuildConfig -Force -ErrorAction SilentlyContinue

$tauriArgs = @("build", "--ci")
if ($WithUpdaterArtifacts) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $releaseBuildConfig) -Force | Out-Null
    '{"bundle":{"createUpdaterArtifacts":false}}' | Set-Content -Path $releaseBuildConfig -Encoding utf8
    $tauriArgs = @("build", "--ci", "--config", $releaseBuildConfig)
}

$buildStartedAt = Get-Date
$process = Start-Process `
    -FilePath $tauriCli `
    -ArgumentList $tauriArgs `
    -WorkingDirectory $frontendDir `
    -RedirectStandardOutput $buildLog `
    -RedirectStandardError $buildErr `
    -WindowStyle Hidden `
    -PassThru

if ($WithUpdaterArtifacts) {
    $releaseArtifacts = @($setupPath, $setupSigPath)
    $deadline = (Get-Date).AddMinutes(15)
    while (-not $process.HasExited -and (Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 5
        $process.Refresh()
    }

    if (-not $process.HasExited) {
        Write-Host "[!] Tauri release build did not exit before timeout." -ForegroundColor Red
        if (Test-Path $buildLog) { Get-Content $buildLog -Tail 80 }
        if (Test-Path $buildErr) { Get-Content $buildErr -Tail 120 }
        Stop-ProcessTree -RootProcessId $process.Id
        exit 1
    }

    $process.WaitForExit()
    if ($process.ExitCode -ne 0) {
        $exitCode = if ($null -eq $process.ExitCode) { 1 } else { $process.ExitCode }
        $setupIsFresh = Test-ArtifactFresh -Paths @($setupPath) -NotBefore $buildStartedAt
        $bundleFinished = Test-BuildLogHasSuccessfulBundle -Path $buildErr
        $logHasError = Test-BuildLogHasError -Paths @($buildLog, $buildErr)
        if ($setupIsFresh -and $bundleFinished -and -not $logHasError) {
            Write-Host "[i] Tauri wrapper exited $exitCode after NSIS success; continuing to explicit updater signing." -ForegroundColor DarkYellow
        } else {
            Write-Host "[!] Tauri release build failed." -ForegroundColor Red
            if (Test-Path $buildLog) { Get-Content $buildLog -Tail 80 }
            if (Test-Path $buildErr) { Get-Content $buildErr -Tail 120 }
            exit $exitCode
        }
    }

    if (-not (Test-ArtifactFresh -Paths @($setupPath) -NotBefore $buildStartedAt)) {
        Write-Host "[!] Tauri release build did not create a fresh setup executable." -ForegroundColor Red
        if (Test-Path $buildLog) { Get-Content $buildLog -Tail 80 }
        if (Test-Path $buildErr) { Get-Content $buildErr -Tail 120 }
        exit 1
    }

    Write-Host "[*] Signing updater artifact." -ForegroundColor Cyan
    Push-Location $frontendDir
    try {
        & $tauriCli signer sign --password= $setupPath
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[!] Updater artifact signing failed." -ForegroundColor Red
            exit $LASTEXITCODE
        }
    } finally {
        Pop-Location
    }

    if (-not (Test-ArtifactFresh -Paths $releaseArtifacts -NotBefore $buildStartedAt)) {
        Write-Host "[!] Tauri build did not create fresh stable release artifacts before timeout." -ForegroundColor Red
        foreach ($artifact in $releaseArtifacts) {
            if (Test-Path $artifact) {
                $item = Get-Item $artifact
                Write-Host "    $artifact ($($item.Length) bytes, LastWriteTime $($item.LastWriteTime))" -ForegroundColor Yellow
            } else {
                Write-Host "    Missing: $artifact" -ForegroundColor Yellow
            }
        }
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
        $process.Refresh()
        if ($process.HasExited -and -not $artifactStable) {
            $process.WaitForExit()
            $setupIsFresh = Test-ArtifactFresh -Paths @($setupPath) -NotBefore $buildStartedAt
            $bundleFinished = Test-BuildLogHasSuccessfulBundle -Path $buildErr
            $logHasError = Test-BuildLogHasError -Paths @($buildLog, $buildErr)
            if ($setupIsFresh -and $bundleFinished -and -not $logHasError) {
                $artifactStable = $true
                break
            }

            $exitCode = if ($null -eq $process.ExitCode -or $process.ExitCode -eq 0) { 1 } else { $process.ExitCode }
            Write-Host "[!] Tauri build exited before installer artifact was ready." -ForegroundColor Red
            if (Test-Path $buildLog) { Get-Content $buildLog -Tail 80 }
            if (Test-Path $buildErr) { Get-Content $buildErr -Tail 120 }
            exit $exitCode
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

# Explicit exit 0: this script shells out to tauri.cmd/curl-like native tools
# throughout, and $LASTEXITCODE from any of those can outlive a later
# genuinely-successful check (pure cmdlets don't reset it) -- a script with no
# explicit exit uses that stale value as its own exit code under `pwsh -File`.
# See tools/build/build_sidecar.ps1 for where this bit for real in CI.
exit 0
