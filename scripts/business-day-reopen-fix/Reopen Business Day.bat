@echo off
setlocal
chcp 65001 >nul
fltmc >nul 2>&1
if errorlevel 1 (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

title RestoFlow Reopen Business Day
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Reopen Business Day.ps1"
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (
  echo Business day fix completed successfully.
) else (
  echo Fix failed. Review message and log path above.
)
echo.
pause
exit /b %RESULT%
