param([string]$InstallDir = '')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$script:currentStep = 'startup'
$script:TaskExe = Join-Path $env:WINDIR 'System32\schtasks.exe'
if (-not (Test-Path -LiteralPath $script:TaskExe)) { $script:TaskExe = 'schtasks.exe' }
function Step([string]$Text) { $script:currentStep = $Text; Write-Host "`n>> $Text" -ForegroundColor Cyan }
function Find-InstallDir {
    $candidates = @()
    foreach ($key in @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{5C76AE62-E6AC-4CCF-A431-5A4E48494E53}_is1',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{5C76AE62-E6AC-4CCF-A431-5A4E48494E53}_is1'
    )) { $candidate = (Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue).InstallLocation; if ($candidate) { $candidates += $candidate } }
    $candidates += (Join-Path $env:ProgramFiles 'Sameh\RestoFlow ERP')
    $candidates += 'C:\Program Files\Sameh\RestoFlow ERP'
    foreach ($candidate in ($candidates | Select-Object -Unique)) { if (Test-Path (Join-Path $candidate 'dist')) { return $candidate } }
    return ($candidates | Select-Object -First 1)
}
function Stop-TasksAndProcesses {
    foreach ($name in @('Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge')) { try { & $script:TaskExe /End /TN "$name" 2>&1 | Out-Null } catch { } }
    try { Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.IndexOf($InstallDir, [StringComparison]::OrdinalIgnoreCase) -ge 0 } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } }
    catch { Write-Host "Process cleanup skipped: $($_.Exception.Message)" -ForegroundColor Yellow }
    Start-Sleep -Seconds 2
}
function Start-ExistingTasks {
    foreach ($name in @('Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge')) {
        if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) { try { & $script:TaskExe /Run /TN "$name" 2>&1 | Out-Null } catch { } }
    }
}
function Wait-Url([string]$Url, [int]$Seconds) {
    for ($i = 0; $i -lt $Seconds; $i += 2) { try { $r = Invoke-RestMethod $Url -TimeoutSec 3; if ($r.ok -eq $true -or $r.health.services.database.status -eq 'CONNECTED') { return } } catch { }; Start-Sleep -Seconds 2 }
    throw "Service did not become ready: $Url"
}
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Run this hotfix as Administrator.' }
if (-not $InstallDir) { $InstallDir = Find-InstallDir }
$InstallDir = [IO.Path]::GetFullPath($InstallDir).TrimEnd('\')
$payloadDist = Join-Path $PSScriptRoot 'payload\dist'
$payloadServer = Join-Path $PSScriptRoot 'payload\dist-server\index.cjs'
$payloadBridge = Join-Path $PSScriptRoot 'payload\hardware-bridge\index.js'
$payloadRaster = Join-Path $PSScriptRoot 'payload\hardware-bridge\png-raster.js'
if (-not (Test-Path $InstallDir)) { throw "Installed folder not found: $InstallDir" }
if (-not (Test-Path $payloadDist)) { throw "Payload not found: $payloadDist" }
$state = Join-Path $InstallDir 'install-state.json'
$role = 'server'
if (Test-Path $state) { try { $role = (Get-Content $state -Raw | ConvertFrom-Json).role } catch { } }
if ($role -notin @('server', 'cashier')) { $role = if (Test-Path (Join-Path $InstallDir 'hardware-bridge\index.js')) { 'cashier' } else { 'server' } }
if ($role -eq 'server' -and -not (Test-Path (Join-Path $InstallDir 'dist-server\index.cjs'))) { throw "Installed server bundle not found: $(Join-Path $InstallDir 'dist-server\index.cjs')" }
if ($role -eq 'cashier' -and -not (Test-Path (Join-Path $InstallDir 'hardware-bridge\index.js'))) { throw "Installed cashier bridge not found: $(Join-Path $InstallDir 'hardware-bridge\index.js')" }
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$rollback = Join-Path $InstallDir "updates\print-bridge-rollback-$timestamp"
$logDir = Join-Path $InstallDir 'logs'
$log = Join-Path $logDir "print-bridge-hotfix-$timestamp.log"
New-Item -ItemType Directory -Force -Path $rollback, $logDir | Out-Null
try {
    Step "Detected role: $role"
    Stop-TasksAndProcesses
    Step 'Saving rollback files'
    if ($role -eq 'server' -and (Test-Path (Join-Path $InstallDir 'dist'))) { Copy-Item (Join-Path $InstallDir 'dist') (Join-Path $rollback 'dist') -Recurse -Force }
    if ($role -eq 'server') { Copy-Item (Join-Path $InstallDir 'dist-server\index.cjs') (Join-Path $rollback 'index.cjs') -Force }
    if (Test-Path (Join-Path $InstallDir 'hardware-bridge\index.js')) { Copy-Item (Join-Path $InstallDir 'hardware-bridge\index.js') (Join-Path $rollback 'bridge-index.js') -Force }
    if (Test-Path (Join-Path $InstallDir 'hardware-bridge\png-raster.js')) { Copy-Item (Join-Path $InstallDir 'hardware-bridge\png-raster.js') (Join-Path $rollback 'png-raster.js') -Force }
    Step 'Applying bridge routing files'
    if ($role -eq 'server') {
        Remove-Item (Join-Path $InstallDir 'dist') -Recurse -Force
        New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir 'dist') | Out-Null
        Copy-Item (Join-Path $payloadDist '*') (Join-Path $InstallDir 'dist') -Recurse -Force
    }
    if ($role -eq 'server') { Copy-Item $payloadServer (Join-Path $InstallDir 'dist-server\index.cjs') -Force }
    if (Test-Path (Join-Path $InstallDir 'hardware-bridge')) {
        Copy-Item $payloadBridge (Join-Path $InstallDir 'hardware-bridge\index.js') -Force
        Copy-Item $payloadRaster (Join-Path $InstallDir 'hardware-bridge\png-raster.js') -Force
    }
    Step 'Restarting tasks and checking health'
    Start-ExistingTasks
    if ($role -eq 'server') { Wait-Url 'http://127.0.0.1:3001/api/health' 90 }
    if ($role -eq 'cashier' -or (Get-ScheduledTask -TaskName 'Sameh Print Bridge' -ErrorAction SilentlyContinue)) { Wait-Url 'http://127.0.0.1:3002/health' 60 }
    @{ role=$role; appliedAt=(Get-Date).ToString('o'); rollback=$rollback } | ConvertTo-Json | Set-Content (Join-Path $InstallDir 'print-bridge-hotfix-state.json') -Encoding UTF8
    "SUCCESS $role $(Get-Date -Format o)" | Set-Content $log -Encoding UTF8
    Write-Host "`nSUCCESS: Print Bridge hotfix applied. Rollback: $rollback" -ForegroundColor Green
    exit 0
} catch {
    $message = $_.Exception.Message
    "FAILED $role step=$script:currentStep $(Get-Date -Format o) $message`n$($_.InvocationInfo.PositionMessage)`n$($_.ScriptStackTrace)" | Set-Content $log -Encoding UTF8
    Write-Host "`nFAILED at [$script:currentStep]: $message" -ForegroundColor Red
    Write-Host "Diagnostic log: $log" -ForegroundColor Yellow
    Write-Host 'Restoring previous files...' -ForegroundColor Yellow
    if (Test-Path (Join-Path $rollback 'dist')) { Remove-Item (Join-Path $InstallDir 'dist') -Recurse -Force -ErrorAction SilentlyContinue; Copy-Item (Join-Path $rollback 'dist') (Join-Path $InstallDir 'dist') -Recurse -Force }
    if ($role -eq 'server' -and (Test-Path (Join-Path $rollback 'index.cjs'))) { Copy-Item (Join-Path $rollback 'index.cjs') (Join-Path $InstallDir 'dist-server\index.cjs') -Force }
    if (Test-Path (Join-Path $rollback 'bridge-index.js')) { Copy-Item (Join-Path $rollback 'bridge-index.js') (Join-Path $InstallDir 'hardware-bridge\index.js') -Force }
    if (Test-Path (Join-Path $rollback 'png-raster.js')) { Copy-Item (Join-Path $rollback 'png-raster.js') (Join-Path $InstallDir 'hardware-bridge\png-raster.js') -Force }
    Start-ExistingTasks
    exit 1
}
