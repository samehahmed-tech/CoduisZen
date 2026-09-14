@echo off
setlocal
chcp 65001 >nul
fltmc >nul 2>&1
if errorlevel 1 (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

title RestoFlow Latest Fixes
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Apply Latest Fixes.ps1"
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (
  echo Latest fixes applied successfully. Open the app once, then press Ctrl+F5 inside it.
) else (
  echo Fix failed. Previous application files were restored automatically.
)
echo.
pause
exit /b %RESULT%
