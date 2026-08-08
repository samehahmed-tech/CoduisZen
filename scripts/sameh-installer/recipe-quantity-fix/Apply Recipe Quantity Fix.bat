@echo off
setlocal
chcp 65001 >nul
fltmc >nul 2>&1
if errorlevel 1 (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

title RestoFlow Recipe Quantity Fix
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Apply Recipe Quantity Fix.ps1"
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (
  echo Recipe Quantity Fix completed successfully.
) else (
  echo Fix failed. Old application files were restored automatically.
)
echo.
pause
exit /b %RESULT%
