# Install-Common.ps1 — shared helper for RestoFlow install scripts.
# Dot-source from Apply Latest Fixes.ps1 / Repair Installed System.ps1:
#   . (Join-Path $PSScriptRoot 'Install-Common.ps1')
#
# Provides: logging, admin/dir/role resolution, task control, port helpers,
# .env launch-gate audit + self-healing (never overwrites good values),
# server-bundle boot probing (catches instant-crash bundles BEFORE they
# replace a working install), health waiters, and diagnostics collection.
#
# Conventions: PowerShell 5.1 compatible. No data files are modified except
# through the explicit Repair-* functions (which always back up first).
# GOTCHAS (learned the hard way — do not "simplify" these):
#  - `,` binds TIGHTER than `+`: @('A' + $x, 'B') concatenates everything
#    into ONE string. Always parenthesize: @(('A' + $x), 'B').
#  - Never `return ,$array` together with @() at the call site (nests arrays).
#    Plain `return $array` + @() collection is correct for 0/1/N items.
#  - UTF8NoBOM encoding name does not exist on PS 5.1; use explicit .NET UTF8.
#  - This file MUST stay UTF-8 with BOM or powershell.exe mangles non-ASCII.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# Set by the caller before/after dot-sourcing. All writers tolerate $null.
$script:CommonLog = $null

function Write-CLog([string]$Message) {
    if ($script:CommonLog) {
        try { $Message | Add-Content -LiteralPath $script:CommonLog -Encoding UTF8 } catch { }
    }
}

function Write-CStep([string]$Message) {
    Write-Host "`n>> $Message" -ForegroundColor Cyan
    Write-CLog ">> $Message"
}

function Write-COk([string]$Message) {
    Write-Host "   [OK] $Message" -ForegroundColor Green
    Write-CLog "[OK] $Message"
}

function Write-CWarn([string]$Message) {
    Write-Host "   [WARN] $Message" -ForegroundColor Yellow
    Write-CLog "[WARN] $Message"
}

function Write-CErr([string]$Message) {
    Write-Host "   [FAIL] $Message" -ForegroundColor Red
    Write-CLog "[FAIL] $Message"
}

function Assert-CAdmin {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) { throw 'Run this script as Administrator (right-click -> Run as administrator).' }
}

