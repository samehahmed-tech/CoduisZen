@echo off
setlocal
chcp 65001 >nul
fltmc >nul 2>&1
if errorlevel 1 (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

title RestoFlow Move Profits 16 to 15
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Move Profits.ps1"
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (
  echo Profit move completed successfully.
) else (
  echo Move failed. Review message and log path above.
)
echo.
pause
exit /b %RESULT%
