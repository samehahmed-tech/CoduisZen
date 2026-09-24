@echo off
setlocal
chcp 65001 >nul
fltmc >nul 2>&1
if errorlevel 1 (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
title RestoFlow Print Routing Hotfix
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Apply Print Routing Hotfix.ps1"
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (echo SUCCESS: print routing hotfix applied.) else (echo FAILED: rollback was attempted automatically.)
echo.
pause
exit /b %RESULT%
