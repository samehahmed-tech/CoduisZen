@echo off
setlocal
chcp 65001 >nul
title RestoFlow Restore Client DB

set "DB_HOST=127.0.0.1"
set "DB_PORT=5432"
set "DB_NAME=restoflow_erp"
set "APP_USER=restoflow_user"
set "APP_PASS=Coduis@$321"
set "PGCLIENTENCODING=UTF8"

where psql >nul 2>nul || (
  echo psql not found. Add PostgreSQL bin folder to PATH.
  pause
  exit /b 1
)
where pg_restore >nul 2>nul || (
  echo pg_restore not found. Add PostgreSQL bin folder to PATH.
  pause
  exit /b 1
)

set /p BACKUP_FILE=Backup file path (.backup): 
if not exist "%BACKUP_FILE%" (
  echo Backup file not found.
  pause
  exit /b 1
)
set /p DB_NAME=Target database [restoflow_erp]: 
if "%DB_NAME%"=="" set "DB_NAME=restoflow_erp"
set /p PGUSER=PostgreSQL admin user [postgres]: 
if "%PGUSER%"=="" set "PGUSER=postgres"
set /p PGPASSWORD=PostgreSQL admin password: 

echo.
echo WARNING: this will DROP and RESTORE database: %DB_NAME%
set /p CONFIRM=Type RESTORE to continue: 
if /I not "%CONFIRM%"=="RESTORE" (
  echo Cancelled.
  pause
  exit /b 0
)

psql -w -h "%DB_HOST%" -p "%DB_PORT%" -U "%PGUSER%" -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='%DB_NAME%' AND pid <> pg_backend_pid();"
if errorlevel 1 goto :fail
psql -w -h "%DB_HOST%" -p "%DB_PORT%" -U "%PGUSER%" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS %DB_NAME%;"
if errorlevel 1 goto :fail
psql -w -h "%DB_HOST%" -p "%DB_PORT%" -U "%PGUSER%" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE %DB_NAME% WITH ENCODING 'UTF8' TEMPLATE template0;"
if errorlevel 1 goto :fail
pg_restore -w -h "%DB_HOST%" -p "%DB_PORT%" -U "%PGUSER%" -d "%DB_NAME%" --no-owner --no-acl "%BACKUP_FILE%"
if errorlevel 1 goto :fail
psql -w -h "%DB_HOST%" -p "%DB_PORT%" -U "%PGUSER%" -d "%DB_NAME%" -v ON_ERROR_STOP=1 -c "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '%APP_USER%') THEN CREATE ROLE %APP_USER% LOGIN PASSWORD '%APP_PASS%'; ELSE ALTER ROLE %APP_USER% WITH LOGIN PASSWORD '%APP_PASS%'; END IF; END $$; GRANT ALL ON SCHEMA public TO %APP_USER%; GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO %APP_USER%; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO %APP_USER%;"
if errorlevel 1 goto :fail

echo.
echo Restore done.
pause
exit /b 0

:fail
echo.
echo Restore failed.
pause
exit /b 1
