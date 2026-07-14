@echo off
setlocal
chcp 65001 >nul
fltmc >nul 2>&1
if errorlevel 1 (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

title RestoFlow Installed System Fix
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix-installed-system.ps1"
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (
  echo Fix completed. Admin PIN 202626 - Cashier PIN 111111.
) else (
  echo Fix failed. Read the message above. The old server file was restored.
)
echo.
pause
exit /b %RESULT%
