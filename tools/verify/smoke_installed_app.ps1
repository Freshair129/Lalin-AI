param(
    [string]$InstallerPath,
    [string]$InstallDir,
    [int]$TimeoutSeconds = 90
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
if ([string]::IsNullOrWhiteSpace($InstallerPath)) {
    $InstallerPath = Join-Path $root "apps\desktop\src-tauri\target\release\bundle\nsis\G-Music_0.1.0_x64-setup.exe"
}
if ([string]::IsNullOrWhiteSpace($InstallDir)) {
    $InstallDir = Join-Path $root "apps\desktop\src-tauri\target\installed-smoke"
}

$installer = Resolve-Path -LiteralPath $InstallerPath -ErrorAction Stop
$installRoot = [System.IO.Path]::GetFullPath($InstallDir)
$repoTarget = [System.IO.Path]::GetFullPath((Join-Path $root "apps\desktop\src-tauri\target"))

function Test-PathWithinRoot {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$RootPath
    )

    $fullPath = [System.IO.Path]::GetFullPath($Path).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
    $fullRoot = [System.IO.Path]::GetFullPath($RootPath).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
    return $fullPath.Equals($fullRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
        $fullPath.StartsWith($fullRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase) -or
        $fullPath.StartsWith($fullRoot + [System.IO.Path]::AltDirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
}

if (-not (Test-PathWithinRoot -Path $installRoot -RootPath $repoTarget)) {
    Write-Host "[!] Refusing to install outside repo target: $installRoot" -ForegroundColor Red
    exit 1
}

function Stop-SmokeProcesses {
    Get-CimInstance Win32_Process |
        Where-Object {
            $_.ExecutablePath -and
            (Test-PathWithinRoot -Path $_.ExecutablePath -RootPath $installRoot)
        } |
        ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
}

function Get-InstalledBackendListener {
    Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort 8756 -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object {
            $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($_.OwningProcess)" -ErrorAction SilentlyContinue
            if ($process -and $process.ExecutablePath -and
                (Test-PathWithinRoot -Path $process.ExecutablePath -RootPath $installRoot) -and
                ([System.IO.Path]::GetFileName($process.ExecutablePath) -like "g-music-backend*.exe")) {
                $process
            }
        } |
        Select-Object -First 1
}

Stop-SmokeProcesses
if (Test-Path $installRoot) {
    Remove-Item -LiteralPath $installRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $installRoot -Force | Out-Null

Write-Host "[*] Installing smoke copy to: $installRoot" -ForegroundColor Cyan
$installArgs = @("/S", "/D=$installRoot")
$install = Start-Process -FilePath $installer.Path -ArgumentList $installArgs -Wait -PassThru
if ($install.ExitCode -ne 0) {
    Write-Host "[!] Installer failed with exit code $($install.ExitCode)." -ForegroundColor Red
    exit $install.ExitCode
}

$appExe = Join-Path $installRoot "G-Music.exe"
if (-not (Test-Path $appExe)) {
    Write-Host "[!] Installed app exe was not found: $appExe" -ForegroundColor Red
    exit 1
}

$sidecarExe = Get-ChildItem -LiteralPath $installRoot -Recurse -Filter "g-music-backend*.exe" | Select-Object -First 1
if (-not $sidecarExe) {
    Write-Host "[!] Installed backend sidecar executable was not found under: $installRoot" -ForegroundColor Red
    exit 1
}

$internalDir = Join-Path $sidecarExe.DirectoryName "_internal"
if (-not (Test-Path $internalDir)) {
    Write-Host "[!] Installed PyInstaller _internal directory was not found beside sidecar: $internalDir" -ForegroundColor Red
    exit 1
}

Write-Host "[*] Launching installed app." -ForegroundColor Cyan
$app = Start-Process -FilePath $appExe -WorkingDirectory $installRoot -PassThru
try {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $health = $null
    $rootResponse = $null
    $backendProcess = $null
    while ((Get-Date) -lt $deadline) {
        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:8756/health" -TimeoutSec 2
            $rootResponse = Invoke-RestMethod -Uri "http://127.0.0.1:8756/" -TimeoutSec 2
            $backendProcess = Get-InstalledBackendListener
            if ($backendProcess) {
                break
            }
        } catch {
        }
        Start-Sleep -Seconds 2
    }

    if (-not $health -or -not $backendProcess) {
        Write-Host "[!] Installed app did not expose an installed-root backend listener within $TimeoutSeconds seconds." -ForegroundColor Red
        exit 1
    }
    if ($health.status -ne "ok" -or $health.service -ne "g-music") {
        Write-Host "[!] Unexpected /health response: $($health | ConvertTo-Json -Compress)" -ForegroundColor Red
        exit 1
    }
    if ($rootResponse.profile -ne "lite") {
        Write-Host "[!] Unexpected root profile response: $($rootResponse | ConvertTo-Json -Compress)" -ForegroundColor Red
        exit 1
    }

    Write-Host "[OK] Installed app smoke passed." -ForegroundColor Green
    Write-Host "     App: $appExe"
    Write-Host "     Sidecar: $($sidecarExe.FullName)"
    Write-Host "     Backend PID: $($backendProcess.ProcessId)"
    Write-Host "     Health: status=$($health.status), service=$($health.service), profile=$($rootResponse.profile)"
} finally {
    Stop-SmokeProcesses
    if ($app -and -not $app.HasExited) {
        Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue
    }
}
