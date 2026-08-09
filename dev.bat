@echo off
setlocal
chcp 65001 >nul
title G-Music Dev Launcher
set "PYTHONIOENCODING=utf-8"
set "API_DIR=%~dp0apps\api"
set "DESKTOP_DIR=%~dp0apps\desktop"
set "PYTHON_EXE=%~dp0apps\api\.venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=%~dp0backend\.venv\Scripts\python.exe"

echo.
echo ==============================================
echo G-Music - starting dev servers
echo ==============================================
echo Backend : http://127.0.0.1:8756/docs
echo Frontend: http://localhost:5173
echo ==============================================
echo.

echo Freeing ports 8756 and 5173 if in use...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8756 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

start "G-Music Backend" cmd /k "chcp 65001 >nul && cd /d %API_DIR% && set PYTHONIOENCODING=utf-8 && %PYTHON_EXE% -m uvicorn app.main:app --port 8756"
timeout /t 3 /nobreak >nul

start "G-Music Frontend" cmd /k "cd /d %DESKTOP_DIR% && npm run dev"
timeout /t 4 /nobreak >nul
start "" http://localhost:5173

echo.
echo Browser opened at http://localhost:5173
echo Opened 2 server windows. Close them to stop the servers.
echo Press any key to close this launcher window.
pause >nul
endlocal
