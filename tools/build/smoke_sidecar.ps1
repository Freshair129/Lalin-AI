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
            $remaining = ($deadline - [DateTime]::UtcNow).TotalSeconds
            if ($remaining -le 0) { break }
            $maxTime = $remaining.ToString('F3', [System.Globalization.CultureInfo]::InvariantCulture)
            $json = & curl.exe --noproxy '*' -sS -f --max-time $maxTime "http://127.0.0.1:$Port/health" 2>$null
            if ($LASTEXITCODE -eq 0) {
                $data = $json | ConvertFrom-Json -ErrorAction Stop
                if ($data.status -eq 'ok' -and $data.service -eq 'g-music') {
                    # The listener must belong to the launched process or its descendants.
                    $owned = [System.Collections.Generic.HashSet[int]]::new()
                    [void]$owned.Add($proc.Id)
                    $queue = [System.Collections.Generic.Queue[int]]::new()
                    $queue.Enqueue($proc.Id)
                    while ($queue.Count -gt 0) {
                        $parentId = $queue.Dequeue()
                        foreach ($child in @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $parentId")) {
                            if ($owned.Add([int]$child.ProcessId)) { $queue.Enqueue([int]$child.ProcessId) }
                        }
                    }
                    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
                        Where-Object { $_.LocalAddress -eq '127.0.0.1' -or $_.LocalAddress -eq '0.0.0.0' })
                    if (-not ($listeners | Where-Object { $owned.Contains([int]$_.OwningProcess) })) {
                        throw "Health listener is not owned by the launched sidecar."
                    }
                    if ([DateTime]::UtcNow -ge $deadline) { throw "Health response exceeded the deadline." }
                    $proc.Refresh()
                    if ($proc.HasExited) { throw "Sidecar exited after answering /health." }
                    $healthy = $true; break
                }
                throw "Unexpected /health response: $json"
            }
        } catch {
            if ($_.Exception.Message -like 'Unexpected /health response*' -or $_.Exception.Message -like 'Health listener*' -or $_.Exception.Message -like 'Health response exceeded*' -or $_.Exception.Message -like 'Sidecar exited*') { throw }
        }
        Start-Sleep -Seconds 1
    }
    if (-not $healthy) { throw "Sidecar did not answer /health within $TimeoutSeconds seconds." }
    Write-Host "Sidecar answered /health with expected status and service."
} finally {
    $proc.Refresh()
    if (-not $proc.HasExited) {
        # This process was launched by the gate; terminate its children too.
        & taskkill.exe /PID $proc.Id /T /F *> $null
        $proc.WaitForExit()
    }
    if (-not $healthy) {
        Write-Host "Sidecar stdout: $log"
        if (Test-Path $log) { Get-Content $log -Tail 100 }
        Write-Host "Sidecar stderr: $err"
        if (Test-Path $err) { Get-Content $err -Tail 100 }
    }
}
