@echo off
setlocal
rem ── Rescue a damaged .flourish ────────────────────────────────────────────────
rem  Drag the broken .flourish file onto this .bat and drop it.
rem  It writes  <name>.recovered.flourish  next to the original.
rem  The original file is NEVER modified.

if "%~1"=="" (
  echo.
  echo   Drag your damaged .flourish file onto this file and drop it.
  echo.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed on this computer.
  echo   Install it from https://nodejs.org  ^(the "LTS" button^), then try again.
  echo.
  pause
  exit /b 1
)

node "%~dp0recover-flourish.cjs" "%~1"
echo.
pause
