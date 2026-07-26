@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Export PostgreSQL Catalog SQL.ps1"
echo.
pause
