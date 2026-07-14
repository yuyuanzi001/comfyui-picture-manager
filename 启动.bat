@echo off
cd /d "%~dp0"
echo.
echo ComfyUI Prompt Manager
echo =====================
echo.
echo Building...
call npm run build
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b 1
)
echo.
echo Starting app...
start "" /B npx electron .
echo Done!
