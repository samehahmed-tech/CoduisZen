@echo off
setlocal
chcp 65001 >nul
fltmc >nul 2>&1
if errorlevel 1 (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

title RestoFlow Data Maintenance
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0RestoFlow Data Maintenance.ps1"
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (
  echo Operation completed or cancelled safely.
) else (
  echo Operation failed. Review the displayed log path.
)
echo.
pause
exit /b %RESULT%
