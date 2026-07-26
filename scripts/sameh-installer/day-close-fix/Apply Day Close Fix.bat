@echo off
setlocal
chcp 65001 >nul
fltmc >nul 2>&1
if errorlevel 1 (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

title RestoFlow Day Close Fix
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Apply Day Close Fix.ps1"
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (
  echo Day Close Fix completed successfully.
) else (
  echo Fix failed. Old application files were restored automatically.
)
echo.
pause
exit /b %RESULT%
