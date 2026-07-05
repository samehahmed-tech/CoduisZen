@echo off
setlocal
cd /d "%~dp0\.."
echo RestoFlow Cashier USB Print Bridge
echo.
set /p SERVER_URL=Server URL (example http://192.168.1.100:3001): 
set /p TOKEN=Print gateway token: 
set /p BRANCH_ID=Branch id [b1]: 
if "%BRANCH_ID%"=="" set BRANCH_ID=b1
"%CD%\runtime\node.exe" "%CD%\runtime\setup-agent.cjs" cashier-bridge --serverUrl="%SERVER_URL%" --token="%TOKEN%" --branchId="%BRANCH_ID%"
echo.
if exist "%CD%\CASHIER_BRIDGE_RESULT.txt" type "%CD%\CASHIER_BRIDGE_RESULT.txt"
echo.
pause
