@echo off
setlocal
chcp 65001 >nul
fltmc >nul 2>&1
if errorlevel 1 (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

title RestoFlow Repair Installed System
rem Optional args: -InstallDir "D:\Path" -Role server| cashier -CheckOnly
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Repair Installed System.ps1" %*
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (
  echo Repair completed. Open the app once, then press Ctrl+F5 inside it.
) else (
  echo Repair found problems it could not fix alone. See the on-screen report and the log path above.
)
echo.
pause
exit /b %RESULT%
