@echo off
setlocal
chcp 65001 >nul
fltmc >nul 2>&1
if errorlevel 1 (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

title RestoFlow Cleanup Future Days
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Cleanup Future Days.ps1"
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (
  echo Future days cleanup completed successfully.
) else (
  echo Cleanup failed. Review message and log path above.
)
echo.
pause
exit /b %RESULT%
