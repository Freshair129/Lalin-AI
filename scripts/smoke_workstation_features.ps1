param(
    [string]$PythonPath
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$backendDir = Join-Path $root "backend"
if ([string]::IsNullOrWhiteSpace($PythonPath)) {
    $PythonPath = Join-Path $backendDir ".venv\Scripts\python.exe"
}

if (-not (Test-Path $PythonPath)) {
    Write-Host "[!] Missing backend Python: $PythonPath" -ForegroundColor Red
    Write-Host "    Run: powershell -ExecutionPolicy Bypass -File scripts\setup_windows.ps1" -ForegroundColor Yellow
    exit 1
}

$env:PYTHONIOENCODING = "utf-8"

function Invoke-SmokeStep {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [string]$WorkingDirectory = $backendDir
    )

    Write-Host ""
    Write-Host "=====================================================" -ForegroundColor Cyan
    Write-Host " $Name" -ForegroundColor Cyan
    Write-Host "=====================================================" -ForegroundColor Cyan

    Push-Location $WorkingDirectory
    try {
        & $PythonPath @Arguments
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[!] $Name failed with exit code $LASTEXITCODE." -ForegroundColor Red
            exit $LASTEXITCODE
        }
    } finally {
        Pop-Location
    }
}

function Invoke-PowerShellStep {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$ScriptPath
    )

    Write-Host ""
    Write-Host "=====================================================" -ForegroundColor Cyan
    Write-Host " $Name" -ForegroundColor Cyan
    Write-Host "=====================================================" -ForegroundColor Cyan

    & powershell -ExecutionPolicy Bypass -File $ScriptPath -PythonPath $PythonPath
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[!] $Name failed with exit code $LASTEXITCODE." -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host " G-Music - workstation feature smoke" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

Invoke-PowerShellStep -Name "Full profile readiness" -ScriptPath (Join-Path $root "scripts\smoke_full_profile_readiness.ps1")
Invoke-SmokeStep -Name "TTS voice clone smoke" -Arguments @("smoke_tts.py")
Invoke-SmokeStep -Name "Auto mastering smoke" -Arguments @("smoke_mastering.py")
Invoke-SmokeStep -Name "Remix smoke" -Arguments @("smoke_remix.py")

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Green
Write-Host " Workstation feature smoke passed." -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Green
