@echo off
REM Start script for FlourishVNE (Windows)
REM Tries Node (npx http-server) first, then Python's http.server.
set PORT=8080

:: If Node is available, use npx http-server and open browser
where node >nul 2>&1
if %errorlevel%==0 (
  echo Node.js detected. Starting local static server with npx http-server on port %PORT%...
  start "Flourish Server" cmd /k "npx http-server dist -p %PORT% --silent"
  timeout /t 1 >nul
  start "" "http://localhost:%PORT%"
  exit /b 0
)

:: If Python is available, use python -m http.server
where python >nul 2>&1
if %errorlevel%==0 (
  echo Python detected. Starting http.server on port %PORT% (serving dist/)...
  start "Flourish Server" cmd /k "pushd dist && python -m http.server %PORT%"
  timeout /t 1 >nul
  start "" "http://localhost:%PORT%"
  exit /b 0
)

echo.
echo Could not find Node.js or Python on this machine.
echo To run the application, install Node.js (https://nodejs.org/) or Python (https://python.org/).
echo After installation, re-run this script. Alternatively host the 'dist' folder on a static web server.
pause
exit /b 1
