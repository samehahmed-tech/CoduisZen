@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
title GitHub Fast Update - CoduisZen
rem ============================================================
rem  github.bat - fast one-click update to GitHub
rem  Usage:
rem    github.bat                        (commit with timestamp message)
rem    github.bat fix kitchen routing    (commit with your words)
rem    github.bat "fix kitchen routing"  (same, quoted also works)
rem
rem  What it does:
rem    1) Stages tracked-file updates ONLY (git add -u) so build
rem       artifacts (HotFix folders, zips, dist) never sneak in.
rem    2) Refuses to commit secrets (.env*) even if force-added.
rem    3) Skips empty commits, then pushes current branch to origin.
rem  Target: https://github.com/samehahmed-tech/CoduisZen
rem ============================================================

set "ROOT=%~dp0"
cd /d "%ROOT%"

where git >nul 2>&1
if errorlevel 1 goto :no_git

for /f "delims=" %%B in ('git branch --show-current 2^>nul') do set "BRANCH=%%B"
if not defined BRANCH goto :no_repo

for /f "delims=" %%U in ('git remote get-url origin 2^>nul') do set "REMOTE_URL=%%U"
echo Branch : %BRANCH%
echo Remote : %REMOTE_URL%
echo.

rem ---- Stage tracked updates only (keeps HotFix/dist/zips out) ----
git add -u
git diff --cached --quiet
if "%ERRORLEVEL%"=="0" goto :no_changes

rem ---- Secret guard: never commit env files ----
git diff --cached --name-only > "%TEMP%\gh_staged.txt"
findstr /I /R /C:"\.env" "%TEMP%\gh_staged.txt" >nul
if "%ERRORLEVEL%"=="0" goto :has_secrets
goto :do_commit

:no_changes
echo [SKIP] No tracked changes to push. Working tree is clean.
echo Untracked new files (not pushed, review manually):
git status --short > "%TEMP%\gh_untracked.txt"
findstr /B "??" "%TEMP%\gh_untracked.txt"
goto :pause_exit_0

:has_secrets
echo [ERROR] Refusing to push: staged files include .env secrets.
echo Unstage them with: git reset .env .env.local
goto :pause_exit_1

:do_commit
echo Staged files:
type "%TEMP%\gh_staged.txt"
echo.
set "MSG="

:msg_loop
if "%~1"=="" goto :msg_done
if defined MSG goto :msg_append
set "MSG=%~1"
goto :msg_next

:msg_append
set "MSG=%MSG% %~1"

:msg_next
shift
goto :msg_loop

:msg_done
if not defined MSG set "MSG=chore: sync latest updates"
git commit -m "%MSG%"
if errorlevel 1 goto :commit_fail
git push origin "%BRANCH%"
if errorlevel 1 goto :push_fail
echo.
for /f "delims=" %%C in ('git rev-parse --short HEAD') do set "SHA=%%C"
echo [SUCCESS] Pushed %SHA% to origin/%BRANCH%.
goto :pause_exit_0

:no_git
echo [ERROR] git not found in PATH. Install Git and retry.
goto :pause_exit_1

:no_repo
echo [ERROR] Not inside a git working tree.
goto :pause_exit_1

:commit_fail
echo.
echo [FAILED] Commit failed. Review the error above.
goto :pause_exit_1

:push_fail
echo.
echo [FAILED] Push rejected. Remote is likely ahead - run:
echo   git pull --rebase origin %BRANCH%
echo then run github.bat again.
goto :pause_exit_1

:pause_exit_0
set "EXIT_CODE=0"
goto :pause_exit

:pause_exit_1
set "EXIT_CODE=1"
goto :pause_exit

:pause_exit
endlocal & set "EXIT_CODE=%EXIT_CODE%"
echo %CMDCMDLINE% | find /I /C "%~nx0" >nul
if not errorlevel 1 pause
exit /b %EXIT_CODE%
