param(
    [Parameter(Mandatory = $true)][string]$Command,
    [string]$Container = "prp-mvp-vllm",
    [int]$ReleaseTimeoutSec = 90,
    [int]$HealthyTimeoutSec = 480
)

# Run one GPU job with exclusive VRAM, then ALWAYS bring the vLLM container back.
#
# Why: on this box the Docker container prp-mvp-vllm (typhoon2.5-qwen3-4b, unquantized bf16,
# --gpu-memory-utilization 0.70) holds ~11 GiB of the 16 GiB. Its own floor is ~9.84 GiB
# (8.59 weights + 1.09 activation + 0.16 CUDA graphs) plus ~1.15 GiB KV for one 8192-token
# request, so lowering its utilization frees only ~0.3 GiB. The ASR worker (~1.3 GiB) fits
# beside it; heavier jobs (pyannote, TTS, float16) do not.
#
# The container's restart policy is unless-stopped: once stopped by hand it never comes back
# by itself, and the PRP LLM endpoint (litellm -> vllm) stays down. This script restarts it in
# a finally block, so a crashing job cannot leave it down. Only if this script itself is killed
# hard is manual recovery needed:  docker start prp-mvp-vllm
#
# Never use "wsl --shutdown" for this: it stops every container, including two Postgres DBs.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File tools\dev\gpu_exclusive.ps1 -Command "python my_gpu_job.py"
#
# Exit codes: the job's exit code; 90 if the container was not healthy again afterwards.
#
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads BOM-less .ps1 files as ANSI.

$ErrorActionPreference = "Stop"

function Get-VramUsedMiB {
    try {
        $out = & nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits 2>$null
        return [int](($out | Select-Object -First 1).Trim())
    } catch {
        return -1
    }
}

function Get-ContainerState([string]$Name) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $state = (& docker inspect $Name --format "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}" 2>$null)
        if ($LASTEXITCODE -ne 0 -or -not $state) { return $null }
        return ($state | Select-Object -First 1).Trim()
    } finally {
        $ErrorActionPreference = $prev
    }
}

$stamp = { (Get-Date).ToString("HH:mm:ss") }
$before = Get-VramUsedMiB
$state = Get-ContainerState $Container
if ($null -eq $state) {
    Write-Host "[$(& $stamp)] container '$Container' not found; running the job without stopping anything" -ForegroundColor Yellow
    & cmd.exe /c $Command
    exit $LASTEXITCODE
}
$wasRunning = $state.StartsWith("running")
Write-Host "[$(& $stamp)] VRAM used before: $before MiB | $Container state: $state" -ForegroundColor Cyan

$jobExit = 0
$restoreFailed = $false
try {
    if ($wasRunning) {
        Write-Host "[$(& $stamp)] stopping $Container (anything served by it is offline until restart)" -ForegroundColor Cyan
        & docker stop $Container | Out-Null
        # Wait until VRAM stops falling (3 equal readings in a row), not for a fixed drop:
        # a container that holds no VRAM must not burn the whole timeout.
        $deadline = (Get-Date).AddSeconds($ReleaseTimeoutSec)
        $now = Get-VramUsedMiB
        $stable = 0
        do {
            Start-Sleep -Seconds 2
            $next = Get-VramUsedMiB
            if ($next -eq $now) { $stable++ } else { $stable = 0 }
            $now = $next
        } while ((Get-Date) -lt $deadline -and $stable -lt 3)
        Write-Host "[$(& $stamp)] VRAM used after stop: $now MiB (freed $($before - $now) MiB)" -ForegroundColor Green
    } else {
        Write-Host "[$(& $stamp)] $Container was not running; it will be left as it was" -ForegroundColor Yellow
    }

    Write-Host "[$(& $stamp)] running job: $Command" -ForegroundColor Cyan
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & cmd.exe /c $Command
        $jobExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prev
    }
    Write-Host "[$(& $stamp)] job exit code: $jobExit" -ForegroundColor Cyan
} finally {
    if ($wasRunning) {
        Write-Host "[$(& $stamp)] restarting $Container" -ForegroundColor Cyan
        $prev = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        & docker start $Container | Out-Null
        $ErrorActionPreference = $prev
        $deadline = (Get-Date).AddSeconds($HealthyTimeoutSec)
        $health = ""
        do {
            Start-Sleep -Seconds 5
            $health = Get-ContainerState $Container
        } while ((Get-Date) -lt $deadline -and $health -ne "running|healthy" -and $health -ne "running|none")
        # "running|none" = container has no HEALTHCHECK; running is the best signal available
        if ($health -eq "running|healthy" -or $health -eq "running|none") {
            Write-Host "[$(& $stamp)] $Container healthy again | VRAM used: $(Get-VramUsedMiB) MiB" -ForegroundColor Green
        } else {
            $restoreFailed = $true
            Write-Host "[$(& $stamp)] FAIL: $Container not healthy after $HealthyTimeoutSec s (state: $health). Check: docker logs $Container" -ForegroundColor Red
        }
    }
}

if ($restoreFailed) { exit 90 }
exit $jobExit
