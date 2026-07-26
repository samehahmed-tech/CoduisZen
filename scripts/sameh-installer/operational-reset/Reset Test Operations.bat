@echo off
setlocal
chcp 65001 >nul
fltmc >nul 2>&1
if errorlevel 1 (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

title RestoFlow Clean Operational Start
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Reset Test Operations.ps1"
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (
  echo Operational reset completed successfully.
) else (
  echo Reset failed. Review the displayed log path.
)
echo.
pause
exit /b %RESULT%
