@echo off
title INTUBATALK Launcher
cd /d "%~dp0"

echo.
echo  ============================================
echo   INTUBATALK - ICU Patient & Nurse System
echo  ============================================
echo  Launching the application...
echo.

if exist "%~dp0INTUBATALK.exe" (
    start "" "%~dp0INTUBATALK.exe"
    exit /b 0
)

REM Fallback if .exe is moved: start node server directly
start "INTUBATALK server" /min cmd /c "cd /d "%~dp0" && node server.js"
timeout /t 2 /nobreak >NUL
start "" "http://127.0.0.1:8788/choose"
exit /b 0
