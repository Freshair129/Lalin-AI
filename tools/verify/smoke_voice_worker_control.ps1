param(
    [string]$PythonPath,
    [ValidateSet("asr", "tts")][string]$Kind = "tts",
    [int]$Port = 8790,
    [string]$WorkDir
)

# Slice A smoke (LVP-AT-001/002/005): boot `python -m app.voice_worker` headless with a stub manifest,
# check liveness/describe/readiness, negative auth, one operation via the reference client, output + erase,
# then stop the process. No torch/model/GPU involved. PASS = control plane boots and honours the contract;
# it is NOT speech-quality or GPU evidence.
#
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads BOM-less .ps1 files as ANSI; UTF-8 Thai bytes
# decode into smart quotes and silently swallow following lines (observed 2026-09-20).

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
$apiDir = Join-Path $root "apps\api"
if ([string]::IsNullOrWhiteSpace($PythonPath)) {
    $PythonPath = Join-Path $apiDir ".venv\Scripts\python.exe"
}
if (-not (Test-Path $PythonPath)) {
    Write-Host "[!] Missing Python: $PythonPath" -ForegroundColor Red
    exit 1
}
if ([string]::IsNullOrWhiteSpace($WorkDir)) {
    $WorkDir = Join-Path $env:TEMP ("lalin-voice-worker-smoke-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
}
New-Item -ItemType Directory -Force $WorkDir | Out-Null

$manifest = Join-Path $apiDir ("profiles\voice-worker\" + $Kind + "-stub.example.json")
$token = "smoke-inference-" + [guid]::NewGuid().ToString("N")
$mgmt = "smoke-management-" + [guid]::NewGuid().ToString("N")
$env:LALIN_VOICE_WORKER_PROFILE_PATH = $manifest
$env:LALIN_VOICE_WORKER_DATA_DIR = Join-Path $WorkDir "worker-data"
$env:LALIN_VOICE_WORKER_PORT = "$Port"
$env:LALIN_VOICE_WORKER_INFERENCE_CREDENTIALS = '{"smoke-coordinator":"' + $token + '"}'
$env:LALIN_VOICE_WORKER_MANAGEMENT_TOKEN = $mgmt
$env:DATA_DIR = Join-Path $WorkDir "studio-data-must-not-exist"
$env:PYTHONIOENCODING = "utf-8"

Write-Host "[*] Booting voice worker ($Kind stub) on 127.0.0.1:$Port ..." -ForegroundColor Cyan
$stdout = Join-Path $WorkDir "worker.out.log"
$stderr = Join-Path $WorkDir "worker.err.log"
$proc = Start-Process -FilePath $PythonPath -ArgumentList "-m", "app.voice_worker" -WorkingDirectory $apiDir `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru -WindowStyle Hidden

$base = "http://127.0.0.1:$Port"
$client = Join-Path $root "tools\verify\voice_worker_client.py"
$env:LALIN_VOICE_WORKER_CLIENT_BASE = $base
$env:LALIN_VOICE_WORKER_CLIENT_TOKEN = $token
$failures = New-Object System.Collections.Generic.List[string]

function Invoke-Client {
    param([string]$Label, [string[]]$ClientArgs)
    Write-Host "[*] $Label" -ForegroundColor Cyan
    # Native stderr is not an error here; only the exit code decides.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $PythonPath $client @ClientArgs 2>&1 | ForEach-Object { Write-Host "    $_" }
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    if ($code -ne 0) {
        $failures.Add("$Label (exit $code)")
        Write-Host "[!] $Label failed with exit code $code" -ForegroundColor Red
    }
    return $code
}

try {
    $live = $false
    for ($i = 0; $i -lt 120; $i++) {
        Start-Sleep -Milliseconds 500
        if ($proc.HasExited) { break }
        try {
            $r = Invoke-WebRequest -UseBasicParsing -Uri "$base/health/live" -TimeoutSec 2
            if ($r.StatusCode -eq 200) { $live = $true; break }
        } catch { }
    }
    if (-not $live) {
        Write-Host "[!] worker did not answer /health/live" -ForegroundColor Red
        Get-Content $stderr -ErrorAction SilentlyContinue | Select-Object -Last 20
        exit 1
    }
    Write-Host "[*] /health/live 200" -ForegroundColor Green

    [void](Invoke-Client -Label "describe" -ClientArgs @("describe"))

    Write-Host "[*] readiness (wait up to 30s)" -ForegroundColor Cyan
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        $json = (& $PythonPath $client readiness 2>$null) -join "`n"
        if ($json -match '"ready":\s*true') { $ready = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) { $failures.Add("readiness never true") } else { Write-Host "[*] ready" -ForegroundColor Green }

    Write-Host "[*] negative auth: wrong token must be 401" -ForegroundColor Cyan
    $unauthorized = $false
    try {
        Invoke-WebRequest -UseBasicParsing -Uri "$base/worker/v1/describe" -Headers @{ Authorization = "Bearer wrong-token-xxxxxxxxxxxxxxxx" } -TimeoutSec 5 | Out-Null
    } catch {
        if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) { $unauthorized = $true }
    }
    if ($unauthorized) { Write-Host "[*] 401 as expected" -ForegroundColor Green } else { $failures.Add("wrong token was not rejected with 401") }

    Write-Host "[*] management token must be 403 on operations" -ForegroundColor Cyan
    $forbidden = $false
    try {
        Invoke-WebRequest -UseBasicParsing -Method Get -Uri "$base/worker/v1/operations/does-not-exist" -Headers @{ Authorization = "Bearer $mgmt" } -TimeoutSec 5 | Out-Null
    } catch {
        if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 403) { $forbidden = $true }
    }
    if ($forbidden) { Write-Host "[*] 403 as expected" -ForegroundColor Green } else { $failures.Add("management token was not rejected with 403") }

    $attempt = "smoke-" + [guid]::NewGuid().ToString("N").Substring(0, 10)
    if ($Kind -eq "tts") {
        $submit = Invoke-Client -Label "tts operation $attempt" -ClientArgs @("tts", "--attempt", $attempt, "--text", "sawatdee krub smoke test", "--preset", "preset-stub-th", "--preset-rev", "r1", "--wait")
        if ($submit -eq 0) {
            $out = Join-Path $WorkDir "smoke-output.wav"
            [void](Invoke-Client -Label "output fetch + sha256 check" -ClientArgs @("output", "--attempt", $attempt, "--out", $out))
        }
    } else {
        $clip = Join-Path $WorkDir "clip.wav"
        [System.IO.File]::WriteAllBytes($clip, [byte[]](1..2048 | ForEach-Object { $_ % 251 }))
        [void](Invoke-Client -Label "asr operation $attempt" -ClientArgs @("asr", "--attempt", $attempt, "--audio", $clip, "--language", "th", "--wait"))
    }
    [void](Invoke-Client -Label "erase payload" -ClientArgs @("erase", "--attempt", $attempt))

    if (Test-Path $env:DATA_DIR) { $failures.Add("worker created Studio DATA_DIR - isolation broken") } else { Write-Host "[*] Studio DATA_DIR untouched" -ForegroundColor Green }

    if ($failures.Count -gt 0) {
        Write-Host "FAIL: $($failures -join '; ')" -ForegroundColor Red
        exit 1
    }
    Write-Host "PASS: voice worker control plane booted headless with the labeled stub engine (not a speech/GPU qualification)" -ForegroundColor Green
    exit 0
} finally {
    if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
    Write-Host "[*] logs: $stdout / $stderr"
}
