@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem If the ZIP was extracted as a subfolder inside the application, use the
rem application folder as the working directory so its .env is discovered.
if not exist "%~dp0.env" if not exist "%~dp0.env.local" (
  if exist "%~dp0..\.env" cd /d "%~dp0.."
  if exist "%~dp0..\.env.local" cd /d "%~dp0.."
)

set "INSTALL_DIR=%ProgramFiles%\Sameh\RestoFlow ERP"
if not exist "%INSTALL_DIR%\runtime\node.exe" set "INSTALL_DIR=C:\RestoFlow"
if not exist "%INSTALL_DIR%\runtime\node.exe" (
  echo Could not find the installed RestoFlow runtime automatically.
  set /p "INSTALL_DIR=Enter the installed RestoFlow folder: "
)
if not exist "%INSTALL_DIR%\runtime\node.exe" (
  echo The installed runtime was not found. Nothing was changed.
  pause
  exit /b 1
)

echo.
echo ================================================
echo   ROSA CAFE - PRODUCTION DATA RESET ^& IMPORT
echo ================================================
echo This will DELETE test sales, payments, stock items,
echo recipes and menu data from the configured database.
echo It then imports the embedded Rosa Cafe menu, recipes and stock catalog.
echo.
echo The database connection is read from .env / .env.local.
echo Make sure this is the correct customer database.
echo.

if not exist "%INSTALL_DIR%\.env" if not defined DATABASE_URL (
  echo No DATABASE_URL was found in the package folder or its parent folders.
  echo Paste the customer's SQL Server connection string below.
  set /p "DATABASE_URL=DATABASE_URL: "
)
if not exist "%INSTALL_DIR%\.env" if not exist "%INSTALL_DIR%\.env.local" if not defined DATABASE_URL (
  echo DATABASE_URL is required. Nothing was changed.
  pause
  exit /b 1
)

echo.
echo The catalog is embedded in the script. No Excel files are needed.
echo First running a dry-run to verify the database and source counts...
call "%INSTALL_DIR%\runtime\node.exe" "%~dp0scripts\import-rosa-cafe-reset.cjs" "--install-dir=%INSTALL_DIR%"
if errorlevel 1 (
  echo Dry-run failed. Nothing was changed.
  pause
  exit /b 1
)

echo.
echo WARNING: The next step permanently deletes the listed test data.
choice /C YN /N /M "Continue with DELETE and IMPORT? [Y/N] "
if errorlevel 2 (
  echo Cancelled. Nothing was changed.
  pause
  exit /b 0
)

call "%INSTALL_DIR%\runtime\node.exe" "%~dp0scripts\import-rosa-cafe-reset.cjs" "--install-dir=%INSTALL_DIR%" --commit
if errorlevel 1 (
  echo Import failed. The database transaction was rolled back where possible.
  pause
  exit /b 1
)

echo.
echo Import completed. Review output\rosa-cafe-import-report.json for unmatched names.
pause
