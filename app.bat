@echo off
setlocal
chcp 65001 >nul
title G-Music Desktop App
set "PYTHONIOENCODING=utf-8"

echo.
echo ==============================================
echo G-Music - Desktop App (Tauri)
echo ==============================================
echo NOTE: first launch compiles Rust and may take a few minutes
echo ==============================================
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8756 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

start "G-Music Backend" cmd /k "chcp 65001 >nul && cd /d %~dp0backend && set PYTHONIOENCODING=utf-8 && .venv\Scripts\python.exe -m uvicorn app.main:app --port 8756"
timeout /t 3 /nobreak >nul

cd /d %~dp0frontend
call npm run tauri dev

echo.
echo App closed. The backend window stays open until you close it.
pause >nul
endlocal
