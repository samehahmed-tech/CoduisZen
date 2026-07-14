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
if (-not $isAdmin) { throw 'Run Fix Installed System.bat as Administrator.' }

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
$payloadAdmin = Join-Path $PSScriptRoot 'payload\create-recovery-admin.cjs'
foreach ($required in @($node, $backupScript, $stateFile, $payloadServer, $payloadFrontend, $payloadBridge, $payloadBridgeRaster, $payloadAdmin)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Required file is missing: $required" }
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$rollback = Join-Path $InstallDir "updates\rollback-$timestamp"
$currentServer = Join-Path $InstallDir 'dist-server\index.cjs'
$currentFrontend = Join-Path $InstallDir 'dist'
$currentBridge = Join-Path $InstallDir 'hardware-bridge\index.js'
$currentBridgeRaster = Join-Path $InstallDir 'hardware-bridge\png-raster.js'
$recoveryServer = Join-Path $InstallDir 'recovery\dist-server\index.cjs'
$recoveryFrontend = Join-Path $InstallDir 'recovery\dist\index.html'
$recoveryBridge = Join-Path $InstallDir 'recovery\hardware-bridge\index.js'
$recoveryBridgeRaster = Join-Path $InstallDir 'recovery\hardware-bridge\png-raster.js'
$recoveryManifest = Join-Path $InstallDir 'recovery\manifest.json'
$adminScript = Join-Path $InstallDir 'runtime\create-recovery-admin.cjs'
$logDir = Join-Path $InstallDir 'logs'
New-Item -ItemType Directory -Path $rollback, $logDir -Force | Out-Null
$log = Join-Path $logDir "hotfix-$timestamp.log"

try {
    Step 'Creating and verifying database backup'
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
    if (Test-Path -LiteralPath $recoveryServer) { Copy-Item -LiteralPath $recoveryServer -Destination (Join-Path $rollback 'recovery-index.cjs') -Force }
    if (Test-Path -LiteralPath $recoveryFrontend) { Copy-Item -LiteralPath $recoveryFrontend -Destination (Join-Path $rollback 'recovery-index.html') -Force }
    if (Test-Path -LiteralPath $recoveryBridge) { Copy-Item -LiteralPath $recoveryBridge -Destination (Join-Path $rollback 'recovery-bridge-index.js') -Force }
    if (Test-Path -LiteralPath $recoveryManifest) { Copy-Item -LiteralPath $recoveryManifest -Destination (Join-Path $rollback 'manifest.json') -Force }

    Step 'Applying session, menu, printer, receipt, and inventory fix'
    Copy-Item -LiteralPath $payloadServer -Destination $currentServer -Force
    Copy-Item -Path (Join-Path $payloadFrontend '*') -Destination $currentFrontend -Recurse -Force
    Copy-Item -LiteralPath $payloadBridge -Destination $currentBridge -Force
    Copy-Item -LiteralPath $payloadBridgeRaster -Destination $currentBridgeRaster -Force
    Copy-Item -LiteralPath $payloadAdmin -Destination $adminScript -Force
    $bridgeEnv = Join-Path $InstallDir 'hardware-bridge\.env'
    if (Test-Path -LiteralPath $bridgeEnv) {
        $bridgeConfig = Get-Content -LiteralPath $bridgeEnv -Raw
        if ($bridgeConfig -match '(?m)^POLL_MS=') { $bridgeConfig = $bridgeConfig -replace '(?m)^POLL_MS=.*$', 'POLL_MS=500' }
        else { $bridgeConfig = $bridgeConfig.TrimEnd() + "`r`nPOLL_MS=500`r`n" }
        [IO.File]::WriteAllText($bridgeEnv, $bridgeConfig, [Text.UTF8Encoding]::new($false))
    }
    if (Test-Path -LiteralPath $recoveryServer) {
        Copy-Item -LiteralPath $payloadServer -Destination $recoveryServer -Force
        if (Test-Path -LiteralPath $recoveryManifest) {
            $manifest = Get-Content -LiteralPath $recoveryManifest -Raw | ConvertFrom-Json
            foreach ($entry in @(
                @{ target='dist-server\index.cjs'; current=$currentServer; recovery=$recoveryServer },
                @{ target='dist\index.html'; current=(Join-Path $currentFrontend 'index.html'); recovery=$recoveryFrontend },
                @{ target='hardware-bridge\index.js'; current=$currentBridge; recovery=$recoveryBridge },
                @{ target='hardware-bridge\png-raster.js'; current=$currentBridgeRaster; recovery=$recoveryBridgeRaster }
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

    Step 'Creating recovery Admin and Cashier users'
    $adminResult = & $node $adminScript 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Recovery Admin creation failed: $adminResult" }
    $adminResult | Add-Content -LiteralPath $log -Encoding UTF8

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

    $loginBody = @{ pin = '202626'; deviceName = 'Recovery Admin validation' } | ConvertTo-Json
    $login = Invoke-RestMethod 'http://127.0.0.1:3001/api/auth/pin-login' -Method Post -ContentType 'application/json' -Body $loginBody -TimeoutSec 10
    if (-not $login.token -or -not $login.refreshToken) { throw 'PIN login validation failed.' }

    $cashierLoginBody = @{ pin = '111111'; deviceName = 'Recovery Cashier validation' } | ConvertTo-Json
    $cashierLogin = Invoke-RestMethod 'http://127.0.0.1:3001/api/auth/pin-login' -Method Post -ContentType 'application/json' -Body $cashierLoginBody -TimeoutSec 10
    if (-not $cashierLogin.token -or $cashierLogin.user.role -ne 'CASHIER') { throw 'Cashier PIN 111111 validation failed.' }

    $refreshBody = @{ refreshToken = $login.refreshToken } | ConvertTo-Json
    $refreshed = Invoke-RestMethod 'http://127.0.0.1:3001/api/auth/refresh' -Method Post -ContentType 'application/json' -Body $refreshBody -TimeoutSec 10
    if (-not $refreshed.token) { throw 'Session refresh validation failed.' }

    $authHeaders = @{ Authorization = "Bearer $($refreshed.token)" }
    Invoke-RestMethod 'http://127.0.0.1:3001/api/printers?active=true' -Headers $authHeaders -TimeoutSec 10 | Out-Null

    $bridgeHealthy = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $bridgeResponse = Invoke-WebRequest 'http://127.0.0.1:3002/health' -Headers @{ Origin = 'http://localhost:3001' } -UseBasicParsing -TimeoutSec 3
            if ($bridgeResponse.StatusCode -eq 200 -and $bridgeResponse.Headers['Access-Control-Allow-Origin'] -eq 'http://localhost:3001') {
                $bridgeHealthy = $true
                break
            }
        } catch { }
        Start-Sleep -Seconds 2
    }
    if (-not $bridgeHealthy) { throw 'Print Bridge CORS/health validation failed.' }

    @{ version='1.1.8-final-launch-fix'; appliedAt=(Get-Date).ToString('o'); rollback=$rollback } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $InstallDir 'hotfix-state.json') -Encoding UTF8
    "SUCCESS $(Get-Date -Format o)" | Add-Content -LiteralPath $log -Encoding UTF8
    Write-Host "`nSUCCESS: Admin PIN 202626 | Cashier PIN 111111" -ForegroundColor Green
    exit 0
} catch {
    $message = $_.Exception.Message
    "FAILED $(Get-Date -Format o) $message" | Add-Content -LiteralPath $log -Encoding UTF8
    Write-Host "`nFAILED: $message" -ForegroundColor Red
    if (Test-Path -LiteralPath (Join-Path $rollback 'index.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'index.cjs') -Destination $currentServer -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'dist')) {
        Remove-Item -LiteralPath $currentFrontend -Recurse -Force -ErrorAction SilentlyContinue
        Copy-Item -LiteralPath (Join-Path $rollback 'dist') -Destination $currentFrontend -Recurse -Force
    }
    if (Test-Path -LiteralPath (Join-Path $rollback 'bridge-index.js')) { Copy-Item -LiteralPath (Join-Path $rollback 'bridge-index.js') -Destination $currentBridge -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'png-raster.js')) { Copy-Item -LiteralPath (Join-Path $rollback 'png-raster.js') -Destination $currentBridgeRaster -Force }
    else { Remove-Item -LiteralPath $currentBridgeRaster -Force -ErrorAction SilentlyContinue }
    if (Test-Path -LiteralPath (Join-Path $rollback 'recovery-index.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'recovery-index.cjs') -Destination $recoveryServer -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'recovery-index.html')) { Copy-Item -LiteralPath (Join-Path $rollback 'recovery-index.html') -Destination $recoveryFrontend -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'recovery-bridge-index.js')) { Copy-Item -LiteralPath (Join-Path $rollback 'recovery-bridge-index.js') -Destination $recoveryBridge -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'manifest.json')) { Copy-Item -LiteralPath (Join-Path $rollback 'manifest.json') -Destination $recoveryManifest -Force }
    Start-SystemTasks
    exit 1
}
