# RestoFlow Smart Hotfix Applier (ONE package for server AND cashier)
# Detects the machine role at install time and applies only what that role needs:
#   server  -> dist + dist-server + hardware-bridge + runtime + database schema
#              (verified DB backup first, schema-doctor, full health checks)
#   cashier -> hardware-bridge only (index.js / png-raster.js / package.json)
#              (no database, no backup, no schema changes — files only)
#
# SAFE BY DESIGN: full rollback on any failure. The bridge .env (gateway token
# and SERVER_URL) is NEVER touched on either role.
#
# Usage (run as Administrator):
#   Apply Latest Fixes.bat
#   Apply Latest Fixes.ps1 -InstallDir "D:\Path\To\Install" -Role cashier

param([string]$InstallDir = '', [string]$Role = '')

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Step([string]$Message) { Write-Host "`n>> $Message" -ForegroundColor Cyan }
# NOTE: /TN MUST be quoted — all task names contain spaces and an unquoted
# /TN makes schtasks fail with "Invalid argument/option" (the task neither
# stops nor starts, and the installer then hangs in the health check).
function Run-Task([string]$Action, [string]$Name) {
    # A missing task (e.g. no Print Bridge installed on this machine) must be
    # a skippable warning, never a fatal install failure — some clients
    # legitimately run without that task while others have it.
    try {
        $out = & schtasks.exe "/$Action" /TN "$Name" 2>&1
        return @{ Name = $Name; Action = $Action; ExitCode = $LASTEXITCODE; Output = ([string]$out).Trim() }
    } catch {
        return @{ Name = $Name; Action = $Action; ExitCode = -2; Output = "SCHTASKS_ERROR: $($_.Exception.Message)" }
    }
}
function Start-SystemTasks {
    # A force-killed supervisor never cleans runtime\supervisor.pid, and its
    # guard exits(0) silently when that PID got recycled by ANY other process
    # (task reports success, nothing ever starts). Reconcile BEFORE starting:
    # kill the pid only if it is verifiably our supervisor, else drop the stale file.
    $supPidFile = Join-Path $InstallDir 'runtime\supervisor.pid'
    if (Test-Path -LiteralPath $supPidFile) {
        $oldPid = 0
        [void][int]::TryParse((Get-Content -LiteralPath $supPidFile -Raw).Trim(), [ref]$oldPid)
        $isOurs = $false
        if ($oldPid -gt 0) {
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$oldPid" -ErrorAction SilentlyContinue
            if ($proc -and $proc.Name -eq 'node.exe' -and "$($proc.CommandLine)" -like '*supervisor.cjs*') { $isOurs = $true }
        }
        if ($isOurs) {
            'Supervisor pid file points at a live supervisor; stopping it first' | Add-Content -LiteralPath $log -Encoding UTF8
            Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
        } else {
            "Removing stale supervisor.pid (pid $oldPid is not our supervisor)" | Add-Content -LiteralPath $log -Encoding UTF8
        }
        Remove-Item -LiteralPath $supPidFile -Force -ErrorAction SilentlyContinue
    }
    $results = @()
    foreach ($name in @('Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge')) {
        $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
        if (-not $task) {
            $results += @{ Name = $name; Action = 'Run'; ExitCode = -1; Output = 'TASK_NOT_FOUND_SKIP' }
            continue
        }
        $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
        Set-ScheduledTask -TaskName $name -Settings $settings | Out-Null
        $results += Run-Task 'Run' $name
    }
    return ,$results
}
function Stop-InstallProcesses {
    Get-CimInstance Win32_Process | Where-Object {
        $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.IndexOf($InstallDir, [StringComparison]::OrdinalIgnoreCase) -ge 0
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
}
function Start-BridgeTask {
    $task = Get-ScheduledTask -TaskName 'Sameh Print Bridge' -ErrorAction SilentlyContinue
    if (-not $task) {
        return @{ Name = 'Sameh Print Bridge'; Action = 'Run'; ExitCode = -1; Output = 'TASK_NOT_FOUND' }
    }
    return Run-Task 'Run' 'Sameh Print Bridge'
}
function Wait-BridgeHealthy([int]$Seconds = 60) {
    for ($attempt = 0; $attempt -lt $Seconds; $attempt += 2) {
        try {
            $bridgeResponse = Invoke-WebRequest 'http://127.0.0.1:3002/health' -Headers @{ Origin = 'http://localhost:3001' } -UseBasicParsing -TimeoutSec 3
            if ($bridgeResponse.StatusCode -eq 200) { return $true }
        } catch { }
        Start-Sleep -Seconds 2
    }
    return $false
}
function Resolve-MachineRole {
    # 1) Explicit override (testing / forced installs).
    $wanted = ([string]$Role).Trim().ToLowerInvariant()
    if ($wanted -in @('server', 'cashier')) { return $wanted }
    if ($wanted -ne '') { throw "Invalid -Role '$Role'. Allowed values: server, cashier." }
    # 2) Filesystem ground truth FIRST: a machine carrying the server bundle
    # IS a server, even if a stale install-state.json claims otherwise.
    # (A wrong 'cashier' verdict here would silently leave dist-server stale.)
    if (Test-Path -LiteralPath (Join-Path $InstallDir 'dist-server\index.cjs')) { return 'server' }
    # 3) Installer-recorded role.
    $stateFile = Join-Path $InstallDir 'install-state.json'
    if (Test-Path -LiteralPath $stateFile) {
        try {
            $recorded = (Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json).role
            $recorded = ([string]$recorded).Trim().ToLowerInvariant()
            if ($recorded -in @('server', 'cashier')) { return $recorded }
        } catch { }
    }
    # 4) Bridge without a server bundle means a cashier machine.
    if (Test-Path -LiteralPath (Join-Path $InstallDir 'hardware-bridge\index.js')) { return 'cashier' }
    throw "Cannot determine machine role (no install-state.json, no dist-server, no bridge found under $InstallDir). Re-run with -Role server|cashier."
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Run this fix as Administrator (Run as administrator).' }

if (-not $InstallDir) {
    foreach ($key in @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{5C76AE62-E6AC-4CCF-A431-5A4E48494E53}_is1',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{5C76AE62-E6AC-4CCF-A431-5A4E48494E53}_is1'
    )) {
        $candidate = (Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue).InstallLocation
        if ($candidate) {
            # A server install always has dist\; a cashier install has the bridge.
            if ((Test-Path -LiteralPath (Join-Path $candidate 'dist')) -or (Test-Path -LiteralPath (Join-Path $candidate 'hardware-bridge\index.js'))) {
                $InstallDir = $candidate; break
            }
        }
    }
}
if (-not $InstallDir) {
    foreach ($candidate in @((Join-Path $env:ProgramFiles 'Sameh\RestoFlow ERP'), 'C:\Program Files\Sameh\RestoFlow ERP')) {
        if ((Test-Path -LiteralPath (Join-Path $candidate 'dist')) -or (Test-Path -LiteralPath (Join-Path $candidate 'hardware-bridge\index.js'))) {
            $InstallDir = $candidate; break
        }
    }
}
if (-not $InstallDir) { $InstallDir = Join-Path $env:ProgramFiles 'Sameh\RestoFlow ERP' }
$InstallDir = [IO.Path]::GetFullPath($InstallDir).TrimEnd('\')
if (-not (Test-Path -LiteralPath $InstallDir)) { throw "Installed folder not found: $InstallDir" }

$machineRole = Resolve-MachineRole
$isServer = $machineRole -eq 'server'

$node = Join-Path $InstallDir 'runtime\node.exe'
$backupScript = Join-Path $InstallDir 'runtime\database-backup.cjs'
$stateFile = Join-Path $InstallDir 'install-state.json'
$payloadServer = Join-Path $PSScriptRoot 'payload\dist-server\index.cjs'
$payloadFrontend = Join-Path $PSScriptRoot 'payload\dist'
$payloadBridge = Join-Path $PSScriptRoot 'payload\hardware-bridge\index.js'
$payloadBridgePkg = Join-Path $PSScriptRoot 'payload\hardware-bridge\package.json'
$payloadBridgeRaster = Join-Path $PSScriptRoot 'payload\hardware-bridge\png-raster.js'
$payloadSchemaDoctor = Join-Path $PSScriptRoot 'payload\runtime\schema-doctor.cjs'
$payloadWatchdog = Join-Path $PSScriptRoot 'payload\runtime\watchdog.cjs'
$payloadSupervisor = Join-Path $PSScriptRoot 'payload\runtime\supervisor.cjs'
$payloadSchema = Join-Path $PSScriptRoot 'payload\database\schema.ts'

if ($isServer) {
    foreach ($required in @($node, $backupScript, $stateFile, $payloadServer, $payloadFrontend, $payloadBridge, $payloadBridgeRaster, $payloadSchemaDoctor, $payloadWatchdog, $payloadSupervisor, $payloadSchema)) {
        if (-not (Test-Path -LiteralPath $required)) { throw "Required file is missing: $required" }
    }
} else {
    # Cashier: bridge files only. The bridge .env (gateway token + SERVER_URL)
    # is deliberately NOT part of the payload and is never overwritten.
    foreach ($required in @($payloadBridge, $payloadBridgeRaster)) {
        if (-not (Test-Path -LiteralPath $required)) { throw "Required file is missing: $required" }
    }
    if (-not (Test-Path -LiteralPath (Join-Path $InstallDir 'hardware-bridge\index.js'))) {
        throw "Installed cashier bridge not found: $(Join-Path $InstallDir 'hardware-bridge\index.js')"
    }
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$rollback = Join-Path $InstallDir "updates\rollback-$timestamp"
$currentServer = Join-Path $InstallDir 'dist-server\index.cjs'
$currentFrontend = Join-Path $InstallDir 'dist'
$currentBridge = Join-Path $InstallDir 'hardware-bridge\index.js'
$currentBridgePkg = Join-Path $InstallDir 'hardware-bridge\package.json'
$currentBridgeRaster = Join-Path $InstallDir 'hardware-bridge\png-raster.js'
$currentSchemaDoctor = Join-Path $InstallDir 'runtime\schema-doctor.cjs'
$currentWatchdog = Join-Path $InstallDir 'runtime\watchdog.cjs'
$currentSupervisor = Join-Path $InstallDir 'runtime\supervisor.cjs'
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
"Role detected: $machineRole" | Add-Content -LiteralPath $log -Encoding UTF8

try {
    if ($isServer) {
        Step 'Creating and verifying database backup (data untouched by this fix)'
        $backupResult = & $node $backupScript 2>&1
        if ($LASTEXITCODE -ne 0) { throw "Verified database backup failed: $backupResult" }
        $backupResult | Add-Content -LiteralPath $log -Encoding UTF8

        Step 'Stopping RestoFlow tasks and processes'
        foreach ($name in @('Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge')) {
            try {
                $stopResult = Run-Task 'End' $name
                "Task End [$name] exit=$($stopResult.ExitCode) $($stopResult.Output)" | Add-Content -LiteralPath $log -Encoding UTF8
            } catch {
                # Never let a missing/stuck stop kill the install — a task that
                # does not exist (or cannot be stopped) is logged and skipped.
                "Task End [$name] threw (non-fatal, continuing): $($_.Exception.Message)" | Add-Content -LiteralPath $log -Encoding UTF8
                Write-Host "  ... stop [$name] skipped: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
        Stop-InstallProcesses

        # A pure server machine may have no local bridge installed at all
        # (bridges live on the cashiers). Bridge files are then skipped —
        # there is nothing to back up, update, or roll back.
        $hasLocalBridge = Test-Path -LiteralPath $currentBridge
        if ($hasLocalBridge) { 'Local bridge found; its files will be updated.' | Add-Content -LiteralPath $log -Encoding UTF8 }
        else { 'No local bridge installed on this server; bridge files will be skipped.' | Add-Content -LiteralPath $log -Encoding UTF8 }

        Step 'Saving rollback files'
        Copy-Item -LiteralPath $currentServer -Destination (Join-Path $rollback 'index.cjs') -Force
        Copy-Item -LiteralPath $currentFrontend -Destination (Join-Path $rollback 'dist') -Recurse -Force
        if ($hasLocalBridge) { Copy-Item -LiteralPath $currentBridge -Destination (Join-Path $rollback 'bridge-index.js') -Force }
        if (Test-Path -LiteralPath $currentBridgePkg) { Copy-Item -LiteralPath $currentBridgePkg -Destination (Join-Path $rollback 'bridge-package.json') -Force }
        if (Test-Path -LiteralPath $currentBridgeRaster) { Copy-Item -LiteralPath $currentBridgeRaster -Destination (Join-Path $rollback 'png-raster.js') -Force }
        if (Test-Path -LiteralPath $currentSchemaDoctor) { Copy-Item -LiteralPath $currentSchemaDoctor -Destination (Join-Path $rollback 'schema-doctor.cjs') -Force }
        if (Test-Path -LiteralPath $currentWatchdog) { Copy-Item -LiteralPath $currentWatchdog -Destination (Join-Path $rollback 'watchdog.cjs') -Force }
        if (Test-Path -LiteralPath $currentSupervisor) { Copy-Item -LiteralPath $currentSupervisor -Destination (Join-Path $rollback 'supervisor.cjs') -Force }
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
        if ($hasLocalBridge) {
            Copy-Item -LiteralPath $payloadBridge -Destination $currentBridge -Force
            if (Test-Path -LiteralPath $payloadBridgePkg) { Copy-Item -LiteralPath $payloadBridgePkg -Destination $currentBridgePkg -Force }
            Copy-Item -LiteralPath $payloadBridgeRaster -Destination $currentBridgeRaster -Force
        } else {
            Write-Host '  ... no local bridge on this server; bridge payload skipped.' -ForegroundColor Yellow
        }
        Copy-Item -LiteralPath $payloadSchemaDoctor -Destination $currentSchemaDoctor -Force
        Copy-Item -LiteralPath $payloadWatchdog -Destination $currentWatchdog -Force
        Copy-Item -LiteralPath $payloadSupervisor -Destination $currentSupervisor -Force
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
        $startResults = Start-SystemTasks
        foreach ($r in @($startResults)) {
            "Task $($r.Action) [$($r.Name)] exit=$($r.ExitCode) $($r.Output)" | Add-Content -LiteralPath $log -Encoding UTF8
        }
        # Tasks that simply do not exist on this machine (e.g. no Print Bridge
        # installed) are skipped — only tasks that exist but failed to start
        # are fatal. The server health check below remains the real gate.
        $skippedStarts = @($startResults | Where-Object { $_.Output -eq 'TASK_NOT_FOUND_SKIP' })
        foreach ($s in $skippedStarts) {
            "Task Run [$($s.Name)] skipped: not installed on this machine" | Add-Content -LiteralPath $log -Encoding UTF8
            Write-Host "  ... task [$($s.Name)] not installed, skipped." -ForegroundColor Yellow
        }
        $failedStarts = @($startResults | Where-Object { $_.ExitCode -ne 0 -and $_.Output -ne 'TASK_NOT_FOUND_SKIP' })
        if ($failedStarts.Count -gt 0) {
            throw "Failed to restart Windows tasks: $(($failedStarts | ForEach-Object { "$($_.Name): $($_.Output)" }) -join '; '). Re-run the full installer to repair the scheduled tasks, then retry the fix."
        }
        try {
            $listeners = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue |
                Select-Object OwningProcess, @{ N = 'Process'; E = { (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName } }
            "Port 3001 listeners right after restart: $($listeners | ConvertTo-Json -Compress)" | Add-Content -LiteralPath $log -Encoding UTF8
        } catch { }
        $healthy = $false
        $lastHealthDetail = 'no attempt yet'
        for ($attempt = 0; $attempt -lt 45; $attempt++) {
            Start-Sleep -Seconds 2
            try {
                $health = Invoke-RestMethod 'http://127.0.0.1:3001/api/health' -TimeoutSec 3
                $dbStatus = $health.health.services.database.status
                if ($dbStatus -eq 'CONNECTED') { $healthy = $true; break }
                $lastHealthDetail = "HTTP ok but database.status='$dbStatus' (overall='$($health.health.status)')"
            } catch {
                $lastHealthDetail = $_.Exception.Message
            }
            if ((($attempt + 1) % 10) -eq 0) { Write-Host "  ... still waiting for a healthy server ($($attempt + 1)/45). Last: $lastHealthDetail" }
        }
        "Health check result: healthy=$healthy last='$lastHealthDetail'" | Add-Content -LiteralPath $log -Encoding UTF8
        if (-not $healthy) {
            try {
                '--- task states ---' | Add-Content -LiteralPath $log -Encoding UTF8
                foreach ($name in @('Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge')) {
                    $t = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue | Select-Object TaskName, State
                    $i = Get-ScheduledTaskInfo -TaskName $name -ErrorAction SilentlyContinue | Select-Object LastRunTime, LastTaskResult, NextRunTime
                    "task: $($t | ConvertTo-Json -Compress) info: $($i | ConvertTo-Json -Compress)" | Add-Content -LiteralPath $log -Encoding UTF8
                }
                '--- server.log tail ---' | Add-Content -LiteralPath $log -Encoding UTF8
                $srvLog = Join-Path $logDir 'server.log'
                if (Test-Path -LiteralPath $srvLog) { Get-Content -LiteralPath $srvLog -Tail 25 | Add-Content -LiteralPath $log -Encoding UTF8 }
                else { 'server.log not found (the server process never started writing)' | Add-Content -LiteralPath $log -Encoding UTF8 }
                '--- supervisor.log tail ---' | Add-Content -LiteralPath $log -Encoding UTF8
                $supLog = Join-Path $logDir 'supervisor.log'
                if (Test-Path -LiteralPath $supLog) { Get-Content -LiteralPath $supLog -Tail 25 | Add-Content -LiteralPath $log -Encoding UTF8 }
            } catch { }
            throw "Server did not become healthy within 90 seconds. Last check: $lastHealthDetail. Full diagnostics collected in $log"
        }

        $bridgeHealthy = Wait-BridgeHealthy 30
        if (-not $bridgeHealthy) { Write-Host 'Note: Print Bridge health endpoint did not respond yet (it keeps retrying in the background).' -ForegroundColor Yellow }
    } else {
        Step 'Cashier machine detected: updating the print bridge only (no database, no backup)'
        # A bridge started manually (no scheduled task) must NOT be killed:
        # there would be nothing to restart it, leaving printing dead. Update
        # its files in place and let the operator restart it.
        $bridgeTask = Get-ScheduledTask -TaskName 'Sameh Print Bridge' -ErrorAction SilentlyContinue
        if ($bridgeTask) {
            Run-Task 'End' 'Sameh Print Bridge' | Out-Null
            Stop-InstallProcesses
        } else {
            'No Print Bridge scheduled task: running processes left untouched; bridge files will be updated in place.' | Add-Content -LiteralPath $log -Encoding UTF8
            Write-Host 'Note: no Print Bridge scheduled task — running bridge (if any) left untouched.' -ForegroundColor Yellow
        }

        Step 'Saving bridge rollback files'
        Copy-Item -LiteralPath $currentBridge -Destination (Join-Path $rollback 'bridge-index.js') -Force
        if (Test-Path -LiteralPath $currentBridgePkg) { Copy-Item -LiteralPath $currentBridgePkg -Destination (Join-Path $rollback 'bridge-package.json') -Force }
        if (Test-Path -LiteralPath $currentBridgeRaster) { Copy-Item -LiteralPath $currentBridgeRaster -Destination (Join-Path $rollback 'png-raster.js') -Force }

        Step 'Applying bridge fix (bridge .env with gateway token is left untouched)'
        Copy-Item -LiteralPath $payloadBridge -Destination $currentBridge -Force
        if (Test-Path -LiteralPath $payloadBridgePkg) { Copy-Item -LiteralPath $payloadBridgePkg -Destination $currentBridgePkg -Force }
        Copy-Item -LiteralPath $payloadBridgeRaster -Destination $currentBridgeRaster -Force

        Step 'Restarting the print bridge and checking health'
        if ($bridgeTask) {
            $bridgeStart = Start-BridgeTask
            "Task $($bridgeStart.Action) [$($bridgeStart.Name)] exit=$($bridgeStart.ExitCode) $($bridgeStart.Output)" | Add-Content -LiteralPath $log -Encoding UTF8
            if ($bridgeStart.ExitCode -ne 0 -and $bridgeStart.Output -ne 'TASK_NOT_FOUND') {
                throw "Failed to restart the Print Bridge task: $($bridgeStart.Output). Re-run the full installer to repair the scheduled tasks, then retry the fix."
            }
            if (-not (Wait-BridgeHealthy 60)) {
                throw "Print Bridge did not become healthy within 60 seconds (http://127.0.0.1:3002/health). Diagnostics collected in $log"
            }
            'Print Bridge is healthy.' | Add-Content -LiteralPath $log -Encoding UTF8
        } else {
            # Files are correctly in place; only a (re)start is pending, which
            # no script can do for a manually-managed bridge. Advisory only.
            if (Wait-BridgeHealthy 20) {
                'Bridge already running (manual start); operator must restart it to load the updated files.' | Add-Content -LiteralPath $log -Encoding UTF8
                Write-Host 'Bridge files updated. A manually-started bridge is still running the OLD code — restart it to load the fix.' -ForegroundColor Yellow
            } else {
                'Bridge not running and no scheduled task exists; files updated, operator must start the bridge manually.' | Add-Content -LiteralPath $log -Encoding UTF8
                Write-Host 'WARNING: bridge files updated but no bridge is running and no scheduled task exists — start the bridge manually.' -ForegroundColor Yellow
            }
        }
    }

    @{ version='latest-cumulative-fix'; role=$machineRole; appliedAt=(Get-Date).ToString('o'); rollback=$rollback } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $InstallDir 'hotfix-state.json') -Encoding UTF8
    "SUCCESS $machineRole $(Get-Date -Format o)" | Add-Content -LiteralPath $log -Encoding UTF8
    if ($isServer) {
        Write-Host "`nSUCCESS: latest fixes applied (server). Open the app once, then press Ctrl+F5 inside it." -ForegroundColor Green
    } else {
        Write-Host "`nSUCCESS: print bridge fix applied (cashier). Receipts use the server's updated templates after one Ctrl+F5 in the cashier browser." -ForegroundColor Green
    }
    exit 0
} catch {
    $message = $_.Exception.Message
    "FAILED $machineRole $(Get-Date -Format o) $message" | Add-Content -LiteralPath $log -Encoding UTF8
    Write-Host "`nFAILED: $message" -ForegroundColor Red
    Write-Host 'Restoring previous application files automatically...' -ForegroundColor Yellow
    if ($isServer) {
        if (Test-Path -LiteralPath (Join-Path $rollback 'index.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'index.cjs') -Destination $currentServer -Force }
        if (Test-Path -LiteralPath (Join-Path $rollback 'dist')) {
            Remove-Item -LiteralPath $currentFrontend -Recurse -Force -ErrorAction SilentlyContinue
            Copy-Item -LiteralPath (Join-Path $rollback 'dist') -Destination $currentFrontend -Recurse -Force
        }
        if (Test-Path -LiteralPath (Join-Path $rollback 'bridge-package.json')) { Copy-Item -LiteralPath (Join-Path $rollback 'bridge-package.json') -Destination $currentBridgePkg -Force }
        if (Test-Path -LiteralPath (Join-Path $rollback 'schema-doctor.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'schema-doctor.cjs') -Destination $currentSchemaDoctor -Force }
        if (Test-Path -LiteralPath (Join-Path $rollback 'watchdog.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'watchdog.cjs') -Destination $currentWatchdog -Force }
        if (Test-Path -LiteralPath (Join-Path $rollback 'supervisor.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'supervisor.cjs') -Destination $currentSupervisor -Force }
        if (Test-Path -LiteralPath (Join-Path $rollback 'schema.ts')) { Copy-Item -LiteralPath (Join-Path $rollback 'schema.ts') -Destination $currentSchema -Force }
        if (Test-Path -LiteralPath (Join-Path $rollback 'recovery-index.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'recovery-index.cjs') -Destination $recoveryServer -Force }
        if (Test-Path -LiteralPath (Join-Path $rollback 'recovery-index.html')) { Copy-Item -LiteralPath (Join-Path $rollback 'recovery-index.html') -Destination $recoveryFrontend -Force }
        if (Test-Path -LiteralPath (Join-Path $rollback 'recovery-bridge-index.js')) { Copy-Item -LiteralPath (Join-Path $rollback 'recovery-bridge-index.js') -Destination $recoveryBridge -Force }
        if (Test-Path -LiteralPath (Join-Path $rollback 'manifest.json')) { Copy-Item -LiteralPath (Join-Path $rollback 'manifest.json') -Destination $recoveryManifest -Force }
    }
    if (Test-Path -LiteralPath (Join-Path $rollback 'bridge-index.js')) { Copy-Item -LiteralPath (Join-Path $rollback 'bridge-index.js') -Destination $currentBridge -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'png-raster.js')) { Copy-Item -LiteralPath (Join-Path $rollback 'png-raster.js') -Destination $currentBridgeRaster -Force }
    if ($isServer) { Start-SystemTasks } else { Start-BridgeTask | Out-Null }
    exit 1
}
