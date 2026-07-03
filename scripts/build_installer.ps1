$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$keyPath = Join-Path $root "keys\g-music.key"
$frontendDir = Join-Path $root "frontend"
$bundleDir = Join-Path $root "frontend\src-tauri\target\release\bundle\nsis"

if (-not (Test-Path $keyPath)) {
    Write-Host "[!] Missing Tauri signing key: $keyPath" -ForegroundColor Red
    Write-Host "    Generate a local release key first:" -ForegroundColor Yellow
    Write-Host "    cd frontend" -ForegroundColor Yellow
    Write-Host "    npx tauri signer generate --ci -w ..\keys\g-music.key" -ForegroundColor Yellow
    exit 1
}

Write-Host "[*] Loading Tauri signing key." -ForegroundColor Cyan
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $keyPath -Raw).Trim()
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""

Write-Host "[*] Building Tauri NSIS installer." -ForegroundColor Cyan
Set-Location $frontendDir
npx tauri build

if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Tauri build failed." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host " Installer build completed." -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""

if (Test-Path $bundleDir) {
    Write-Host "Release artifacts:" -ForegroundColor Yellow
    Get-ChildItem $bundleDir | ForEach-Object {
        $sizeMb = [math]::Round($_.Length / 1MB, 2)
        Write-Host "  $($_.Name) ($sizeMb MB)"
    }
    Write-Host ""
    Write-Host "Folder: $bundleDir" -ForegroundColor Cyan
} else {
    Write-Host "[!] Expected NSIS output folder was not found: $bundleDir" -ForegroundColor Red
    exit 1
}
