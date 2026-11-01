param(
    [Parameter(Mandatory)][string]$Executable,
    [string]$Arguments = "",
    [int]$Port = 8756,
    [int]$TimeoutSeconds = 180,
    [Parameter(Mandatory)][string]$LogDirectory
)
$ErrorActionPreference = "Stop"
$log = Join-Path $LogDirectory "sidecar-smoke.log"
$err = Join-Path $LogDirectory "sidecar-smoke.err"
New-Item -ItemType Directory -Force $LogDirectory | Out-Null
$probe = [System.Net.Sockets.TcpClient]::new()
try {
    $probe.Connect('127.0.0.1', $Port)
    throw "Port $Port is already in use; refusing to test an unrelated process."
} catch [System.Net.Sockets.SocketException] { } finally { $probe.Dispose() }
$proc = Start-Process -FilePath $Executable -ArgumentList $Arguments -WorkingDirectory (Split-Path $Executable) -RedirectStandardOutput $log -RedirectStandardError $err -PassThru -WindowStyle Hidden
$healthy = $false
$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
try {
    while ([DateTime]::UtcNow -lt $deadline) {
        $proc.Refresh()
        if ($proc.HasExited) { throw "Sidecar exited before answering /health (exit $($proc.ExitCode))." }
        try {
            $json = & curl.exe --noproxy '*' -sS -f --max-time 10 "http://127.0.0.1:$Port/health" 2>$null
            if ($LASTEXITCODE -eq 0) {
                $data = $json | ConvertFrom-Json -ErrorAction Stop
                if ($data.status -eq 'ok' -and $data.service -eq 'g-music') { $healthy = $true; break }
                throw "Unexpected /health response: $json"
            }
        } catch {
            if ($_.Exception.Message -like 'Unexpected /health response*') { throw }
        }
        Start-Sleep -Seconds 1
    }
    if (-not $healthy) { throw "Sidecar did not answer /health within $TimeoutSeconds seconds." }
    Write-Host "Sidecar answered /health with expected status and service."
} finally {
    $proc.Refresh()
    if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; $proc.WaitForExit() }
    if (-not $healthy) {
        Write-Host "Sidecar stdout: $log"
        if (Test-Path $log) { Get-Content $log -Tail 100 }
        Write-Host "Sidecar stderr: $err"
        if (Test-Path $err) { Get-Content $err -Tail 100 }
    }
}
