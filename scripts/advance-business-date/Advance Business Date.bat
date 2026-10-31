@echo off
setlocal
chcp 65001 >nul
fltmc >nul 2>&1
if errorlevel 1 (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

title RestoFlow Advance Business Date
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Advance Business Date.ps1"
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (
  echo Business date advanced successfully.
) else (
  echo Advance failed. Review message and log path above.
)
echo.
pause
exit /b %RESULT%
