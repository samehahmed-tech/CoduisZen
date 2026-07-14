@echo off
setlocal
chcp 65001 >nul

echo RestoFlow print bridge claim fix
echo.
set "ROOT=%~1"
if "%ROOT%"=="" set "ROOT=C:\RestoFlow"
set "ENV=%ROOT%\hardware-bridge\.env"

if not exist "%ENV%" (
  echo Bridge env not found:
  echo %ENV%
  echo.
  echo Pass install path, example:
  echo %~nx0 "D:\RestoFlow"
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p='%ENV%'; $text=Get-Content -LiteralPath $p -Raw; if ($text -match '(?m)^PRINT_CLAIM_UNASSIGNED=') { $text=$text -replace '(?m)^PRINT_CLAIM_UNASSIGNED=.*$', 'PRINT_CLAIM_UNASSIGNED=true' } else { $text=$text.TrimEnd() + \"`r`nPRINT_CLAIM_UNASSIGNED=true`r`n\" }; Set-Content -LiteralPath $p -Value $text -Encoding UTF8"

echo.
echo Done. Restart RestoFlow Supervisor / Print Bridge.
pause
