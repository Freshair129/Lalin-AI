@echo off
setlocal
chcp 65001 >nul
title G-Music Test
set "PYTHONIOENCODING=utf-8"
cd /d %~dp0
set "API_DIR=%~dp0apps\api"
set "DESKTOP_DIR=%~dp0apps\desktop"
set "PYTHON_EXE=%~dp0apps\api\.venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=%~dp0backend\.venv\Scripts\python.exe"

echo.
echo [1/4] TypeScript check (frontend)...
cd %DESKTOP_DIR%
call .\node_modules\.bin\tsc.cmd --noEmit
if errorlevel 1 (
  echo.
  echo ^>^>^> FRONTEND TSC FAILED
  cd /d %~dp0
  exit /b 1
)
echo      OK - TypeScript clean
cd /d %~dp0

echo.
echo [2/4] Frontend unit tests...
cd %DESKTOP_DIR%
call .\node_modules\.bin\vitest.cmd run
if errorlevel 1 (
  echo.
  echo ^>^>^> FRONTEND TESTS FAILED
  cd /d %~dp0
  exit /b 1
)
cd /d %~dp0

echo.
echo [3/4] Backend import check + unit tests...
cd %API_DIR%
%PYTHON_EXE% -c "from app.main import app; print('     OK - backend imports,', len(app.routes), 'routes')"
if errorlevel 1 (
  echo.
  echo ^>^>^> BACKEND IMPORT FAILED
  cd /d %~dp0
  exit /b 1
)
%PYTHON_EXE% -m pytest
if errorlevel 1 (
  echo.
  echo ^>^>^> BACKEND TESTS FAILED
  cd /d %~dp0
  exit /b 1
)
cd /d %~dp0

echo.
echo [4/4] Backend endpoints (quick boot + curl)...
set "PID_FILE=%TEMP%\g-music-test-backend.pid"
if exist "%PID_FILE%" del "%PID_FILE%" >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8756 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Start-Process -FilePath '%PYTHON_EXE%' -ArgumentList '-m','uvicorn','app.main:app','--port','8756','--log-level','warning' -WorkingDirectory '%API_DIR%' -WindowStyle Hidden -PassThru; Set-Content -Path '%PID_FILE%' -Value $p.Id"
timeout /t 6 /nobreak >nul
curl -s -o nul -w "      /health   -> %%{http_code}\n" http://127.0.0.1:8756/health
curl -s -o nul -w "      /packs    -> %%{http_code}\n" http://127.0.0.1:8756/packs
curl -s -o nul -w "      /projects -> %%{http_code}\n" http://127.0.0.1:8756/projects
if exist "%PID_FILE%" (
  set /p BACKEND_PID=<"%PID_FILE%"
  taskkill /F /PID %BACKEND_PID% >nul 2>&1
  del "%PID_FILE%" >nul 2>&1
)

echo.
echo === DONE ===
endlocal
