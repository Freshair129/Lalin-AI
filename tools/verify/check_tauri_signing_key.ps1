$ErrorActionPreference = "Stop"

function Stop-Preflight {
    param([string]$Message)

    [Console]::Error.WriteLine("[release-preflight] ERROR: $Message")
    exit 1
}

$encodedKey = $env:TAURI_SIGNING_PRIVATE_KEY
if ([string]::IsNullOrWhiteSpace($encodedKey)) {
    Stop-Preflight "TAURI_SIGNING_PRIVATE_KEY is required for updater artifacts."
}

try {
    $decodedBytes = [Convert]::FromBase64String($encodedKey.Trim())
    $strictUtf8 = [Text.UTF8Encoding]::new($false, $true)
    $decodedKey = $strictUtf8.GetString($decodedBytes)
} catch {
    Stop-Preflight "TAURI_SIGNING_PRIVATE_KEY is not a valid base64-encoded Tauri updater key."
}

$keyLines = $decodedKey -split "`r?`n"
$validHeader = $keyLines.Count -ge 2 -and
    $keyLines[0] -match '^untrusted comment: (rsign|minisign) encrypted secret key$'
$hasPayload = $keyLines.Count -ge 2 -and
    -not [string]::IsNullOrWhiteSpace($keyLines[1])

if (-not $validHeader -or -not $hasPayload) {
    Stop-Preflight "TAURI_SIGNING_PRIVATE_KEY is not a valid base64-encoded Tauri updater key."
}

Write-Host "[release-preflight] Updater signing key preflight passed."
