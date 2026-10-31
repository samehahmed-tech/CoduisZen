@echo off
setlocal

net session >nul 2>&1
if not "%errorlevel%"=="0" (
    powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

set "RESULT_FILE=%TEMP%\restoflow-command-rail-install-result.json"
if exist "%RESULT_FILE%" del /q "%RESULT_FILE%"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-command-rail.ps1" ^
    -SourceDist "%~dp0..\dist" ^
    -InstallDir "C:\Program Files\Sameh\RestoFlow ERP" ^
    -ResultFile "%RESULT_FILE%"

if errorlevel 1 (
    echo.
    echo Installation failed. No success result was written.
    pause
    exit /b 1
)

echo.
type "%RESULT_FILE%"
echo.
echo Command Rail installed successfully. You can close this window.
pause
