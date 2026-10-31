@echo off
setlocal
chcp 65001 >nul
fltmc >nul 2>&1
if errorlevel 1 (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

title RestoFlow Close Day 17 and Open Day 18
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Close Day 17 and Open Day 18.ps1"
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (
  echo Drifted days merged. Now close the bucket day from the app.
) else (
  echo Merge failed. Review message and log path above.
)
echo.
pause
exit /b %RESULT%
