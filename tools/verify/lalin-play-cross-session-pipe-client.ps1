param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^\d+\.\d+$')]
    [string]$Nonce
)

$ErrorActionPreference = 'Stop'
$genericReadWrite = [uint32]3221225472

if (-not ('LalinPlayCrossSessionPipeNative' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public static class LalinPlayCrossSessionPipeNative
{
    [DllImport("kernel32.dll", EntryPoint = "CreateFileW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern SafeFileHandle CreateFile(
        string fileName,
        uint desiredAccess,
        uint shareMode,
        IntPtr securityAttributes,
        uint creationDisposition,
        uint flagsAndAttributes,
        IntPtr templateFile);
}
'@
}

function Open-ProbePipe([string]$Path) {
    $handle = [LalinPlayCrossSessionPipeNative]::CreateFile(
        $Path,
        $genericReadWrite,
        [uint32]0,
        [IntPtr]::Zero,
        [uint32]3,
        [uint32]0,
        [IntPtr]::Zero
    )

    if ($handle.IsInvalid) {
        $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        $handle.Dispose()
        throw [System.ComponentModel.Win32Exception]::new($errorCode)
    }

    return $handle
}

$pipePrefix = "\\.\pipe\ai.lalin.play.handoff.v1.cross-session-$Nonce"
$controlHandle = Open-ProbePipe "$pipePrefix.control"
try {
    $controlStream = [IO.FileStream]::new($controlHandle, [IO.FileAccess]::Write)
    try {
        $controlStream.WriteByte([byte][char]'C')
        $controlStream.Flush()
    }
    finally {
        $controlStream.Dispose()
    }
}
finally {
    $controlHandle.Dispose()
}

$targetHandle = [LalinPlayCrossSessionPipeNative]::CreateFile(
    "$pipePrefix.target",
    $genericReadWrite,
    [uint32]0,
    [IntPtr]::Zero,
    [uint32]3,
    [uint32]0,
    [IntPtr]::Zero
)
if ($targetHandle.IsInvalid) {
    $targetError = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    $targetHandle.Dispose()
}
else {
    $targetHandle.Dispose()
    $targetError = 0
}

$resultHandle = Open-ProbePipe "$pipePrefix.result"
try {
    $resultStream = [IO.FileStream]::new($resultHandle, [IO.FileAccess]::Write)
    try {
        $resultBytes = [Text.Encoding]::ASCII.GetBytes("control=0;target=$targetError")
        if ($resultBytes.Length -gt 64) {
            throw 'Probe result exceeded the fixed payload size.'
        }
        $payload = [byte[]]::new(64)
        [Buffer]::BlockCopy($resultBytes, 0, $payload, 0, $resultBytes.Length)
        $resultStream.Write($payload, 0, $payload.Length)
        $resultStream.Flush()
    }
    finally {
        $resultStream.Dispose()
    }
}
finally {
    $resultHandle.Dispose()
}

Write-Output "CROSS_SESSION_PROBE_RESULT control=connected target_win32_error=$targetError"
if ($targetError -ne 5) {
    [Console]::Error.WriteLine("Expected ERROR_ACCESS_DENIED (5) for the different-logon target pipe; received $targetError.")
    exit 1
}
