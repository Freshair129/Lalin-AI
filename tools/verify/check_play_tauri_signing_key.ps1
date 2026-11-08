$ErrorActionPreference = "Stop"

function Stop-Preflight {
    param([string]$Message)
    [Console]::Error.WriteLine("[play-release-preflight] ERROR: $Message")
    exit 1
}

$encodedKey = $env:PLAY_TAURI_SIGNING_PRIVATE_KEY
if ([string]::IsNullOrWhiteSpace($encodedKey)) {
    Stop-Preflight "PLAY_TAURI_SIGNING_PRIVATE_KEY is required for Play updater artifacts."
}
if ([string]::IsNullOrWhiteSpace($env:PLAY_TAURI_SIGNING_PRIVATE_KEY_PASSWORD)) {
    Stop-Preflight "PLAY_TAURI_SIGNING_PRIVATE_KEY_PASSWORD is required for the encrypted Play updater key."
}

if ($encodedKey.TrimStart()[0] -eq [char]0xFEFF) {
    Stop-Preflight "PLAY_TAURI_SIGNING_PRIVATE_KEY starts with a UTF-8 BOM (Windows PowerShell 5.1 pipe). Set it again with gh secret set --body from the key file."
}

try {
    $decodedBytes = [Convert]::FromBase64String($encodedKey.Trim())
    $strictUtf8 = [Text.UTF8Encoding]::new($false, $true)
    $decodedKey = $strictUtf8.GetString($decodedBytes)
} catch {
    Stop-Preflight "PLAY_TAURI_SIGNING_PRIVATE_KEY is not a valid base64-encoded Tauri updater key."
}

$keyLines = $decodedKey -split "`r?`n"
$validHeader = $keyLines.Count -ge 2 -and
    $keyLines[0] -match '^untrusted comment: (rsign|minisign) encrypted secret key$'
$hasPayload = $keyLines.Count -ge 2 -and
    -not [string]::IsNullOrWhiteSpace($keyLines[1])
if (-not $validHeader -or -not $hasPayload) {
    Stop-Preflight "PLAY_TAURI_SIGNING_PRIVATE_KEY is not a valid base64-encoded Tauri updater key."
}

$encodedKey = $null
$decodedBytes = $null
$decodedKey = $null
$keyLines = $null
Write-Host "[play-release-preflight] Play updater signing key preflight passed."
