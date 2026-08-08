@echo off
setlocal
chcp 65001 >nul
fltmc >nul 2>&1
if errorlevel 1 (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

title RestoFlow KDS Order Fix
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Apply KDS Order Fix.ps1"
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (
  echo KDS Order Fix completed successfully.
) else (
  echo Fix failed. Old server file was restored automatically.
)
echo.
pause
exit /b %RESULT%
