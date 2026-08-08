@echo off
chcp 65001 >nul
set "SCRIPT=%~dp0Apply AI Copilot Hotfix.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%SCRIPT%""'"
pause
