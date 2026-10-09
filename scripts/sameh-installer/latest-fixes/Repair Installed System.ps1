# Repair Installed System — heals a stopped/dead RestoFlow install in place.
# No hotfix package needed. Diagnoses everything, fixes what it safely can,
# verifies health, and writes a full report + log.
#
# What it heals (each step backs up first, database data is NEVER touched):
#   1. Stale supervisor.pid / zombie node processes / blocked ports
#   2. Missing scheduled tasks (via setup-agent.cjs repair when available)
#   3. .env launch-gate failures (generates missing secrets, adopts the local
#      bridge token so printing stays paired — existing good values untouched)
#   4. Verifies the CURRENT server bundle actually boots (probe); if the
#      bundle itself is corrupt, restores the newest rollback copy
#   5. Restarts tasks and verifies API + bridge health
#
# Usage (run as Administrator):
#   Repair Installed System.bat
#   Repair Installed System.ps1 -InstallDir "D:\Path\To\Install" -Role server
#   Repair Installed System.ps1 -CheckOnly   (diagnose only, change nothing)

param([string]$InstallDir = '', [string]$Role = '', [switch]$CheckOnly)

. (Join-Path $PSScriptRoot 'Install-Common.ps1')
Assert-CAdmin

if (-not $InstallDir) { $InstallDir = Resolve-CInstallDir }
if (-not $InstallDir) { throw 'Installed folder not found. Re-run with -InstallDir "D:\Path\To\Install".' }
$InstallDir = [IO.Path]::GetFullPath($InstallDir).TrimEnd('\')
if (-not (Test-Path -LiteralPath $InstallDir)) { throw "Installed folder not found: $InstallDir" }

$machineRole = Resolve-CMachineRole $InstallDir $Role
$isServer = $machineRole -eq 'server'
$logDir = Join-Path $InstallDir 'logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$script:CommonLog = Join-Path $logDir "repair-$stamp.log"

"Repair run at $(Get-Date -Format o) role=$machineRole checkOnly=$CheckOnly" | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8
Write-Host '=================================================' -ForegroundColor Cyan
Write-Host "  RestoFlow Repair  (role: $machineRole$(if ($CheckOnly) { ', CHECK ONLY' }))"
Write-Host '=================================================' -ForegroundColor Cyan

$fixes = @()
$problems = @()
function Add-Fix([string]$m) { $script:fixes = @($script:fixes) + $m; Write-COk $m }
function Add-Problem([string]$m) { $script:problems = @($script:problems) + $m; Write-CErr $m }

try {
    # ── 0. Basics ──
    Write-CStep 'Basic environment'
    $node = Get-CNodeExe $InstallDir
    if (-not $node) { Add-Problem 'node.exe not found (neither runtime\node.exe nor PATH). Reinstall runtime.' }
    else { Write-COk "node: $node ($(Get-CNodeVersion $node))" }
    $disk = Test-CDiskSpace $InstallDir
    if (-not $disk.ok) { Add-Problem "disk critically low: $($disk.freeMB) MB free" }
    else { Write-COk "disk free: $($disk.freeMB) MB" }

    # ── 1. Processes & pid files ──
    Write-CStep 'Processes and stale pid files'
    $zombies = @(Get-CInstallNodeProcesses $InstallDir)
    if ($zombies.Count -gt 6) {
        Add-Problem "$($zombies.Count) node processes under install dir (possible zombie pile-up)"
        if (-not $CheckOnly) {
            Stop-CInstallProcesses $InstallDir
            Start-Sleep -Seconds 2
            $left = @(Get-CInstallNodeProcesses $InstallDir).Count
            Add-Fix "killed zombie node processes ($left remaining)"
        }
    } else {
        Write-COk "$($zombies.Count) node process(es) under install dir"
        foreach ($z in $zombies) { Write-CLog "  pid=$($z.Pid) $($z.CommandLine)" }
    }
    $pidNote = Clear-CStaleSupervisorPid $InstallDir
    if ($pidNote -like 'removed-stale-pid*') {
        if ($CheckOnly) { Add-Problem "stale supervisor.pid present ($pidNote)" }
        else { Add-Fix "removed stale supervisor.pid ($pidNote)" }
    } else {
        Write-COk "supervisor.pid: $pidNote"
    }
    # Duplicate supervisors/monitors wedge each other (two "supervisor ready"
    # lines seconds apart + restart storms). Keep the newest of each, kill rest.
    $dupes = @(Find-CDuplicateDaemons $InstallDir)
    if ($dupes.Count -gt 0) {
        foreach ($d in $dupes) { Write-CWarn "duplicate $($d.script): pid $($d.pid) started $($d.started)" }
        if ($CheckOnly) {
            Add-Problem "$($dupes.Count) duplicate supervisor/monitor process(es)"
        } else {
            $killed = @(Remove-CDuplicateDaemons $InstallDir)
            Add-Fix "killed $($killed.Count) duplicate daemon(s): $($killed -join ', ')"
        }
    } else {
        Write-COk 'no duplicate supervisors/monitors'
    }
    # A restart.request storm (kill seconds after every start) keeps port 3001
    # dark forever. When the server is verifiably DEAD, the file is stale by
    # definition — clear it so the fresh start below can warm up in peace.
    $restartFile = Join-Path $InstallDir 'runtime\restart.request'
    if ((Test-Path -LiteralPath $restartFile) -and (@(Get-CPortListeners 3001).Count -eq 0)) {
        if ($CheckOnly) { Add-Problem 'stale restart.request present while nothing listens on 3001' }
        else {
            Remove-Item -LiteralPath $restartFile -Force -ErrorAction SilentlyContinue
            Add-Fix 'cleared stale restart.request (server was dead; fresh start will warm up undisturbed)'
        }
    }

    # ── 2. Scheduled tasks ──
    Write-CStep 'Scheduled tasks'
    $missing = @()
    foreach ($name in @('Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge')) {
        $s = Get-CTaskState $name
        if (-not $s.exists) {
            if ($name -eq 'Sameh Print Bridge' -and -not (Test-Path -LiteralPath (Join-Path $InstallDir 'hardware-bridge\index.js'))) {
                Write-COk "$name not installed (no local bridge — expected)"
            } else {
                $missing += $name
                Write-CWarn "$name NOT INSTALLED"
            }
        } else {
            Write-COk "$name state=$($s.state) lastResult=$($s.lastResult)"
        }
    }
    if ($missing.Count -gt 0) {
        if ($CheckOnly) {
            Add-Problem "missing tasks: $($missing -join ', ')"
        } else {
            $agent = Join-Path $InstallDir 'runtime\setup-agent.cjs'
            if ((Test-Path -LiteralPath $agent) -and $node) {
                Write-CLog 'recreating tasks via setup-agent.cjs repair...'
                & $node $agent repair 2>&1 | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8
                $stillMissing = @($missing | Where-Object { -not (Get-ScheduledTask -TaskName $_ -ErrorAction SilentlyContinue) })
                if ($stillMissing.Count -eq 0) { Add-Fix "recreated missing tasks via setup-agent repair: $($missing -join ', ')" }
                else { Add-Problem "tasks still missing after repair: $($stillMissing -join ', ') — re-run the full installer" }
            } else {
                Add-Problem "missing tasks ($($missing -join ', ')) and no setup-agent to rebuild them — re-run the full installer"
            }
        }
    }

    # ── 3. .env launch gate (THE brick cause) ──
    if ($isServer) {
        Write-CStep '.env launch-gate audit'
        $envPath = Join-Path $InstallDir '.env'
        if (-not (Test-Path -LiteralPath $envPath)) {
            Add-Problem '.env MISSING — server cannot boot without DATABASE_URL/JWT_SECRET. Restore it from backup, then re-run repair.'
        } else {
            $gateNow = @(Test-CEnvLaunchGate (Read-CEnvFile $envPath).Map)
            if ($gateNow.Count -eq 0) {
                Write-COk '.env passes the production launch gate'
            } else {
                foreach ($g in $gateNow) { Write-CWarn "$($g.key): $($g.issue)" }
                if ($CheckOnly) {
                    Add-Problem "env blocks boot: $(($gateNow | ForEach-Object { $_.key }) -join ', ')"
                } else {
                    $bridgeEnv = Join-Path $InstallDir 'hardware-bridge\.env'
                    $actions = @(Repair-CServerEnv $envPath $bridgeEnv)
                    foreach ($a in $actions) { Write-CLog "  env: $a" }
                    Add-Fix "healed .env: $($actions -join '; ')"
                }
            }
        }
    }

    # ── 4. Current bundle boot probe ──
    if ($isServer -and $node) {
        Write-CStep 'Current server bundle boot probe'
        $bundle = Join-Path $InstallDir 'dist-server\index.cjs'
        if (-not (Test-Path -LiteralPath $bundle)) {
            Add-Problem 'dist-server\index.cjs MISSING — attempting rollback restore'
            if (-not $CheckOnly) {
                $restored = Restore-CNewestRollback $InstallDir
                if ($restored) { Add-Fix "restored server bundle from $restored" }
                else { Add-Problem 'no rollback copy available — reinstall or apply a hotfix package' }
            }
        } else {
            $probe = Test-CServerBundleBoot $node $bundle $InstallDir 39999 30
            Write-CLog "probe: $($probe.detail)"
            if ($probe.logTail) { Write-CLog "probe tail: $($probe.logTail)" }
            if ($probe.ok) {
                Write-COk "current bundle boots and listens ($($probe.detail))"
            } else {
                Add-Problem "current bundle FAILS to boot: $($probe.detail)"
                if ($probe.logTail) { Write-CWarn "probe log: $($probe.logTail)" }
                if (-not $CheckOnly) {
                    $restored = Restore-CNewestRollback $InstallDir
                    if ($restored) {
                        Add-Fix "restored server bundle from $restored — re-probing"
                        $probe2 = Test-CServerBundleBoot $node (Join-Path $InstallDir 'dist-server\index.cjs') $InstallDir 39999 30
                        if ($probe2.ok) { Add-Fix 'restored bundle boots cleanly' }
                        else { Add-Problem "restored bundle also fails: $($probe2.detail)" }
                    } else {
                        Add-Problem 'bundle is broken and no rollback copy exists — apply a hotfix package or reinstall'
                    }
                }
            }
        }
    }

    # ── 5. Restart + verify ──
    if (-not $CheckOnly) {
        Write-CStep 'Restarting tasks'
        $starts = @(Start-CSystemTasks $InstallDir)
        foreach ($r in $starts) { Write-CLog "Task $($r.Action) [$($r.Name)] exit=$($r.ExitCode) $($r.Output)" }
        $failed = @($starts | Where-Object { $_.ExitCode -ne 0 -and $_.Output -ne 'TASK_NOT_FOUND_SKIP' })
        if ($failed.Count -gt 0) { Add-Problem "tasks failed to start: $(($failed | ForEach-Object { $_.Name }) -join ', ')" }
        else { Add-Fix 'tasks (re)started' }
    }

    Write-CStep 'Health verification'
    if ($isServer) {
        $h = Wait-CServerHealthy 90
        if ($h.ok) { Add-Fix "API healthy ($($h.detail))" }
        else { Add-Problem "API not healthy: $($h.detail)" }
        $b = Wait-CBridgeHealthy 30
        if ($b.ok) { Write-COk 'print bridge healthy' }
        else { Write-CWarn "print bridge not healthy yet: $($b.detail) (keeps retrying in background)" }
    } else {
        $b = Wait-CBridgeHealthy 60
        if ($b.ok) { Add-Fix 'print bridge healthy' }
        else { Add-Problem "print bridge not healthy: $($b.detail)" }
    }

    # ── Report ──
    Write-Host ''
    Write-Host '================== REPAIR REPORT ==================' -ForegroundColor Cyan
    Write-Host "Role: $machineRole" -ForegroundColor White
    if ($script:fixes.Count -gt 0) {
        Write-Host '-- fixes applied --' -ForegroundColor Green
        $script:fixes | ForEach-Object { Write-Host "  + $_" -ForegroundColor Green }
    }
    if ($script:problems.Count -gt 0) {
        Write-Host '-- REMAINING PROBLEMS (need attention) --' -ForegroundColor Red
        $script:problems | ForEach-Object { Write-Host "  ! $_" -ForegroundColor Red }
    }
    if ($script:fixes.Count -eq 0 -and $script:problems.Count -eq 0) {
        Write-Host 'System already healthy — nothing to fix.' -ForegroundColor Green
    }
    Write-Host "Log: $script:CommonLog" -ForegroundColor White
    "REPORT fixes=$($script:fixes.Count) problems=$($script:problems.Count)" | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8
    foreach ($f in $script:fixes) { "FIX: $f" | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8 }
    foreach ($p in $script:problems) { "PROBLEM: $p" | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8 }
    if ($script:problems.Count -gt 0) { exit 1 }
    exit 0
} catch {
    $message = $_.Exception.Message
    Write-Host "`nREPAIR FAILED: $message" -ForegroundColor Red
    "REPAIR FAILED $message" | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8
    Write-Host 'Diagnostics snapshot:' -ForegroundColor Yellow
    $diag = Collect-CDiagnostics $InstallDir
    $diag | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8
    Write-Host $diag
    exit 1
}

# Lists duplicate supervisor.cjs / monitor.cjs processes (all but newest per
# script). Uses WMI start time when available, else PID order as fallback.
function Find-CDuplicateDaemons([string]$InstallDir) {
    $found = @()
    foreach ($script in @('supervisor.cjs', 'monitor.cjs')) {
        $group = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
            $_.Name -eq 'node.exe' -and "$($_.CommandLine)" -like "*$script*"
        } | ForEach-Object {
            $started = $null
            try { $started = [Management.ManagementDateTimeConverter]::ToDateTime($_.CreationDate) } catch { }
            [PSCustomObject]@{ pid = $_.ProcessId; script = $script; started = $started }
        } | Sort-Object @{ Expression = { if ($_.started) { $_.started } else { [datetime]::MinValue } } })
        if ($group.Count -gt 1) {
            $found += @($group | Select-Object -SkipLast 1)
        }
    }
    return $found
}

function Remove-CDuplicateDaemons([string]$InstallDir) {
    $killed = @()
    foreach ($d in @(Find-CDuplicateDaemons $InstallDir)) {
        Stop-Process -Id $d.pid -Force -ErrorAction SilentlyContinue
        $killed += "$($d.script)#$($d.pid)"
    }
    Start-Sleep -Seconds 2
    return $killed
}
