@echo off
setlocal

:: Check for admin privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ====================================
    echo  Flourish VNE - Build Desktop App
    echo ====================================
    echo.
    echo This script needs to run as Administrator.
    echo Requesting elevated privileges...
    echo.
    
    :: Re-run as admin, passing the script's directory
    powershell -Command "Start-Process '%~f0' -Verb RunAs -ArgumentList '%~dp0'"
    exit /b
)

:: Change to the project directory (passed as argument or use script's location)
if "%~1"=="" (
    cd /d "%~dp0"
) else (
    cd /d "%~1"
)

echo ====================================
echo  Flourish VNE - Build Desktop App
echo ====================================
echo.
echo Running with Administrator privileges.
echo Working directory: %CD%
echo.
echo This will build the complete Windows .exe file.
echo The process includes:
echo - Building standalone game engine
echo - Generating engine bundle
echo - Building React app
echo - Packaging Electron app
echo.
echo Estimated time: 3-7 minutes
echo.

:: Clear corrupted electron-builder cache (winCodeSign)
echo Clearing electron-builder cache (fixing symlink issues)...
if exist "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign" (
    rmdir /s /q "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign" 2>nul
    echo Cache cleared.
) else (
    echo Cache already clean.
)
echo.

pause

echo.
echo Building complete application with all dependencies...
call npm run dist

if errorlevel 1 (
    echo.
    echo ERROR: Electron build failed!
    echo Check the error messages above.
    pause
    exit /b 1
)

echo.
echo ====================================
echo  BUILD COMPLETE!
echo ====================================
echo.
echo Your desktop app is ready:
echo Location: release\Flourish Visual Novel Engine-2.0.0-x64.exe
echo.
echo You can now:
echo 1. Test it by double-clicking the .exe
echo 2. Upload it to itch.io
echo 3. Share it with others!
echo.
echo File size: ~200-300MB (includes everything needed)
echo.
pause
