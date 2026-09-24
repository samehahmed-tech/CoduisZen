@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo ============================================================
echo   RESTOFLOW - RESTORE CURRENT DATABASE FROM MDF/LDF
echo ============================================================
echo.
echo This will replace the CoduisZen database in the installed app.
echo The current database will be backed up first.
echo Close RestoFlow before continuing.
echo.

set "INSTALL_DIR=%ProgramFiles%\Sameh\RestoFlow ERP"
if not exist "%INSTALL_DIR%\runtime\node.exe" set "INSTALL_DIR=C:\RestoFlow"
if not exist "%INSTALL_DIR%\runtime\node.exe" (
  echo Installed RestoFlow runtime was not found.
  set /p "INSTALL_DIR=Enter the installed RestoFlow folder: "
)
if not exist "%INSTALL_DIR%\runtime\node.exe" (
  echo Runtime not found. Nothing was changed.
  pause
  exit /b 1
)

if not exist "%~dp0CoduisZen.mdf" (
  echo Missing file: %~dp0CoduisZen.mdf
  pause
  exit /b 1
)
if not exist "%~dp0CoduisZen_log.ldf" (
  echo Missing file: %~dp0CoduisZen_log.ldf
  pause
  exit /b 1
)

choice /C YN /N /M "Replace the installed CoduisZen database now? [Y/N] "
if errorlevel 2 exit /b 0

call "%INSTALL_DIR%\runtime\node.exe" "%~dp0restore-coduiszen.cjs" "--install-dir=%INSTALL_DIR%" "--source-dir=%~dp0"
if errorlevel 1 (
  echo.
  echo Restore failed. The candidate database was removed where possible.
  pause
  exit /b 1
)

echo.
echo Restore completed. Start RestoFlow and verify the data.
pause