function Resolve-CInstallDir([string]$Hint = '') {
    if ($Hint -and (Test-Path -LiteralPath $Hint)) { return [IO.Path]::GetFullPath($Hint).TrimEnd('\') }
    foreach ($key in @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{5C76AE62-E6AC-4CCF-A431-5A4E48494E53}_is1',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{5C76AE62-E6AC-4CCF-A431-5A4E48494E53}_is1'
    )) {
        $candidate = (Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue).InstallLocation
        if ($candidate -and ((Test-Path -LiteralPath (Join-Path $candidate 'dist')) -or (Test-Path -LiteralPath (Join-Path $candidate 'hardware-bridge\index.js')))) {
            return [IO.Path]::GetFullPath($candidate).TrimEnd('\')
        }
    }
    foreach ($candidate in @((Join-Path $env:ProgramFiles 'Sameh\RestoFlow ERP'), 'C:\Program Files\Sameh\RestoFlow ERP')) {
        if ((Test-Path -LiteralPath (Join-Path $candidate 'dist')) -or (Test-Path -LiteralPath (Join-Path $candidate 'hardware-bridge\index.js'))) {
            return [IO.Path]::GetFullPath($candidate).TrimEnd('\')
        }
    }
    return ''
}

function Resolve-CMachineRole([string]$InstallDir, [string]$Wanted = '') {
    $w = ([string]$Wanted).Trim().ToLowerInvariant()
    if ($w -in @('server', 'cashier')) { return $w }
    if ($w -ne '') { throw "Invalid role '$Wanted'. Allowed values: server, cashier." }
    # Filesystem ground truth first: a machine carrying the server bundle IS a
    # server, even if a stale install-state.json claims otherwise.
    if (Test-Path -LiteralPath (Join-Path $InstallDir 'dist-server\index.cjs')) { return 'server' }
    $stateFile = Join-Path $InstallDir 'install-state.json'
    if (Test-Path -LiteralPath $stateFile) {
        try {
            $recorded = ([string](Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json).role).Trim().ToLowerInvariant()
            if ($recorded -in @('server', 'cashier')) { return $recorded }
        } catch { }
    }
    if (Test-Path -LiteralPath (Join-Path $InstallDir 'hardware-bridge\index.js')) { return 'cashier' }
    throw "Cannot determine machine role (no dist-server, no install-state.json, no bridge under $InstallDir). Re-run with -Role server|cashier."
}

function Get-CNodeExe([string]$InstallDir) {
    $node = Join-Path $InstallDir 'runtime\node.exe'
    if (Test-Path -LiteralPath $node) { return $node }
    try {
        $found = (Get-Command node.exe -ErrorAction Stop).Source
        if ($found) { return $found }
    } catch { }
    return ''
}

function Get-CNodeVersion([string]$NodeExe) {
    try {
        $v = & $NodeExe --version 2>&1
        return ([string]$v).Trim()
    } catch { return '' }
}

function Test-CDiskSpace([string]$InstallDir, [long]$NeedMB = 1500) {
    try {
        $root = [IO.Path]::GetPathRoot([IO.Path]::GetFullPath($InstallDir))
        $drive = Get-PSDrive -Name $root.TrimEnd(':\') -ErrorAction Stop
        $freeMB = [long]($drive.Free / 1MB)
        return @{ ok = ($freeMB -ge $NeedMB); freeMB = $freeMB; needMB = $NeedMB }
    } catch { return @{ ok = $true; freeMB = -1; needMB = $NeedMB } }
}

# ── Scheduled tasks ──

function Invoke-CTask([string]$Action, [string]$Name) {
    try {
        $out = & schtasks.exe "/$Action" /TN "$Name" 2>&1
        return @{ Name = $Name; Action = $Action; ExitCode = $LASTEXITCODE; Output = ([string]$out).Trim() }
    } catch {
        return @{ Name = $Name; Action = $Action; ExitCode = -2; Output = "SCHTASKS_ERROR: $($_.Exception.Message)" }
    }
}

function Get-CTaskState([string]$Name) {
    $task = Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
    if (-not $task) { return @{ exists = $false } }
    $info = Get-ScheduledTaskInfo -TaskName $Name -ErrorAction SilentlyContinue
    return @{ exists = $true; state = [string]$task.State; lastRun = [string]$info.LastRunTime; lastResult = [string]$info.LastTaskResult; nextRun = [string]$info.NextRunTime }
}

function Stop-CInstallProcesses([string]$InstallDir) {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.IndexOf($InstallDir, [StringComparison]::OrdinalIgnoreCase) -ge 0
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
}

function Clear-CStaleSupervisorPid([string]$InstallDir) {
    $supPidFile = Join-Path $InstallDir 'runtime\supervisor.pid'
    if (-not (Test-Path -LiteralPath $supPidFile)) { return 'no-pid-file' }
    $oldPid = 0
    [void][int]::TryParse((Get-Content -LiteralPath $supPidFile -Raw -ErrorAction SilentlyContinue).Trim(), [ref]$oldPid)
    $isOurs = $false
    if ($oldPid -gt 0) {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$oldPid" -ErrorAction SilentlyContinue
        if ($proc -and $proc.Name -eq 'node.exe' -and "$($proc.CommandLine)" -like '*supervisor.cjs*') { $isOurs = $true }
    }
    if ($isOurs) {
        Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Remove-Item -LiteralPath $supPidFile -Force -ErrorAction SilentlyContinue
        return 'stopped-live-supervisor'
    }
    Remove-Item -LiteralPath $supPidFile -Force -ErrorAction SilentlyContinue
    return "removed-stale-pid ($oldPid)"
}

function Start-CSystemTasks([string]$InstallDir) {
    $pidNote = Clear-CStaleSupervisorPid $InstallDir
    Write-CLog "supervisor.pid reconcile: $pidNote"
    $results = @()
    foreach ($name in @('Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge')) {
        $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
        if (-not $task) {
            $results += @{ Name = $name; Action = 'Run'; ExitCode = -1; Output = 'TASK_NOT_FOUND_SKIP' }
            continue
        }
        try {
            $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
            Set-ScheduledTask -TaskName $name -Settings $settings | Out-Null
        } catch { }
        $results += Invoke-CTask 'Run' $name
    }
    return $results
}

# ── Ports & processes ──

function Get-CPortListeners([int]$Port) {
    try {
        return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
            $proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
            [PSCustomObject]@{ Port = $Port; Pid = $_.OwningProcess; Process = if ($proc) { $proc.ProcessName } else { '?' }
                CommandLine = try { (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)" -ErrorAction SilentlyContinue).CommandLine } catch { '' } }
        })
    } catch { return @() }
}

function Wait-CPort([int]$Port, [int]$Seconds = 30) {
    for ($i = 0; $i -lt $Seconds; $i++) {
        if (@(Get-CPortListeners $Port).Count -gt 0) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Get-CInstallNodeProcesses([string]$InstallDir) {
    return @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.IndexOf($InstallDir, [StringComparison]::OrdinalIgnoreCase) -ge 0
    } | ForEach-Object { [PSCustomObject]@{ Pid = $_.ProcessId; CommandLine = $_.CommandLine } })
}

# ── .env handling (comment-preserving) ──

function Read-CEnvFile([string]$Path) {
    $lines = @()
    $map = @{}
    if (-not (Test-Path -LiteralPath $Path)) { return @{ Lines = $lines; Map = $map; Exists = $false } }
    foreach ($raw in (Get-Content -LiteralPath $Path -Encoding UTF8)) {
        $entry = @{ kind = 'raw'; text = $raw; key = ''; value = '' }
        $trimmed = $raw.Trim()
        if ($trimmed -eq '') { $entry.kind = 'blank' }
        elseif ($trimmed.StartsWith('#')) { $entry.kind = 'comment' }
        elseif ($raw -match '^(?<k>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?<v>.*)$') {
            $entry.kind = 'kv'
            $entry.key = $Matches['k']
            $entry.value = $Matches['v']
            $map[$entry.key] = $entry.value
        }
        $lines += $entry
    }
    return @{ Lines = $lines; Map = $map; Exists = $true }
}

function Set-CEnvValue($Parsed, [string]$Key, [string]$Value) {
    $done = $false
    foreach ($entry in $Parsed.Lines) {
        if ($entry.kind -eq 'kv' -and $entry.key -ceq $Key) {
            $entry.value = $Value
            $entry.text = "$Key=$Value"
            $done = $true
        }
    }
    if (-not $done) {
        $Parsed.Lines += @{ kind = 'kv'; text = "$Key=$Value"; key = $Key; value = $Value }
    }
    $Parsed.Map[$Key] = $Value
}

function Write-CEnvFile([string]$Path, $Parsed) {
    $out = foreach ($entry in $Parsed.Lines) { $entry.text }
    [IO.File]::WriteAllLines($Path, [string[]]$out, [Text.UTF8Encoding]::new($false))
}

function New-CHexSecret([int]$Bytes = 32) {
    $b = New-Object byte[] $Bytes
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    return -join ($b | ForEach-Object { $_.ToString('x2') })
}

function New-CBase64UrlSecret([int]$Bytes = 48) {
    $b = New-Object byte[] $Bytes
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    return ([Convert]::ToBase64String($b)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

# Mirrors the production launch gate in server/index.ts + scripts/validate-env.
# Returns an array of @{key; ok; issue} — ok=$true means "good, never touch".
function Test-CEnvLaunchGate([hashtable]$Map) {
    $issues = @()
    $get = { param($k) ([string]$Map[$k]).Trim() }
    if (-not (& $get 'DATABASE_URL')) { $issues += @{ key = 'DATABASE_URL'; ok = $false; issue = 'missing (server cannot reach SQL Server)' } }
    $jwt = & $get 'JWT_SECRET'
    if (-not $jwt) { $issues += @{ key = 'JWT_SECRET'; ok = $false; issue = 'missing' } }
    elseif ($jwt.Length -lt 32 -or $jwt -eq 'change-me') { $issues += @{ key = 'JWT_SECRET'; ok = $false; issue = 'too short / default (needs 32+ chars)' } }
    $audit = & $get 'AUDIT_HMAC_SECRET'
    if (-not $audit) { $issues += @{ key = 'AUDIT_HMAC_SECRET'; ok = $false; issue = 'missing' } }
    elseif ($audit -eq 'change-me' -or $audit.Length -lt 16) { $issues += @{ key = 'AUDIT_HMAC_SECRET'; ok = $false; issue = 'default or too short (needs 16+ chars)' } }
    $cors = & $get 'CORS_ORIGINS'
    if (-not $cors -or $cors -eq '*') { $issues += @{ key = 'CORS_ORIGINS'; ok = $false; issue = 'missing or wildcard (production gate rejects it)' } }
    $screen = & $get 'PUBLIC_SCREEN_TOKEN'
    if (-not $screen -or $screen.Length -lt 32) { $issues += @{ key = 'PUBLIC_SCREEN_TOKEN'; ok = $false; issue = 'missing or short (production gate needs 32+ chars) — server exits instantly without it' } }
    $gw = & $get 'PRINT_GATEWAY_TOKEN'
    if (-not $gw -or $gw.Length -lt 32) { $issues += @{ key = 'PRINT_GATEWAY_TOKEN'; ok = $false; issue = 'missing or short (production gate needs 32+ chars) — server exits instantly without it' } }
    # Keep this installer gate aligned with scripts/validate-env.ts. Existing
    # installations may have an older .env that predates these secrets.
    foreach ($key in @('PIN_LOOKUP_SECRET', 'TRACK_TOKEN_SECRET', 'PUBLIC_QR_SECRET', 'PAYMENT_TOKEN_SECRET')) {
        $value = & $get $key
        if (-not $value -or $value.Length -lt 32) {
            $issues += @{ key = $key; ok = $false; issue = 'missing or short (production gate needs 32+ chars)' }
        }
    }
    $master = & $get 'CODUIS_MASTER_KEY'
    if (-not $master) { $master = & $get 'DEALER_SETUP_KEY' }
    if (-not $master -or $master.Length -lt 32) {
        $issues += @{ key = 'CODUIS_MASTER_KEY'; ok = $false; issue = 'missing or short (production setup key needs 32+ chars)' }
    }
    foreach ($key in @('ADMS_WEBHOOK_SECRET', 'ATTENDANCE_BRIDGE_TOKEN')) {
        $value = & $get $key
        if (-not $value -or $value.Length -lt 32) {
            $issues += @{ key = $key; ok = $false; issue = 'missing or short (production gate needs 32+ chars)' }
        }
    }
    return $issues
}

function Backup-CFile([string]$Path, [string]$BackupDir, [string]$Label) {
    if (-not (Test-Path -LiteralPath $Path)) { return '' }
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $dest = Join-Path $BackupDir "$Label.bak-$stamp"
    Copy-Item -LiteralPath $Path -Destination $dest -Force
    # Prune: keep the 5 newest backups of this label.
    Get-ChildItem -LiteralPath $BackupDir -Filter "$Label.bak-*" -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | Select-Object -Skip 5 |
        Remove-Item -Force -ErrorAction SilentlyContinue
    return $dest
}

# Self-heals a server .env so the production launch gate passes.
# NEVER overwrites a value that already passes. Backs up first.
# Bridge token rule: prefer the value the local bridge already uses
# (adopt it) so printing keeps working; generate only when nobody has one.
# Returns array of human-readable actions taken.
function Repair-CServerEnv([string]$EnvPath, [string]$BridgeEnvPath = '') {
    $actions = @()
    $parsed = Read-CEnvFile $EnvPath
    if (-not $parsed.Exists) { throw ".env not found: $EnvPath" }
    $issues = @(Test-CEnvLaunchGate $parsed.Map)
    if ($issues.Count -eq 0) { return @('env already passes the launch gate; nothing changed') }

    $backupDir = Join-Path (Split-Path -Parent $EnvPath) 'updates\env-backups'
    $bak = Backup-CFile $EnvPath $backupDir '.env'
    if ($bak) { $actions += "backed up .env" }

    $need = @{}
    foreach ($i in $issues) { $need[$i.key] = $true }

    # Bridge token adoption FIRST (printing must keep working).
    $bridgeTok = ''
    if ($BridgeEnvPath -and (Test-Path -LiteralPath $BridgeEnvPath)) {
        $bridgeTok = ([string](Read-CEnvFile $BridgeEnvPath).Map['GATEWAY_TOKEN']).Trim()
    }
    if ($need.ContainsKey('PRINT_GATEWAY_TOKEN')) {
        if ($bridgeTok -and $bridgeTok.Length -ge 32) {
            Set-CEnvValue $parsed 'PRINT_GATEWAY_TOKEN' $bridgeTok
            $actions += 'PRINT_GATEWAY_TOKEN adopted from the local bridge .env (printing stays paired)'
        } else {
            $fresh = New-CHexSecret 32
            Set-CEnvValue $parsed 'PRINT_GATEWAY_TOKEN' $fresh
            $actions += 'PRINT_GATEWAY_TOKEN generated (64 hex chars)'
            if ($bridgeTok) { $actions += 'WARNING: local bridge token is short — re-pair the bridge token after install (see README)' }
        }
    }
    if ($need.ContainsKey('JWT_SECRET')) {
        Set-CEnvValue $parsed 'JWT_SECRET' (New-CBase64UrlSecret 48)
        $actions += 'JWT_SECRET generated (all sessions will sign in again)'
    }
    if ($need.ContainsKey('AUDIT_HMAC_SECRET')) {
        Set-CEnvValue $parsed 'AUDIT_HMAC_SECRET' (New-CBase64UrlSecret 32)
        $actions += 'AUDIT_HMAC_SECRET generated'
    }
    if ($need.ContainsKey('PUBLIC_SCREEN_TOKEN')) {
        Set-CEnvValue $parsed 'PUBLIC_SCREEN_TOKEN' (New-CHexSecret 32)
        $actions += 'PUBLIC_SCREEN_TOKEN generated (KDS screens may need the new link)'
    }
    foreach ($key in @('PIN_LOOKUP_SECRET', 'TRACK_TOKEN_SECRET', 'PUBLIC_QR_SECRET', 'PAYMENT_TOKEN_SECRET')) {
        if ($need.ContainsKey($key)) {
            Set-CEnvValue $parsed $key (New-CBase64UrlSecret 48)
            $actions += "$key generated"
        }
    }
    if ($need.ContainsKey('CODUIS_MASTER_KEY')) {
        $dealerKey = ([string]$parsed.Map['DEALER_SETUP_KEY']).Trim()
        if ($dealerKey -and $dealerKey.Length -ge 32) {
            Set-CEnvValue $parsed 'CODUIS_MASTER_KEY' $dealerKey
            $actions += 'CODUIS_MASTER_KEY adopted from existing DEALER_SETUP_KEY'
        } else {
            Set-CEnvValue $parsed 'CODUIS_MASTER_KEY' (New-CBase64UrlSecret 48)
            $actions += 'CODUIS_MASTER_KEY generated'
        }
    }
    foreach ($key in @('ADMS_WEBHOOK_SECRET', 'ATTENDANCE_BRIDGE_TOKEN')) {
        if ($need.ContainsKey($key)) {
            Set-CEnvValue $parsed $key (New-CBase64UrlSecret 48)
            $actions += "$key generated"
        }
    }
    if ($need.ContainsKey('CORS_ORIGINS')) {
        $configuredPort = 3001
        $candidatePort = 0
        if ([int]::TryParse(([string]$parsed.Map['API_PORT']).Trim(), [ref]$candidatePort) -and $candidatePort -ge 1 -and $candidatePort -le 65535) { $configuredPort = $candidatePort }
        Set-CEnvValue $parsed 'CORS_ORIGINS' "http://localhost:$configuredPort,http://127.0.0.1:$configuredPort"
        $actions += "CORS_ORIGINS set to local API port $configuredPort (was missing/wildcard)"
    }
    Write-CEnvFile $EnvPath $parsed
    $stillBad = @(Test-CEnvLaunchGate (Read-CEnvFile $EnvPath).Map)
    if ($stillBad.Count -gt 0) { throw "env heal incomplete: $(($stillBad | ForEach-Object { "$($_.key): $($_.issue)" }) -join '; ')" }
    return $actions
}

# Boot-probes a server bundle WITHOUT touching the live install: starts it on
# a test port with the real .env, waits, and reports whether it survives.
# Catches instant-crash bundles (missing modules, launch-gate failures)
# BEFORE they replace a working server. Returns @{ok; detail; logTail}.
function Test-CServerBundleBoot([string]$NodeExe, [string]$BundlePath, [string]$WorkDir, [int]$TestPort = 39999, [int]$TimeoutSec = 30) {
    if (-not (Test-Path -LiteralPath $NodeExe)) { return @{ ok = $false; detail = "node not found: $NodeExe"; logTail = '' } }
    if (-not (Test-Path -LiteralPath $BundlePath)) { return @{ ok = $false; detail = "bundle not found: $BundlePath"; logTail = '' } }
    $probeOut = Join-Path ([IO.Path]::GetTempPath()) "rf-probe-$TestPort-out.log"
    $probeErr = Join-Path ([IO.Path]::GetTempPath()) "rf-probe-$TestPort-err.log"
    Remove-Item -LiteralPath $probeOut, $probeErr -Force -ErrorAction SilentlyContinue
    $readyFile = Join-Path $WorkDir 'runtime\server-ready.json'
    $readyBefore = ''
    if (Test-Path -LiteralPath $readyFile) { $readyBefore = (Get-Content -LiteralPath $readyFile -Raw -ErrorAction SilentlyContinue) }
    $proc = $null
    # NOTE: Start-Process has NO -Environment parameter on Windows PowerShell
    # 5.1 — set the override in our own env and restore it afterwards.
    $savedApiPort = $env:API_PORT
    try {
        $env:API_PORT = "$TestPort"
        $proc = Start-Process -FilePath $NodeExe -ArgumentList "`"$BundlePath`"" -WorkingDirectory $WorkDir `
            -RedirectStandardOutput $probeOut -RedirectStandardError $probeErr `
            -WindowStyle Hidden -PassThru
    } finally {
        if ($null -eq $savedApiPort) { Remove-Item Env:\API_PORT -ErrorAction SilentlyContinue }
        else { $env:API_PORT = $savedApiPort }
    }
    if (-not $proc) { return @{ ok = $false; detail = 'could not start probe process'; logTail = '' } }
    $crashedAt = 0
    $listening = $false
    for ($i = 0; $i -lt $TimeoutSec; $i++) {
        Start-Sleep -Seconds 1
        try {
            $p = Get-Process -Id $proc.Id -ErrorAction Stop
            if ($p.HasExited) { $crashedAt = $i + 1; break }
        } catch { $crashedAt = $i + 1; break }
        if (@(Get-CPortListeners $TestPort).Count -gt 0) {
            $listening = $true
            Start-Sleep -Seconds 4
            try { if ((Get-Process -Id $proc.Id -ErrorAction Stop).HasExited) { $crashedAt = $i + 5 } } catch { $crashedAt = $i + 5 }
            break
        }
    }
    try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch { }
    $tail = ''
    if (Test-Path -LiteralPath $probeErr) { $tail = ((Get-Content -LiteralPath $probeErr -Raw -ErrorAction SilentlyContinue) | Out-String); if ($tail.Length -gt 3000) { $tail = $tail.Substring($tail.Length - 3000) } }
    if (-not $tail -and (Test-Path -LiteralPath $probeOut)) { $tail = ((Get-Content -LiteralPath $probeOut -Raw -ErrorAction SilentlyContinue) | Out-String); if ($tail.Length -gt 3000) { $tail = $tail.Substring($tail.Length - 3000) } }
    try {
        if (Test-Path -LiteralPath $readyFile) {
            $now = Get-Content -LiteralPath $readyFile -Raw -ErrorAction SilentlyContinue
            if ($now -and $now -ne $readyBefore -and $now -like "*$($proc.Id)*") {
                Remove-Item -LiteralPath $readyFile -Force -ErrorAction SilentlyContinue
            }
        }
    } catch { }
    Remove-Item -LiteralPath $probeOut, $probeErr -Force -ErrorAction SilentlyContinue
    $detail = ''
    if ($crashedAt -gt 0) { $detail = "bundle exited after ~${crashedAt}s." }
    elseif (-not $listening) { $detail = "bundle stayed alive but port $TestPort never listened within ${TimeoutSec}s." }
    else { $detail = "bundle survived and listened on $TestPort." }
    return @{ ok = ($listening -and $crashedAt -eq 0); detail = $detail; logTail = $tail }
}

function Get-CConfiguredPort([string]$EnvPath = '') {
    $port = 3001
    if ($EnvPath -and (Test-Path -LiteralPath $EnvPath)) {
        $parsed = Read-CEnvFile $EnvPath
        $candidate = 0
        if ([int]::TryParse(([string]$parsed.Map['API_PORT']).Trim(), [ref]$candidate) -and $candidate -ge 1 -and $candidate -le 65535) {
            $port = $candidate
        }
    }
    return $port
}

function Wait-CServerHealthy([int]$Seconds = 90, [int]$Port = 3001) {
    $last = 'no attempt yet'
    for ($attempt = 0; $attempt -lt $Seconds; $attempt += 2) {
        Start-Sleep -Seconds 2
        try {
            $health = Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 3
            $dbStatus = $health.health.services.database.status
            if ($dbStatus -eq 'CONNECTED') { return @{ ok = $true; detail = 'database CONNECTED' } }
            $last = "HTTP ok but database.status='$dbStatus'"
        } catch {
            $last = $_.Exception.Message
        }
    }
    return @{ ok = $false; detail = $last }
}

function Wait-CBridgeHealthy([int]$Seconds = 60, [int]$ServerPort = 3001) {
    for ($attempt = 0; $attempt -lt $Seconds; $attempt += 2) {
        try {
            $r = Invoke-WebRequest 'http://127.0.0.1:3002/health' -Headers @{ Origin = "http://localhost:$ServerPort" } -UseBasicParsing -TimeoutSec 3
            if ($r.StatusCode -eq 200) { return @{ ok = $true; detail = 'bridge ok' } }
        } catch { }
        Start-Sleep -Seconds 2
    }
    return @{ ok = $false; detail = 'bridge /health never returned 200' }
}

function Get-CLogTail([string]$Path, [int]$Lines = 25) {
    if (-not (Test-Path -LiteralPath $Path)) { return @("(missing: $Path)") }
    try { return @(Get-Content -LiteralPath $Path -Tail $Lines -ErrorAction Stop) }
    catch { return @("(unreadable: $Path)") }
}

# Restores dist-server\index.cjs (+ frontend dist tree) from the newest
# updates\rollback-* copy. Returns the source rollback path or ''.
function Restore-CNewestRollback([string]$InstallDir) {
    $updates = Join-Path $InstallDir 'updates'
    if (-not (Test-Path -LiteralPath $updates)) { return '' }
    $candidate = Get-ChildItem -LiteralPath $updates -Directory -Filter 'rollback-*' -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | ForEach-Object {
            $idx = Join-Path $_.FullName 'index.cjs'
            if (Test-Path -LiteralPath $idx) { return $_.FullName }
        } | Select-Object -First 1
    if (-not $candidate) { return '' }
    $serverDir = Join-Path $InstallDir 'dist-server'
    New-Item -ItemType Directory -Path $serverDir -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $candidate 'index.cjs') -Destination (Join-Path $serverDir 'index.cjs') -Force
    if (Test-Path -LiteralPath (Join-Path $candidate 'dist')) {
        $front = Join-Path $InstallDir 'dist'
        Remove-Item -LiteralPath $front -Recurse -Force -ErrorAction SilentlyContinue
        Copy-Item -LiteralPath (Join-Path $candidate 'dist') -Destination $front -Recurse -Force
    }
    return $candidate
}

# Full snapshot for failure reports: tasks, processes, ports, disk, node,
# env gate (values REDACTED), and log tails. Safe to paste to support.
function Collect-CDiagnostics([string]$InstallDir) {
    $lines = @()
    $lines += '===== tasks ====='
    foreach ($name in @('Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge')) {
        $s = Get-CTaskState $name
        if ($s.exists) { $lines += "$name : state=$($s.state) lastResult=$($s.lastResult) lastRun=$($s.lastRun)" }
        else { $lines += "$name : NOT INSTALLED" }
    }
    $lines += '===== node processes under install dir ====='
    $procs = Get-CInstallNodeProcesses $InstallDir
    if ($procs.Count -eq 0) { $lines += '(none)' }
    foreach ($p in $procs) { $lines += "pid=$($p.Pid) cmd=$($p.CommandLine)" }
    $lines += '===== ports ====='
    foreach ($port in @(3001, 3002, 3099)) {
        $ls = @(Get-CPortListeners $port)
        if ($ls.Count -eq 0) { $lines += "port $port : nothing listening" }
        foreach ($l in $ls) { $lines += "port $port : pid=$($l.Pid) proc=$($l.Process)" }
    }
    $node = Get-CNodeExe $InstallDir
    $lines += "node: $node ($(Get-CNodeVersion $node))"
    $disk = Test-CDiskSpace $InstallDir
    $lines += "disk free: $($disk.freeMB) MB (need $($disk.needMB))"
    $lines += '===== .env launch gate (values hidden) ====='
    $envPath = Join-Path $InstallDir '.env'
    if (Test-Path -LiteralPath $envPath) {
        foreach ($i in (Test-CEnvLaunchGate (Read-CEnvFile $envPath).Map)) {
            $lines += "$($i.key): $(if ($i.ok) { 'OK' } else { "BROKEN: $($i.issue)" })"
        }
    } else { $lines += '.env MISSING' }
    $logDir = Join-Path $InstallDir 'logs'
    foreach ($n in @('server.log', 'supervisor.log', 'monitor.log')) {
        $lines += "===== tail $n ====="
        $lines += Get-CLogTail (Join-Path $logDir $n) 25
    }
    return ($lines -join "`r`n")
}

function Test-CManifestFile([string]$ManifestPath, [string]$PayloadDir) {
    if (-not (Test-Path -LiteralPath $ManifestPath)) { return @{ ok = $false; detail = 'manifest.json missing in payload (old package?)'; checked = 0 } }
    try { $manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json }
    catch { return @{ ok = $false; detail = 'manifest.json is not valid JSON'; checked = 0 } }
    $checked = 0
    foreach ($entry in @($manifest.files)) {
        $target = [string]$entry.path
        if (-not $target) { continue }
        $full = Join-Path $PayloadDir $target
        if (-not (Test-Path -LiteralPath $full)) { return @{ ok = $false; detail = "payload file missing: $target"; checked = $checked } }
        $actual = (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne [string]$entry.sha256) { return @{ ok = $false; detail = "payload file corrupted (hash mismatch): $target"; checked = $checked } }
        $checked++
    }
    return @{ ok = $true; detail = "verified $checked files (package v$([string]$manifest.version), built $([string]$manifest.builtAt))"; checked = $checked }
}
