param(
    [ValidateSet('1.0.0', '1.0.1')][Parameter(Mandatory)] [string]$Version,
    [string]$Identifier = 'ai.lalin.play.qa'
)

# Builds one isolated QA bundle. Native qualification remains a separate step.
$ErrorActionPreference = 'Stop'
if ($Identifier -cne 'ai.lalin.play.qa') { throw 'Only ai.lalin.play.qa is permitted.' }
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$app = Join-Path $repo 'apps/play-desktop'
$lane = 'F:\cargo-lanes\lalin-play'
$server = Join-Path $lane 'tmp/p15-server'
$keys = Join-Path $lane 'tmp/p15-keys'
$config = Join-Path $server "config-$Version.json"
$lock = Join-Path $lane '.lock'
$cfg = Get-Content -Raw -LiteralPath $config | ConvertFrom-Json
if ($cfg.identifier -cne $Identifier -or $cfg.productName -cne 'Lalin Play QA' -or $cfg.version -cne $Version) { throw 'Unexpected QA config.' }
if ($cfg.plugins.updater.endpoints.Count -ne 1 -or $cfg.plugins.updater.endpoints[0] -cne 'http://127.0.0.1:39347/latest-play.json') { throw 'Unexpected update endpoint.' }
if ($cfg.plugins.updater.pubkey -cne (Get-Content -Raw -LiteralPath (Join-Path $keys 'qa.key.pub')).Trim()) { throw 'Unexpected public key.' }
New-Item -ItemType Directory -Path $lock -ErrorAction Stop | Out-Null
try {
    $free = @{}; Get-PSDrive C,E,F | ForEach-Object { $free[$_.Name] = $_.Free }
    Write-Output "Preflight $(Get-Date -Format o) $($free | ConvertTo-Json -Compress)"
    if ($free.C -lt 55834574848 -or $free.E -lt 53697576960 -or $free.F -lt 665719930880) { throw 'Preflight floor not met.' }
    $env:CARGO_TARGET_DIR = Join-Path $lane 'target'
    $env:TEMP = Join-Path $lane 'tmp'; $env:TMP = $env:TEMP
    $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw -LiteralPath (Join-Path $keys 'qa.key')
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = 'p15-ephemeral'
    Remove-Item Env:TAURI_CONFIG -ErrorAction SilentlyContinue
    Push-Location $app
    try {
        $log = Join-Path $server "build-$Version.log"
        Write-Output "Build start $(Get-Date -Format o)"
        & cmd.exe /c "node node_modules\@tauri-apps\cli\tauri.js build --ci --config `"$config`" -- --offline --locked > `"$log`" 2>&1"
        $result = $LASTEXITCODE
        Write-Output "Build exit $result at $(Get-Date -Format o)"
        Get-Content -LiteralPath $log -Tail 20
        if ($result -ne 0) { throw "Build failed: $result" }
        $bundle = Join-Path $lane "target/release/bundle/nsis/Lalin Play QA_${Version}_x64-setup.exe"
        if (!(Test-Path -LiteralPath $bundle) -or !(Test-Path -LiteralPath "$bundle.sig")) { throw 'Signed bundle missing.' }
        Copy-Item -LiteralPath $bundle, "$bundle.sig" -Destination $server
        Get-Item -LiteralPath $bundle, "$bundle.sig" | Select-Object FullName, Length
        Get-FileHash -Algorithm SHA256 -LiteralPath $bundle, "$bundle.sig"
    } finally { Pop-Location }
} finally {
    Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY,Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
    Write-Output "Lock release $(Get-Date -Format o)"
    [IO.Directory]::Delete($lock)
}
