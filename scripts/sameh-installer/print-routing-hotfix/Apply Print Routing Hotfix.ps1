param([string]$InstallDir = '')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Step([string]$Text) { Write-Host "`n>> $Text" -ForegroundColor Cyan }
function Run-Task([string]$Action, [string]$Name) {
    & schtasks.exe "/$Action" /TN "$Name" 2>&1 | Out-Null
    return $LASTEXITCODE
}
function Stop-InstalledProcesses {
    Get-CimInstance Win32_Process | Where-Object {
        $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.IndexOf($InstallDir, [StringComparison]::OrdinalIgnoreCase) -ge 0
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
}
function Start-ExistingTasks {
    foreach ($name in @('Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge')) {
        if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) { [void](Run-Task 'Run' $name) }
    }
}
function Find-InstallDir {
    $candidates = @()
    foreach ($key in @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{5C76AE62-E6AC-4CCF-A431-5A4E48494E53}_is1',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{5C76AE62-E6AC-4CCF-A431-5A4E48494E53}_is1'
    )) {
        $candidate = (Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue).InstallLocation
        if ($candidate) { $candidates += $candidate }
    }
    $candidates += (Join-Path $env:ProgramFiles 'Sameh\RestoFlow ERP')
    $candidates += 'C:\Program Files\Sameh\RestoFlow ERP'
    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (Test-Path -LiteralPath (Join-Path $candidate 'dist')) { return $candidate }
    }
    return ($candidates | Select-Object -First 1)
}
function Wait-Server {
    for ($i = 0; $i -lt 45; $i++) {
        try {
            $h = Invoke-RestMethod 'http://127.0.0.1:3001/api/health' -TimeoutSec 3
            if ($h.health.services.database.status -eq 'CONNECTED') { return }
        } catch { }
        Start-Sleep -Seconds 2
    }
    throw 'Server did not become healthy within 90 seconds.'
}
function Wait-Bridge {
    for ($i = 0; $i -lt 30; $i++) {
        try {
            $h = Invoke-RestMethod 'http://127.0.0.1:3002/health' -TimeoutSec 3
            if ($h.ok -eq $true) { return }
        } catch { }
        Start-Sleep -Seconds 2
    }
    throw 'Print Bridge did not become reachable within 60 seconds.'
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Run this hotfix as Administrator.' }
if (-not $InstallDir) { $InstallDir = Find-InstallDir }
$InstallDir = [IO.Path]::GetFullPath($InstallDir).TrimEnd('\')
$role = if (Test-Path (Join-Path $PSScriptRoot 'payload\dist-server\index.cjs')) { 'Server' } else { 'Cashier' }
$payloadDist = Join-Path $PSScriptRoot 'payload\dist'
$payloadServer = Join-Path $PSScriptRoot 'payload\dist-server\index.cjs'
$payloadBridge = Join-Path $PSScriptRoot 'payload\hardware-bridge\index.js'
$payloadRaster = Join-Path $PSScriptRoot 'payload\hardware-bridge\png-raster.js'
if (-not (Test-Path $payloadDist)) { throw 'Frontend payload is missing.' }
if ($role -eq 'Server' -and -not (Test-Path $payloadServer)) { throw 'Server payload is missing.' }
if ($role -eq 'Cashier' -and -not (Test-Path $payloadBridge)) { throw 'Cashier bridge payload is missing.' }
if (-not (Test-Path -LiteralPath $InstallDir)) { throw "Installed RestoFlow folder not found: $InstallDir" }
if (-not (Test-Path -LiteralPath (Join-Path $InstallDir 'dist'))) { throw "Installed frontend folder not found: $(Join-Path $InstallDir 'dist')" }
if ($role -eq 'Server' -and -not (Test-Path -LiteralPath (Join-Path $InstallDir 'dist-server\index.cjs'))) {
    throw "This Server hotfix does not match the installed copy. Missing: $(Join-Path $InstallDir 'dist-server\index.cjs')"
}
if ($role -eq 'Cashier' -and -not (Test-Path -LiteralPath (Join-Path $InstallDir 'hardware-bridge\index.js'))) {
    throw "This Cashier hotfix does not match the installed copy. Missing: $(Join-Path $InstallDir 'hardware-bridge\index.js')"
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$rollback = Join-Path $InstallDir "updates\print-routing-$role-rollback-$timestamp"
$logDir = Join-Path $InstallDir 'logs'
$log = Join-Path $logDir "print-routing-$role-$timestamp.log"
New-Item -ItemType Directory -Force -Path $rollback, $logDir | Out-Null
try {
    Step "Applying $role print-routing hotfix"
    foreach ($name in @('Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge')) { [void](Run-Task 'End' $name) }
    Stop-InstalledProcesses

    Step 'Saving rollback files'
    Copy-Item (Join-Path $InstallDir 'dist') (Join-Path $rollback 'dist') -Recurse -Force
    if ($role -eq 'Server') { Copy-Item (Join-Path $InstallDir 'dist-server\index.cjs') (Join-Path $rollback 'index.cjs') -Force }
    else {
        Copy-Item (Join-Path $InstallDir 'hardware-bridge\index.js') (Join-Path $rollback 'bridge-index.js') -Force
        if (Test-Path (Join-Path $InstallDir 'hardware-bridge\png-raster.js')) { Copy-Item (Join-Path $InstallDir 'hardware-bridge\png-raster.js') (Join-Path $rollback 'png-raster.js') -Force }
    }

    Step 'Copying files'
    Remove-Item (Join-Path $InstallDir 'dist') -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir 'dist') | Out-Null
    Copy-Item (Join-Path $payloadDist '*') (Join-Path $InstallDir 'dist') -Recurse -Force
    if ($role -eq 'Server') { Copy-Item $payloadServer (Join-Path $InstallDir 'dist-server\index.cjs') -Force }
    else {
        Copy-Item $payloadBridge (Join-Path $InstallDir 'hardware-bridge\index.js') -Force
        if (Test-Path $payloadRaster) { Copy-Item $payloadRaster (Join-Path $InstallDir 'hardware-bridge\png-raster.js') -Force }
    }

    Step 'Restarting installed tasks'
    Start-ExistingTasks
    if ($role -eq 'Server') { Wait-Server } else { Wait-Bridge }
    @{ role=$role; appliedAt=(Get-Date).ToString('o'); rollback=$rollback } | ConvertTo-Json | Set-Content (Join-Path $InstallDir 'print-routing-hotfix-state.json') -Encoding UTF8
    "SUCCESS $role $(Get-Date -Format o)" | Set-Content $log -Encoding UTF8
    Write-Host "`nSUCCESS: $role hotfix applied. Rollback: $rollback" -ForegroundColor Green
    exit 0
} catch {
    $message = $_.Exception.Message
    "FAILED $role $(Get-Date -Format o) $message" | Set-Content $log -Encoding UTF8
    Write-Host "`nFAILED: $message" -ForegroundColor Red
    Write-Host 'Restoring previous files...' -ForegroundColor Yellow
    if (Test-Path (Join-Path $rollback 'dist')) { Remove-Item (Join-Path $InstallDir 'dist') -Recurse -Force -ErrorAction SilentlyContinue; Copy-Item (Join-Path $rollback 'dist') (Join-Path $InstallDir 'dist') -Recurse -Force }
    if ($role -eq 'Server' -and (Test-Path (Join-Path $rollback 'index.cjs'))) { Copy-Item (Join-Path $rollback 'index.cjs') (Join-Path $InstallDir 'dist-server\index.cjs') -Force }
    if ($role -eq 'Cashier' -and (Test-Path (Join-Path $rollback 'bridge-index.js'))) { Copy-Item (Join-Path $rollback 'bridge-index.js') (Join-Path $InstallDir 'hardware-bridge\index.js') -Force }
    if ($role -eq 'Cashier' -and (Test-Path (Join-Path $rollback 'png-raster.js'))) { Copy-Item (Join-Path $rollback 'png-raster.js') (Join-Path $InstallDir 'hardware-bridge\png-raster.js') -Force }
    Start-ExistingTasks
    exit 1
}
