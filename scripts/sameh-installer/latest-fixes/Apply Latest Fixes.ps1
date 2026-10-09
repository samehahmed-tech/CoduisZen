# RestoFlow Smart Hotfix Applier (ONE package for server AND cashier)
# Detects the machine role at install time and applies only what that role needs:
#   server  -> dist + dist-server + hardware-bridge + runtime + database schema
#              (payload verified, .env launch-gate healed, new bundle boot-probed
#               BEFORE the swap, verified DB backup, schema-doctor, health checks)
#   cashier -> hardware-bridge only (index.js / png-raster.js / package.json)
#              (no database, no backup, no schema changes — files only)
#
# SAFE BY DESIGN: full rollback on any failure (now including .env).
# The bridge .env (gateway token and SERVER_URL) is NEVER overwritten.
#
# Usage (run as Administrator):
#   Apply Latest Fixes.bat
#   Apply Latest Fixes.ps1 -InstallDir "D:\Path\To\Install" -Role cashier

param([string]$InstallDir = '', [string]$Role = '')

. (Join-Path $PSScriptRoot 'Install-Common.ps1')
Assert-CAdmin

if (-not $InstallDir) { $InstallDir = Resolve-CInstallDir }
if (-not $InstallDir) { $InstallDir = Join-Path $env:ProgramFiles 'Sameh\RestoFlow ERP' }
$InstallDir = [IO.Path]::GetFullPath($InstallDir).TrimEnd('\')
if (-not (Test-Path -LiteralPath $InstallDir)) { throw "Installed folder not found: $InstallDir" }

$machineRole = Resolve-CMachineRole $InstallDir $Role
$isServer = $machineRole -eq 'server'

$node = Join-Path $InstallDir 'runtime\node.exe'
$backupScript = Join-Path $InstallDir 'runtime\database-backup.cjs'
$stateFile = Join-Path $InstallDir 'install-state.json'
$manifestPath = Join-Path $PSScriptRoot 'manifest.json'
$packagePayload = Join-Path $PSScriptRoot 'payload'
$payloadServer = Join-Path $packagePayload 'dist-server\index.cjs'
$payloadServerModules = Join-Path $packagePayload 'dist-server\node_modules'
$payloadFrontend = Join-Path $packagePayload 'dist'
$payloadBridge = Join-Path $packagePayload 'hardware-bridge\index.js'
$payloadBridgePkg = Join-Path $packagePayload 'hardware-bridge\package.json'
$payloadBridgeRaster = Join-Path $packagePayload 'hardware-bridge\png-raster.js'
$payloadSchemaDoctor = Join-Path $packagePayload 'runtime\schema-doctor.cjs'
$payloadWatchdog = Join-Path $packagePayload 'runtime\watchdog.cjs'
$payloadSupervisor = Join-Path $packagePayload 'runtime\supervisor.cjs'
$payloadMonitor = Join-Path $packagePayload 'runtime\monitor.cjs'
$payloadPortGuard = Join-Path $packagePayload 'runtime\port-guard.cjs'
$payloadSchema = Join-Path $packagePayload 'database\schema.ts'

if ($isServer) {
    foreach ($required in @($node, $backupScript, $stateFile, $payloadServer, $payloadFrontend, $payloadBridge, $payloadBridgeRaster, $payloadSchemaDoctor, $payloadWatchdog, $payloadSupervisor, $payloadSchema)) {
        if (-not (Test-Path -LiteralPath $required)) { throw "Required file is missing: $required" }
    }
    # Runtime self-heal loop files: required in new packages, optional when
    # applying an older package (their absence just skips that update).
    $payloadMonitorOptional = Test-Path -LiteralPath $payloadMonitor
    $payloadPortGuardOptional = Test-Path -LiteralPath $payloadPortGuard
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
$envBackupDir = Join-Path $InstallDir 'updates\env-backups'
$currentServer = Join-Path $InstallDir 'dist-server\index.cjs'
$currentServerModules = Join-Path $InstallDir 'dist-server\node_modules'
$currentFrontend = Join-Path $InstallDir 'dist'
$currentBridge = Join-Path $InstallDir 'hardware-bridge\index.js'
$currentBridgePkg = Join-Path $InstallDir 'hardware-bridge\package.json'
$currentBridgeRaster = Join-Path $InstallDir 'hardware-bridge\png-raster.js'
$currentSchemaDoctor = Join-Path $InstallDir 'runtime\schema-doctor.cjs'
$currentWatchdog = Join-Path $InstallDir 'runtime\watchdog.cjs'
$currentSupervisor = Join-Path $InstallDir 'runtime\supervisor.cjs'
$currentMonitor = Join-Path $InstallDir 'runtime\monitor.cjs'
$currentPortGuard = Join-Path $InstallDir 'runtime\port-guard.cjs'
$currentSchema = Join-Path $InstallDir 'database\schema.ts'
$currentEnv = Join-Path $InstallDir '.env'
$recoveryServer = Join-Path $InstallDir 'recovery\dist-server\index.cjs'
$recoveryFrontend = Join-Path $InstallDir 'recovery\dist\index.html'
$recoveryBridge = Join-Path $InstallDir 'recovery\hardware-bridge\index.js'
$recoveryBridgeRaster = Join-Path $InstallDir 'recovery\hardware-bridge\png-raster.js'
$recoveryWatchdog = Join-Path $InstallDir 'runtime\watchdog.cjs'
$recoveryManifest = Join-Path $InstallDir 'recovery\manifest.json'
$logDir = Join-Path $InstallDir 'logs'
New-Item -ItemType Directory -Path $rollback, $logDir -Force | Out-Null
$script:CommonLog = Join-Path $logDir "latest-fixes-$timestamp.log"
"Role detected: $machineRole" | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8
$envBackupPath = ''

try {
    # ── Pre-flight: payload integrity (catches truncated/partial copies) ──
    Write-CStep 'Verifying hotfix package integrity'
    $manifest = Test-CManifestFile $manifestPath $PSScriptRoot
    if (-not $manifest.ok) { throw "Package verification failed: $($manifest.detail)" }
    Write-COk $manifest.detail

    $disk = Test-CDiskSpace $InstallDir
    if (-not $disk.ok) { throw "Not enough disk space: $($disk.freeMB) MB free, need $($disk.needMB) MB." }
    Write-COk "disk free: $($disk.freeMB) MB / node: $(Get-CNodeVersion $node)"

    if ($isServer) {
        # ── .env launch-gate heal BEFORE touching anything ──
        # A new bundle that fails the production gate exits instantly on every
        # boot (dead system + endless supervisor restarts). Heal first so both
        # the probe below and the real server see a bootable config.
        Write-CStep 'Auditing server .env against the production launch gate'
        if (-not (Test-Path -LiteralPath $currentEnv)) { throw '.env not found — cannot safely update this server. Restore it from backup first.' }
        $gateIssues = @(Test-CEnvLaunchGate (Read-CEnvFile $currentEnv).Map)
        if ($gateIssues.Count -eq 0) {
            Write-COk '.env passes the launch gate; untouched'
        } else {
            foreach ($g in $gateIssues) { Write-CWarn "$($g.key): $($g.issue)" }
            $healed = @(Repair-CServerEnv $currentEnv (Join-Path $InstallDir 'hardware-bridge\.env'))
            foreach ($a in $healed) { Write-CLog "  env: $a"; Write-Host "   ... env: $a" }
            Write-COk '.env healed (backup kept under updates\env-backups)'
        }

        # ── Shipped server env additions (e.g. Apple MapKit keys) ──
        # payload\server.env.add carries verified values from the build machine.
        # MAPKIT_* are overwritten so maps work out of the box; nothing else touched.
        $shippedEnv = Join-Path $packagePayload 'server.env.add'
        if (Test-Path -LiteralPath $shippedEnv) {
            Write-CStep 'Merging shipped server env additions (MapKit)'
            $parsed = Read-CEnvFile $currentEnv
            $shipped = Read-CEnvFile $shippedEnv
            $merged = @()
            foreach ($key in @($shipped.Map.Keys)) {
                if ($key -like 'MAPKIT_*' -and [string]$shipped.Map[$key]) {
                    Set-CEnvValue $parsed $key ([string]$shipped.Map[$key])
                    $merged += $key
                }
            }
            if ($merged.Count -gt 0) {
                $envBackupDir = Join-Path $InstallDir 'updates\env-backups'
                Backup-CFile $currentEnv $envBackupDir '.env' | Out-Null
                Write-CEnvFile $currentEnv $parsed
                Write-COk ("server .env updated: " + ($merged -join ', '))
            } else {
                Write-CLog 'server.env.add present but no MAPKIT_* values — skipped'
            }
        }

        # ── Boot-probe the NEW bundle before it replaces the working one ──
        Write-CStep 'Boot-probing the new server bundle (test port, live files untouched)'
        $probe = Test-CServerBundleBoot $node $payloadServer $InstallDir 39999 30
        Write-CLog "probe: $($probe.detail)"
        if ($probe.logTail) { Write-CLog "probe tail: $($probe.logTail)" }
        if (-not $probe.ok) {
            throw "New server bundle FAILED its boot probe — refusing to install it. Detail: $($probe.detail) $(if ($probe.logTail) { "Log tail: $($probe.logTail)" }) If the log shows MODULE_NOT_FOUND, rebuild the package with the current builder (it ships self-contained server modules)."
        }
        Write-COk "new bundle boots cleanly ($($probe.detail))"

        Write-CStep 'Creating and verifying database backup (data untouched by this fix)'
        $backupResult = & $node $backupScript 2>&1
        if ($LASTEXITCODE -ne 0) { throw "Verified database backup failed: $backupResult" }
        $backupResult | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8

        Write-CStep 'Stopping RestoFlow tasks and processes'
        foreach ($name in @('Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge')) {
            try {
                $stopResult = Invoke-CTask 'End' $name
                "Task End [$name] exit=$($stopResult.ExitCode) $($stopResult.Output)" | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8
            } catch {
                "Task End [$name] threw (non-fatal, continuing): $($_.Exception.Message)" | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8
                Write-Host "  ... stop [$name] skipped: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
        Stop-CInstallProcesses $InstallDir

        $hasLocalBridge = Test-Path -LiteralPath $currentBridge
        if ($hasLocalBridge) { 'Local bridge found; its files will be updated.' | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8 }
        else { 'No local bridge installed on this server; bridge files will be skipped.' | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8 }

        Write-CStep 'Saving rollback files'
        Copy-Item -LiteralPath $currentServer -Destination (Join-Path $rollback 'index.cjs') -Force
        if (Test-Path -LiteralPath $currentServerModules) {
            Copy-Item -LiteralPath $currentServerModules -Destination (Join-Path $rollback 'node_modules') -Recurse -Force
        }
        Copy-Item -LiteralPath $currentFrontend -Destination (Join-Path $rollback 'dist') -Recurse -Force
        if ($hasLocalBridge) { Copy-Item -LiteralPath $currentBridge -Destination (Join-Path $rollback 'bridge-index.js') -Force }
        if (Test-Path -LiteralPath $currentBridgePkg) { Copy-Item -LiteralPath $currentBridgePkg -Destination (Join-Path $rollback 'bridge-package.json') -Force }
        if (Test-Path -LiteralPath $currentBridgeRaster) { Copy-Item -LiteralPath $currentBridgeRaster -Destination (Join-Path $rollback 'png-raster.js') -Force }
        if (Test-Path -LiteralPath $currentSchemaDoctor) { Copy-Item -LiteralPath $currentSchemaDoctor -Destination (Join-Path $rollback 'schema-doctor.cjs') -Force }
        if (Test-Path -LiteralPath $currentWatchdog) { Copy-Item -LiteralPath $currentWatchdog -Destination (Join-Path $rollback 'watchdog.cjs') -Force }
        if (Test-Path -LiteralPath $currentSupervisor) { Copy-Item -LiteralPath $currentSupervisor -Destination (Join-Path $rollback 'supervisor.cjs') -Force }
        if (Test-Path -LiteralPath $currentMonitor) { Copy-Item -LiteralPath $currentMonitor -Destination (Join-Path $rollback 'monitor.cjs') -Force }
        if (Test-Path -LiteralPath $currentPortGuard) { Copy-Item -LiteralPath $currentPortGuard -Destination (Join-Path $rollback 'port-guard.cjs') -Force }
        if (Test-Path -LiteralPath $currentSchema) { Copy-Item -LiteralPath $currentSchema -Destination (Join-Path $rollback 'schema.ts') -Force }
        if (Test-Path -LiteralPath $recoveryServer) { Copy-Item -LiteralPath $recoveryServer -Destination (Join-Path $rollback 'recovery-index.cjs') -Force }
        if (Test-Path -LiteralPath $recoveryFrontend) { Copy-Item -LiteralPath $recoveryFrontend -Destination (Join-Path $rollback 'recovery-index.html') -Force }
        if (Test-Path -LiteralPath $recoveryBridge) { Copy-Item -LiteralPath $recoveryBridge -Destination (Join-Path $rollback 'recovery-bridge-index.js') -Force }
        if (Test-Path -LiteralPath $recoveryManifest) { Copy-Item -LiteralPath $recoveryManifest -Destination (Join-Path $rollback 'manifest.json') -Force }
        $envBackupPath = Backup-CFile $currentEnv $envBackupDir '.env'
        if ($envBackupPath) { Write-COk "backed up .env" }

        Write-CStep 'Applying cumulative application fix'
        Copy-Item -LiteralPath $payloadServer -Destination $currentServer -Force
        # Self-contained runtime modules: without these the bundle dies with
        # MODULE_NOT_FOUND on machines lacking a root node_modules (the classic
        # "works at some clients but not others"). Mirrored, never merged.
        if (Test-Path -LiteralPath $payloadServerModules) {
            Remove-Item -LiteralPath $currentServerModules -Recurse -Force -ErrorAction SilentlyContinue
            Copy-Item -LiteralPath $payloadServerModules -Destination $currentServerModules -Recurse -Force
            $script:modulesInstalled = $true
            Write-COk 'installed self-contained server modules (mssql/bcryptjs closure)'
            # Native bindings (msnodesqlv8) only load on a matching node major.
            # A mismatched binding crashes harder than a missing one, so drop it
            # when majors differ and let the install fall back to its own files.
            try {
                $manifestNode = ''
                if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'manifest.json')) {
                    $manifestNode = [string](Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json -ErrorAction SilentlyContinue).node
                }
                $installNode = Get-CNodeVersion $node
                $manifestMajor = if ($manifestNode -match 'v?(\d+)\.') { $Matches[1] } else { '' }
                $installMajor = if ($installNode -match 'v?(\d+)\.') { $Matches[1] } else { '' }
                if ($manifestMajor -and $installMajor -and ($manifestMajor -ne $installMajor)) {
                    Remove-Item -LiteralPath (Join-Path $currentServerModules 'msnodesqlv8') -Recurse -Force -ErrorAction SilentlyContinue
                    Write-CWarn "node major differs (package built on v$manifestMajor, install runs $installNode): shipped msnodesqlv8 binding skipped — install keeps its own."
                }
            } catch {
                Write-CLog "node-major check skipped: $($_.Exception.Message)"
            }
        } else {
            Write-CWarn 'package has no dist-server\node_modules — bundle must resolve modules from the install (old package?)'
        }
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
        if ($payloadMonitorOptional) { Copy-Item -LiteralPath $payloadMonitor -Destination $currentMonitor -Force }
        if ($payloadPortGuardOptional) { Copy-Item -LiteralPath $payloadPortGuard -Destination $currentPortGuard -Force }
        Copy-Item -LiteralPath $payloadSchema -Destination $currentSchema -Force

        Write-CStep 'Repairing database schema (backup already verified)'
        $schemaResult = & $node $currentSchemaDoctor 2>&1
        if ($LASTEXITCODE -ne 0) { throw "Database schema repair failed: $schemaResult" }
        $schemaResult | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8

        if (Test-Path -LiteralPath $recoveryServer) {
            Write-CStep 'Refreshing recovery copy hashes'
            # Bookkeeping only: must NEVER fail the install (a manifest quirk
            # rolling back a fully-applied fix is worse than stale hashes).
            try {
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
                    if ($entry.current -eq $entry.recovery) {
                        # Self-tracked live file (watchdog.cjs IS its own recovery
                        # record): copying it onto itself throws, so refresh the
                        # hash only and never copy.
                        $hash = (Get-FileHash -LiteralPath $entry.current -Algorithm SHA256).Hash.ToLowerInvariant()
                    } else {
                        New-Item -ItemType Directory -Path (Split-Path -Parent $entry.recovery) -Force | Out-Null
                        Copy-Item -LiteralPath $entry.current -Destination $entry.recovery -Force
                        $hash = (Get-FileHash -LiteralPath $entry.current -Algorithm SHA256).Hash.ToLowerInvariant()
                    }
                    if ($record) { $record.sha256 = $hash }
                    else { $manifest = @($manifest) + [PSCustomObject]@{ target=$entry.target; role='all'; sha256=$hash } }
                }
                [IO.File]::WriteAllText($recoveryManifest, ($manifest | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
            }
            } catch {
                "Recovery-hash refresh skipped (non-fatal): $($_.Exception.Message)" | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8
                Write-Host '  ... recovery-hash refresh skipped (non-fatal, install continues).' -ForegroundColor Yellow
            }
        }

        Write-CStep 'Restarting services and checking health'
        $startResults = Start-CSystemTasks $InstallDir
        foreach ($r in @($startResults)) {
            "Task $($r.Action) [$($r.Name)] exit=$($r.ExitCode) $($r.Output)" | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8
        }
        $skippedStarts = @($startResults | Where-Object { $_.Output -eq 'TASK_NOT_FOUND_SKIP' })
        foreach ($s in $skippedStarts) {
            "Task Run [$($s.Name)] skipped: not installed on this machine" | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8
            Write-Host "  ... task [$($s.Name)] not installed, skipped." -ForegroundColor Yellow
        }
        $failedStarts = @($startResults | Where-Object { $_.ExitCode -ne 0 -and $_.Output -ne 'TASK_NOT_FOUND_SKIP' })
        if ($failedStarts.Count -gt 0) {
            throw "Failed to restart Windows tasks: $(($failedStarts | ForEach-Object { "$($_.Name): $($_.Output)" }) -join '; '). Run 'Repair Installed System' to rebuild them, or re-run the full installer."
        }
        $healthy = Wait-CServerHealthy 90
        "Health check result: ok=$($healthy.ok) detail='$($healthy.detail)'" | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8
        if (-not $healthy.ok) {
            "-- diagnostics snapshot --" | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8
            Collect-CDiagnostics $InstallDir | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8
            throw "Server did not become healthy within 90 seconds ($($healthy.detail)). Diagnostics collected in $script:CommonLog — run 'Repair Installed System' next."
        }
        Write-COk "server healthy ($($healthy.detail))"

        $bridgeHealthy = Wait-CBridgeHealthy 30
        if (-not $bridgeHealthy.ok) { Write-Host 'Note: Print Bridge health endpoint did not respond yet (it keeps retrying in the background).' -ForegroundColor Yellow }
    } else {
        Write-CStep 'Cashier machine detected: updating the print bridge only (no database, no backup)'
        $bridgeTask = Get-ScheduledTask -TaskName 'Sameh Print Bridge' -ErrorAction SilentlyContinue
        if ($bridgeTask) {
            Invoke-CTask 'End' 'Sameh Print Bridge' | Out-Null
            Stop-CInstallProcesses $InstallDir
        } else {
            'No Print Bridge scheduled task: running processes left untouched; bridge files will be updated in place.' | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8
            Write-Host 'Note: no Print Bridge scheduled task — running bridge (if any) left untouched.' -ForegroundColor Yellow
        }

        Write-CStep 'Saving bridge rollback files'
        Copy-Item -LiteralPath $currentBridge -Destination (Join-Path $rollback 'bridge-index.js') -Force
        if (Test-Path -LiteralPath $currentBridgePkg) { Copy-Item -LiteralPath $currentBridgePkg -Destination (Join-Path $rollback 'bridge-package.json') -Force }
        if (Test-Path -LiteralPath $currentBridgeRaster) { Copy-Item -LiteralPath $currentBridgeRaster -Destination (Join-Path $rollback 'png-raster.js') -Force }

        Write-CStep 'Applying bridge fix (bridge .env with gateway token is left untouched)'
        Copy-Item -LiteralPath $payloadBridge -Destination $currentBridge -Force
        if (Test-Path -LiteralPath $payloadBridgePkg) { Copy-Item -LiteralPath $payloadBridgePkg -Destination $currentBridgePkg -Force }
        Copy-Item -LiteralPath $payloadBridgeRaster -Destination $currentBridgeRaster -Force
        # Bridge is plain node: syntax-check the new file before any restart.
        $bridgeNode = Get-CNodeExe $InstallDir
        if ($bridgeNode) {
            & $bridgeNode --check $currentBridge 2>&1 | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8
            if ($LASTEXITCODE -ne 0) { throw 'New bridge index.js failed its syntax check — refusing to restart it.' }
        } else {
            Write-CWarn 'node.exe not found for a syntax check; skipping (bridge files already verified by package manifest)'
        }

        Write-CStep 'Restarting the print bridge and checking health'
        if ($bridgeTask) {
            $bridgeStart = Invoke-CTask 'Run' 'Sameh Print Bridge'
            "Task $($bridgeStart.Action) [$($bridgeStart.Name)] exit=$($bridgeStart.ExitCode) $($bridgeStart.Output)" | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8
            if ($bridgeStart.ExitCode -ne 0 -and $bridgeStart.Output -ne 'TASK_NOT_FOUND') {
                throw "Failed to restart the Print Bridge task: $($bridgeStart.Output). Run 'Repair Installed System' to rebuild it."
            }
            $bh = Wait-CBridgeHealthy 60
            if (-not $bh.ok) {
                throw "Print Bridge did not become healthy within 60 seconds ($($bh.detail)). Diagnostics collected in $script:CommonLog"
            }
            'Print Bridge is healthy.' | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8
        } else {
            $bh = Wait-CBridgeHealthy 20
            if ($bh.ok) {
                'Bridge already running (manual start); operator must restart it to load the updated files.' | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8
                Write-Host 'Bridge files updated. A manually-started bridge is still running the OLD code — restart it to load the fix.' -ForegroundColor Yellow
            } else {
                'Bridge not running and no scheduled task exists; files updated, operator must start the bridge manually.' | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8
                Write-Host 'WARNING: bridge files updated but no bridge is running and no scheduled task exists — start the bridge manually.' -ForegroundColor Yellow
            }
        }
    }

    @{ version='latest-cumulative-fix'; role=$machineRole; appliedAt=(Get-Date).ToString('o'); rollback=$rollback } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $InstallDir 'hotfix-state.json') -Encoding UTF8
    "SUCCESS $machineRole $(Get-Date -Format o)" | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8
    if ($isServer) {
        Write-Host "`nSUCCESS: latest fixes applied (server). Open the app once, then press Ctrl+F5 inside it." -ForegroundColor Green
    } else {
        Write-Host "`nSUCCESS: print bridge fix applied (cashier). Receipts use the server's updated templates after one Ctrl+F5 in the cashier browser." -ForegroundColor Green
    }
    exit 0
} catch {
    $message = $_.Exception.Message
    "FAILED $machineRole $(Get-Date -Format o) $message" | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8
    Write-Host "`nFAILED: $message" -ForegroundColor Red
    Write-Host 'Restoring previous application files automatically...' -ForegroundColor Yellow
    if ($isServer) {
        if (Test-Path -LiteralPath (Join-Path $rollback 'index.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'index.cjs') -Destination $currentServer -Force }
        if (Test-Path -LiteralPath (Join-Path $rollback 'node_modules')) {
            Remove-Item -LiteralPath $currentServerModules -Recurse -Force -ErrorAction SilentlyContinue
            Copy-Item -LiteralPath (Join-Path $rollback 'node_modules') -Destination $currentServerModules -Recurse -Force
        } elseif ($script:modulesInstalled) {
            # Modules were newly added by this (failed) apply: remove them to
            # restore the exact pre-apply state.
            Remove-Item -LiteralPath $currentServerModules -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path -LiteralPath (Join-Path $rollback 'dist')) {
            Remove-Item -LiteralPath $currentFrontend -Recurse -Force -ErrorAction SilentlyContinue
            Copy-Item -LiteralPath (Join-Path $rollback 'dist') -Destination $currentFrontend -Recurse -Force
        }
        if (Test-Path -LiteralPath (Join-Path $rollback 'bridge-package.json')) { Copy-Item -LiteralPath (Join-Path $rollback 'bridge-package.json') -Destination $currentBridgePkg -Force }
        if (Test-Path -LiteralPath (Join-Path $rollback 'schema-doctor.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'schema-doctor.cjs') -Destination $currentSchemaDoctor -Force }
        if (Test-Path -LiteralPath (Join-Path $rollback 'watchdog.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'watchdog.cjs') -Destination $currentWatchdog -Force }
        if (Test-Path -LiteralPath (Join-Path $rollback 'supervisor.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'supervisor.cjs') -Destination $currentSupervisor -Force }
        if (Test-Path -LiteralPath (Join-Path $rollback 'monitor.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'monitor.cjs') -Destination $currentMonitor -Force }
        if (Test-Path -LiteralPath (Join-Path $rollback 'port-guard.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'port-guard.cjs') -Destination $currentPortGuard -Force }
        if (Test-Path -LiteralPath (Join-Path $rollback 'schema.ts')) { Copy-Item -LiteralPath (Join-Path $rollback 'schema.ts') -Destination $currentSchema -Force }
        if (Test-Path -LiteralPath (Join-Path $rollback 'recovery-index.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'recovery-index.cjs') -Destination $recoveryServer -Force }
        if (Test-Path -LiteralPath (Join-Path $rollback 'recovery-index.html')) { Copy-Item -LiteralPath (Join-Path $rollback 'recovery-index.html') -Destination $recoveryFrontend -Force }
        if (Test-Path -LiteralPath (Join-Path $rollback 'recovery-bridge-index.js')) { Copy-Item -LiteralPath (Join-Path $rollback 'recovery-bridge-index.js') -Destination $recoveryBridge -Force }
        if (Test-Path -LiteralPath (Join-Path $rollback 'manifest.json')) { Copy-Item -LiteralPath (Join-Path $rollback 'manifest.json') -Destination $recoveryManifest -Force }
        if ($envBackupPath -and (Test-Path -LiteralPath $envBackupPath)) {
            Copy-Item -LiteralPath $envBackupPath -Destination $currentEnv -Force
            "Restored .env from $envBackupPath" | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8
        }
    }
    if (Test-Path -LiteralPath (Join-Path $rollback 'bridge-index.js')) { Copy-Item -LiteralPath (Join-Path $rollback 'bridge-index.js') -Destination $currentBridge -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'png-raster.js')) { Copy-Item -LiteralPath (Join-Path $rollback 'png-raster.js') -Destination $currentBridgeRaster -Force }
    if ($isServer) { Start-CSystemTasks $InstallDir | Out-Null } else { Invoke-CTask 'Run' 'Sameh Print Bridge' | Out-Null }
    Write-Host 'Rollback complete. Run "Repair Installed System" if the system still does not start.' -ForegroundColor Yellow
    exit 1
}
