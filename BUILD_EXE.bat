@echo off
echo ====================================
echo  Flourish VNE - Build Desktop App
echo ====================================
echo.
echo This will build the Windows .exe file.
echo The process takes 2-5 minutes.
echo.
pause

echo.
echo [Step 1/2] Building React app...
call npm run build

if errorlevel 1 (
    echo.
    echo ERROR: React build failed!
    echo Make sure you ran 'npm install' first.
    pause
    exit /b 1
)

echo.
echo [Step 2/2] Packaging Electron app...
call npm run electron:build:win

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
echo NEW FEATURES INCLUDED:
echo - Quick access buttons for Characters, UI, Assets, Variables, Settings
echo - Custom window sizes for each manager (locked to optimal dimensions)
echo - Main window opens maximized automatically
echo - Desktop game building support (with file system saves)
echo.
echo You can now:
echo 1. Test it by double-clicking the .exe
echo 2. Use it to create visual novels
echo 3. Build your games as desktop apps or web games
echo 4. Upload your games to itch.io
echo.
echo DESKTOP GAME BUILDING:
echo To build games with file system save support, use:
echo   npm run build:desktop-game -- --input "export.zip" --name "Your Game"
echo See docs\DESKTOP_GAME_BUILDING.md for complete instructions
echo.
echo File size: ~200-300MB (includes everything needed)
echo.
pause
