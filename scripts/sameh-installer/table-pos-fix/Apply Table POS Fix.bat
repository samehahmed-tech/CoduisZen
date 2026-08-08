@echo off
setlocal
chcp 65001 >nul
fltmc >nul 2>&1
if errorlevel 1 (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

title RestoFlow Tables and POS Fix
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Apply Table POS Fix.ps1"
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (
  echo Tables and POS Fix completed successfully.
) else (
  echo Fix failed. Application files were restored automatically.
)
echo.
pause
exit /b %RESULT%
