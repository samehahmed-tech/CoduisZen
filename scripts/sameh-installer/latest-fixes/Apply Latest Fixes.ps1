# RestoFlow Cumulative Fix Package
# Applies the latest application build to an installed copy.
# SAFE BY DESIGN: verified database backup first, full rollback on any failure,
# and NO database modifications whatsoever (files only).

param([string]$InstallDir = '')

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Step([string]$Message) { Write-Host "`n>> $Message" -ForegroundColor Cyan }
function Run-Task([string]$Action, [string]$Name) {
    & schtasks.exe "/$Action" /TN $Name 2>$null | Out-Null
}
function Start-SystemTasks {
    foreach ($name in @('Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge')) {
        $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
        if ($task) {
            $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
            Set-ScheduledTask -TaskName $name -Settings $settings | Out-Null
        }
        Run-Task 'Run' $name
    }
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Run this fix as Administrator (Run as administrator).' }

if (-not $InstallDir) {
    foreach ($key in @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{5C76AE62-E6AC-4CCF-A431-5A4E48494E53}_is1',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{5C76AE62-E6AC-4CCF-A431-5A4E48494E53}_is1'
    )) {
        $candidate = (Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue).InstallLocation
        if ($candidate -and (Test-Path -LiteralPath $candidate)) { $InstallDir = $candidate; break }
    }
}
if (-not $InstallDir) { $InstallDir = Join-Path $env:ProgramFiles 'Sameh\RestoFlow ERP' }
$InstallDir = [IO.Path]::GetFullPath($InstallDir).TrimEnd('\')

$node = Join-Path $InstallDir 'runtime\node.exe'
$backupScript = Join-Path $InstallDir 'runtime\database-backup.cjs'
$stateFile = Join-Path $InstallDir 'install-state.json'
$payloadServer = Join-Path $PSScriptRoot 'payload\dist-server\index.cjs'
$payloadFrontend = Join-Path $PSScriptRoot 'payload\dist'
$payloadBridge = Join-Path $PSScriptRoot 'payload\hardware-bridge\index.js'
$payloadBridgeRaster = Join-Path $PSScriptRoot 'payload\hardware-bridge\png-raster.js'
$payloadSchemaDoctor = Join-Path $PSScriptRoot 'payload\runtime\schema-doctor.cjs'
$payloadWatchdog = Join-Path $PSScriptRoot 'payload\runtime\watchdog.cjs'
$payloadSchema = Join-Path $PSScriptRoot 'payload\database\schema.ts'
foreach ($required in @($node, $backupScript, $stateFile, $payloadServer, $payloadFrontend, $payloadBridge, $payloadBridgeRaster, $payloadSchemaDoctor, $payloadWatchdog, $payloadSchema)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Required file is missing: $required" }
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$rollback = Join-Path $InstallDir "updates\rollback-$timestamp"
$currentServer = Join-Path $InstallDir 'dist-server\index.cjs'
$currentFrontend = Join-Path $InstallDir 'dist'
$currentBridge = Join-Path $InstallDir 'hardware-bridge\index.js'
$currentBridgeRaster = Join-Path $InstallDir 'hardware-bridge\png-raster.js'
$currentSchemaDoctor = Join-Path $InstallDir 'runtime\schema-doctor.cjs'
$currentWatchdog = Join-Path $InstallDir 'runtime\watchdog.cjs'
$currentSchema = Join-Path $InstallDir 'database\schema.ts'
$recoveryServer = Join-Path $InstallDir 'recovery\dist-server\index.cjs'
$recoveryFrontend = Join-Path $InstallDir 'recovery\dist\index.html'
$recoveryBridge = Join-Path $InstallDir 'recovery\hardware-bridge\index.js'
$recoveryBridgeRaster = Join-Path $InstallDir 'recovery\hardware-bridge\png-raster.js'
$recoveryWatchdog = Join-Path $InstallDir 'recovery\runtime\watchdog.cjs'
$recoveryManifest = Join-Path $InstallDir 'recovery\manifest.json'
$logDir = Join-Path $InstallDir 'logs'
New-Item -ItemType Directory -Path $rollback, $logDir -Force | Out-Null
$log = Join-Path $logDir "latest-fixes-$timestamp.log"

try {
    Step 'Creating and verifying database backup (data untouched by this fix)'
    $backupResult = & $node $backupScript 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Verified database backup failed: $backupResult" }
    $backupResult | Add-Content -LiteralPath $log -Encoding UTF8

    Step 'Stopping RestoFlow tasks and processes'
    foreach ($name in @('Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge')) { Run-Task 'End' $name }
    Get-CimInstance Win32_Process | Where-Object {
        $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.IndexOf($InstallDir, [StringComparison]::OrdinalIgnoreCase) -ge 0
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2

    Step 'Saving rollback files'
    Copy-Item -LiteralPath $currentServer -Destination (Join-Path $rollback 'index.cjs') -Force
    Copy-Item -LiteralPath $currentFrontend -Destination (Join-Path $rollback 'dist') -Recurse -Force
    Copy-Item -LiteralPath $currentBridge -Destination (Join-Path $rollback 'bridge-index.js') -Force
    if (Test-Path -LiteralPath $currentBridgeRaster) { Copy-Item -LiteralPath $currentBridgeRaster -Destination (Join-Path $rollback 'png-raster.js') -Force }
    if (Test-Path -LiteralPath $currentSchemaDoctor) { Copy-Item -LiteralPath $currentSchemaDoctor -Destination (Join-Path $rollback 'schema-doctor.cjs') -Force }
    if (Test-Path -LiteralPath $currentWatchdog) { Copy-Item -LiteralPath $currentWatchdog -Destination (Join-Path $rollback 'watchdog.cjs') -Force }
    if (Test-Path -LiteralPath $currentSchema) { Copy-Item -LiteralPath $currentSchema -Destination (Join-Path $rollback 'schema.ts') -Force }
    if (Test-Path -LiteralPath $recoveryServer) { Copy-Item -LiteralPath $recoveryServer -Destination (Join-Path $rollback 'recovery-index.cjs') -Force }
    if (Test-Path -LiteralPath $recoveryFrontend) { Copy-Item -LiteralPath $recoveryFrontend -Destination (Join-Path $rollback 'recovery-index.html') -Force }
    if (Test-Path -LiteralPath $recoveryBridge) { Copy-Item -LiteralPath $recoveryBridge -Destination (Join-Path $rollback 'recovery-bridge-index.js') -Force }
    if (Test-Path -LiteralPath $recoveryManifest) { Copy-Item -LiteralPath $recoveryManifest -Destination (Join-Path $rollback 'manifest.json') -Force }

    Step 'Applying cumulative application fix'
    Copy-Item -LiteralPath $payloadServer -Destination $currentServer -Force
    Remove-Item -LiteralPath $currentFrontend -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $currentFrontend -Force | Out-Null
    Copy-Item -Path (Join-Path $payloadFrontend '*') -Destination $currentFrontend -Recurse -Force
    Copy-Item -LiteralPath $payloadBridge -Destination $currentBridge -Force
    Copy-Item -LiteralPath $payloadBridgeRaster -Destination $currentBridgeRaster -Force
    Copy-Item -LiteralPath $payloadSchemaDoctor -Destination $currentSchemaDoctor -Force
    Copy-Item -LiteralPath $payloadWatchdog -Destination $currentWatchdog -Force
    Copy-Item -LiteralPath $payloadSchema -Destination $currentSchema -Force

    Step 'Repairing database schema (backup already verified)'
    $schemaResult = & $node $currentSchemaDoctor 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Database schema repair failed: $schemaResult" }
    $schemaResult | Add-Content -LiteralPath $log -Encoding UTF8

    if (Test-Path -LiteralPath $recoveryServer) {
        Step 'Refreshing recovery copy hashes'
        Copy-Item -LiteralPath $payloadServer -Destination $recoveryServer -Force
        if (Test-Path -LiteralPath $recoveryManifest) {
            $manifest = Get-Content -LiteralPath $recoveryManifest -Raw | ConvertFrom-Json
            foreach ($entry in @(
                @{ target='dist-server\index.cjs'; current=$currentServer; recovery=$recoveryServer },
                @{ target='dist\index.html'; current=(Join-Path $currentFrontend 'index.html'); recovery=$recoveryFrontend },
                @{ target='hardware-bridge\index.js'; current=$currentBridge; recovery=$recoveryBridge },
                @{ target='hardware-bridge\png-raster.js'; current=$currentBridgeRaster; recovery=$recoveryBridgeRaster },
                @{ target='runtime\watchdog.cjs'; current=$currentWatchdog; recovery=$recoveryWatchdog }
            )) {
                $record = $manifest | Where-Object { $_.target -eq $entry.target }
                New-Item -ItemType Directory -Path (Split-Path -Parent $entry.recovery) -Force | Out-Null
                Copy-Item -LiteralPath $entry.current -Destination $entry.recovery -Force
                $hash = (Get-FileHash -LiteralPath $entry.current -Algorithm SHA256).Hash.ToLowerInvariant()
                if ($record) { $record.sha256 = $hash }
                else { $manifest = @($manifest) + [PSCustomObject]@{ target=$entry.target; role='all'; sha256=$hash } }
            }
            [IO.File]::WriteAllText($recoveryManifest, ($manifest | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
        }
    }

    Step 'Restarting services and checking health'
    Start-SystemTasks
    $healthy = $false
    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        Start-Sleep -Seconds 2
        try {
            $health = Invoke-RestMethod 'http://127.0.0.1:3001/api/health' -TimeoutSec 3
            if ($health.health.services.database.status -eq 'CONNECTED') { $healthy = $true; break }
        } catch { }
    }
    if (-not $healthy) { throw 'Server did not become healthy within 90 seconds.' }

    $bridgeHealthy = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $origin = 'http://localhost:3001'
            $bridgeResponse = Invoke-WebRequest 'http://127.0.0.1:3002/health' -Headers @{ Origin = $origin } -UseBasicParsing -TimeoutSec 3
            if ($bridgeResponse.StatusCode -eq 200) { $bridgeHealthy = $true; break }
        } catch { }
        Start-Sleep -Seconds 2
    }
    if (-not $bridgeHealthy) { Write-Host 'Note: Print Bridge health endpoint did not respond yet (it keeps retrying in the background).' -ForegroundColor Yellow }

    @{ version='latest-cumulative-fix'; appliedAt=(Get-Date).ToString('o'); rollback=$rollback } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $InstallDir 'hotfix-state.json') -Encoding UTF8
    "SUCCESS $(Get-Date -Format o)" | Add-Content -LiteralPath $log -Encoding UTF8
    Write-Host "`nSUCCESS: latest fixes applied. Open the app once, then press Ctrl+F5 inside it." -ForegroundColor Green
    exit 0
} catch {
    $message = $_.Exception.Message
    "FAILED $(Get-Date -Format o) $message" | Add-Content -LiteralPath $log -Encoding UTF8
    Write-Host "`nFAILED: $message" -ForegroundColor Red
    Write-Host 'Restoring previous application files automatically...' -ForegroundColor Yellow
    if (Test-Path -LiteralPath (Join-Path $rollback 'index.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'index.cjs') -Destination $currentServer -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'dist')) {
        Remove-Item -LiteralPath $currentFrontend -Recurse -Force -ErrorAction SilentlyContinue
        Copy-Item -LiteralPath (Join-Path $rollback 'dist') -Destination $currentFrontend -Recurse -Force
    }
    if (Test-Path -LiteralPath (Join-Path $rollback 'bridge-index.js')) { Copy-Item -LiteralPath (Join-Path $rollback 'bridge-index.js') -Destination $currentBridge -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'png-raster.js')) { Copy-Item -LiteralPath (Join-Path $rollback 'png-raster.js') -Destination $currentBridgeRaster -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'schema-doctor.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'schema-doctor.cjs') -Destination $currentSchemaDoctor -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'watchdog.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'watchdog.cjs') -Destination $currentWatchdog -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'schema.ts')) { Copy-Item -LiteralPath (Join-Path $rollback 'schema.ts') -Destination $currentSchema -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'recovery-index.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'recovery-index.cjs') -Destination $recoveryServer -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'recovery-index.html')) { Copy-Item -LiteralPath (Join-Path $rollback 'recovery-index.html') -Destination $recoveryFrontend -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'recovery-bridge-index.js')) { Copy-Item -LiteralPath (Join-Path $rollback 'recovery-bridge-index.js') -Destination $recoveryBridge -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'manifest.json')) { Copy-Item -LiteralPath (Join-Path $rollback 'manifest.json') -Destination $recoveryManifest -Force }
    Start-SystemTasks
    exit 1
}
