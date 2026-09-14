@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Apply Print Bridge Resilience Fix.ps1"
if errorlevel 1 pause
