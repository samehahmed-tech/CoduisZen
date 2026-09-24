@echo off
setlocal EnableExtensions
cd /d "%~dp0"

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

echo.
echo The catalog is embedded in the script. No Excel files are needed.
echo First running a dry-run to verify the database and source counts...
call node "%~dp0scripts\import-rosa-cafe-reset.cjs"
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

call node "%~dp0scripts\import-rosa-cafe-reset.cjs" --commit
if errorlevel 1 (
  echo Import failed. The database transaction was rolled back where possible.
  pause
  exit /b 1
)

echo.
echo Import completed. Review output\rosa-cafe-import-report.json for unmatched names.
pause
