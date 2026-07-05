@echo off
setlocal
chcp 65001 >nul
title RestoFlow Empty Client DB

set "DB_HOST=127.0.0.1"
set "DB_PORT=5432"
set "DB_NAME=restoflow_erp"
set "APP_USER=restoflow_user"
set "APP_PASS=Coduis@$321"
set "PGCLIENTENCODING=UTF8"

where psql >nul 2>nul || (
  echo psql not found. Add PostgreSQL bin folder to PATH.
  echo Example: C:\Program Files\PostgreSQL\18\bin
  pause
  exit /b 1
)

set /p DB_NAME=Database name [restoflow_erp]: 
if "%DB_NAME%"=="" set "DB_NAME=restoflow_erp"
set /p APP_USER=App DB user [restoflow_user]: 
if "%APP_USER%"=="" set "APP_USER=restoflow_user"
set /p APP_PASS=App DB password [Coduis@$321]: 
if "%APP_PASS%"=="" set "APP_PASS=Coduis@$321"
set /p PGUSER=PostgreSQL admin user [postgres]: 
if "%PGUSER%"=="" set "PGUSER=postgres"
set /p PGPASSWORD=PostgreSQL admin password: 

echo.
echo Creating role and empty UTF8 database if missing...

psql -w -h "%DB_HOST%" -p "%DB_PORT%" -U "%PGUSER%" -d postgres -v ON_ERROR_STOP=1 -c "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '%APP_USER%') THEN CREATE ROLE %APP_USER% LOGIN PASSWORD '%APP_PASS%'; ELSE ALTER ROLE %APP_USER% WITH LOGIN PASSWORD '%APP_PASS%'; END IF; END $$;"
if errorlevel 1 goto :fail

psql -w -h "%DB_HOST%" -p "%DB_PORT%" -U "%PGUSER%" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='%DB_NAME%'" | findstr 1 >nul
if errorlevel 1 (
  psql -w -h "%DB_HOST%" -p "%DB_PORT%" -U "%PGUSER%" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE %DB_NAME% WITH ENCODING 'UTF8' TEMPLATE template0;"
  if errorlevel 1 goto :fail
) else (
  echo Database already exists. Keeping data.
)

psql -w -h "%DB_HOST%" -p "%DB_PORT%" -U "%PGUSER%" -d "%DB_NAME%" -v ON_ERROR_STOP=1 -c "GRANT ALL ON SCHEMA public TO %APP_USER%; GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO %APP_USER%; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO %APP_USER%; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO %APP_USER%; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO %APP_USER%;"
if errorlevel 1 goto :fail

set "ENC_APP_PASS=%APP_PASS:@=%%40%"
echo.
echo Done.
echo DATABASE_URL=postgresql://%APP_USER%:%ENC_APP_PASS%@%DB_HOST%:%DB_PORT%/%DB_NAME%
echo.
pause
exit /b 0

:fail
echo.
echo Failed. Nothing was dropped.
pause
exit /b 1
