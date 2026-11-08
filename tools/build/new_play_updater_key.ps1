$ErrorActionPreference = "Stop"

function Stop-KeySetup {
    param([string]$Message)
    [Console]::Error.WriteLine("[play-updater-key] ERROR: $Message")
    exit 1
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$appRoot = Join-Path $repoRoot "apps\play-desktop"
$keysDirectory = Join-Path $repoRoot "keys"
$privateKeyPath = Join-Path $keysDirectory "lalin-play-updater.key"
$publicKeyPath = "$privateKeyPath.pub"
$configPath = Join-Path $appRoot "src-tauri\tauri.conf.json"

if (Test-Path -LiteralPath $privateKeyPath) {
    Stop-KeySetup "Refusing to overwrite keys/lalin-play-updater.key. Preserve the existing Play updater key and use its recovery process."
}
if (Test-Path -LiteralPath $publicKeyPath) {
    Stop-KeySetup "Refusing to overwrite keys/lalin-play-updater.key.pub. Review the existing keypair before continuing."
}

New-Item -ItemType Directory -Path $keysDirectory -Force | Out-Null
$password = Read-Host "Enter a password for the Play updater private key" -AsSecureString
$passwordConfirmation = Read-Host "Confirm the Play updater private key password" -AsSecureString
if ($password.Length -eq 0) {
    Stop-KeySetup "A non-empty password is required for the Play updater key."
}

$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
$confirmationPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($passwordConfirmation)
$plainPassword = $null
$confirmation = $null
$previousPassword = $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
$locationPushed = $false
try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    $confirmation = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmationPointer)
    if ($plainPassword -cne $confirmation) {
        Stop-KeySetup "The entered passwords do not match."
    }

    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $plainPassword
    Push-Location $appRoot
    $locationPushed = $true
    $generatorOutput = @(& npx.cmd tauri signer generate --write-keys $privateKeyPath 2>&1)
    $generatorExitCode = $LASTEXITCODE
    $generatorOutput = $null
    if ($generatorExitCode -ne 0) {
        Stop-KeySetup "Tauri signer generation failed (exit code $generatorExitCode). No key contents were printed."
    }
} catch {
    if ($_.Exception.Message -like "*No key contents were printed.*") { throw }
    Stop-KeySetup "Tauri signer generation failed. No key contents were printed."
} finally {
    $generatorOutput = $null
    if ($locationPushed) { Pop-Location }
    if ($null -eq $previousPassword) {
        Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
    } else {
        $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $previousPassword
    }
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmationPointer)
    $plainPassword = $null
    $confirmation = $null
    $password = $null
    $passwordConfirmation = $null
}

if (-not (Test-Path -LiteralPath $privateKeyPath) -or -not (Test-Path -LiteralPath $publicKeyPath)) {
    Stop-KeySetup "Tauri signer did not create both expected key files. The script will not overwrite or remove partial key material."
}
if ((Get-Item -LiteralPath $privateKeyPath).Length -eq 0 -or (Get-Item -LiteralPath $publicKeyPath).Length -eq 0) {
    Stop-KeySetup "Tauri signer created an empty key file. Preserve the files and investigate before retrying."
}

try {
    # Tauri writes both key files base64-encoded; the config takes the encoded public key as-is.
    $publicKey = [IO.File]::ReadAllText($publicKeyPath).Trim()
    $decodedPublicKey = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($publicKey))
    if ($decodedPublicKey -notmatch '^untrusted comment: minisign public key') {
        Stop-KeySetup "The generated public key has an unexpected format; configuration was not changed."
    }
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    if ($null -eq $config.plugins -or $null -eq $config.plugins.updater) {
        Stop-KeySetup "The updater section is missing from tauri.conf.json; configuration was not changed."
    }
    $config.plugins.updater.pubkey = $publicKey
    $json = ConvertTo-Json -InputObject $config -Depth 100
    [IO.File]::WriteAllText($configPath, $json + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
} catch {
    Stop-KeySetup "Could not write the generated public key to tauri.conf.json. Key files remain at the ignored keys path."
}

Write-Host "Play updater public key configured in apps/play-desktop/src-tauri/tauri.conf.json."
Write-Host "Encrypted private key written to ignored path keys/lalin-play-updater.key; do not commit it."
Write-Host "Run these commands from the repository root to set the owner-managed GitHub secrets:"
Write-Host "(Get-Content -Raw 'keys/lalin-play-updater.key').Trim() | gh secret set PLAY_TAURI_SIGNING_PRIVATE_KEY --repo Freshair129/Lalin-AI"
Write-Host "`$secure = Read-Host 'PLAY_TAURI_SIGNING_PRIVATE_KEY_PASSWORD' -AsSecureString; `$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR(`$secure); try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR(`$bstr) | gh secret set PLAY_TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo Freshair129/Lalin-AI } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR(`$bstr) }"
