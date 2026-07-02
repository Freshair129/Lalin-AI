# build_installer.ps1 — สร้างตัวติดตั้ง G-Music (.exe)
# ใช้: powershell -ExecutionPolicy Bypass -File scripts\build_installer.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$keyPath = Join-Path $root "keys\g-music.key"

if (-not (Test-Path $keyPath)) {
    Write-Host "[!] ไม่พบ signing key ที่ $keyPath" -ForegroundColor Red
    Write-Host "    สร้างใหม่: cd frontend && npx tauri signer generate --ci -w $keyPath"
    exit 1
}

Write-Host "[*] ตั้งค่า signing key..." -ForegroundColor Cyan
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $keyPath -Raw).Trim()
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""

Write-Host "[*] เริ่ม build Tauri..." -ForegroundColor Cyan
Set-Location (Join-Path $root "frontend")
npx tauri build

if ($LASTEXITCODE -eq 0) {
    $out = Join-Path $root "frontend\src-tauri\target\release\bundle\nsis"
    Write-Host ""
    Write-Host "=====================================" -ForegroundColor Green
    Write-Host " Build สำเร็จ!" -ForegroundColor Green
    Write-Host "=====================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "ไฟล์พร้อม release:" -ForegroundColor Yellow
    Get-ChildItem $out | ForEach-Object {
        $sizeMb = [math]::Round($_.Length / 1MB, 2)
        Write-Host "  $($_.Name)  ($sizeMb MB)"
    }
    Write-Host ""
    Write-Host "โฟลเดอร์: $out" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "วิธี release บน GitHub:" -ForegroundColor Yellow
    Write-Host '  git tag v0.1.0 && git push origin v0.1.0'
    Write-Host '  หรืออัปโหลด .exe + .sig ที่ GitHub Releases'
} else {
    Write-Host "[!] Build ล้มเหลว" -ForegroundColor Red
    exit 1
}
