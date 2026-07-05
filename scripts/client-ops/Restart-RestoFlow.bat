@echo off
setlocal
title Restart RestoFlow

taskkill /F /IM node.exe >nul 2>nul
schtasks /Run /TN "RestoFlow Supervisor"
if errorlevel 1 (
  echo Scheduled task failed. Starting manually...
  cd /d C:\RestoFlow
  runtime\node.exe runtime\supervisor.cjs
)
