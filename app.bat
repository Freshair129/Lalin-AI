@echo off
setlocal
chcp 65001 >nul
title G-Music Desktop App
set "PYTHONIOENCODING=utf-8"
set "API_DIR=%~dp0apps\api"
set "DESKTOP_DIR=%~dp0apps\desktop"
set "PYTHON_EXE=%~dp0apps\api\.venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=%~dp0backend\.venv\Scripts\python.exe"

echo.
echo ==============================================
echo G-Music - Desktop App (Tauri)
echo ==============================================
echo NOTE: first launch compiles Rust and may take a few minutes
echo ==============================================
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8756 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

start "G-Music Backend" cmd /k "chcp 65001 >nul && cd /d %API_DIR% && set PYTHONIOENCODING=utf-8 && %PYTHON_EXE% -m uvicorn app.main:app --port 8756"
timeout /t 3 /nobreak >nul

cd /d %DESKTOP_DIR%
call npm run tauri dev

echo.
echo App closed. The backend window stays open until you close it.
pause >nul
endlocal
