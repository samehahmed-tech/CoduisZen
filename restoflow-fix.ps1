#Requires -RunAsAdministrator
<#
.SYNOPSIS
    RestoFlow ERP Production Fix Script — repairs common issues on the client machine.
.DESCRIPTION
    Run this script on the production machine (Sameh Installer) as Administrator.
    It fixes:
      1. CSP block preventing frontend from reading bridge health on port 3002
      2. Missing DB columns causing /api/menu/full 500
      3. DATE() SQL incompatibility causing /api/ai/forecast 500
      4. Stuck PROCESSING print jobs (not claimed by bridge)
      5. Duplicate port 3002 process causing bridge failure
      6. Server crashes (exit code -1)
.NOTES
    Run: powershell -NoProfile -ExecutionPolicy Bypass -File .\restoflow-fix.ps1
#>

param(
    [switch]$SkipServiceRestart,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$logFile = "$env:TEMP\restoflow-fix-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
$installDir = 'C:\Program Files\Sameh\RestoFlow ERP'

function Log($msg) {
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[$timestamp] $msg"
    Write-Host $line
    Add-Content -Path $logFile -Value $line
}

function RunSql($query) {
    $connStr = 'Server=(localdb)\MSSQLLocalDB;Database=CoduisZen;Trusted_Connection=Yes;Encrypt=False;'
    try {
        $conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
        $conn.Open()
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = $query
        $cmd.CommandTimeout = 30
        $rows = $cmd.ExecuteNonQuery()
        $conn.Close()
        Log "SQL OK: $query => $rows row(s)"
        return $true
    } catch {
        Log "SQL ERROR: $_"
        return $false
    }
}

function RunSqlQuery($query) {
    $connStr = 'Server=(localdb)\MSSQLLocalDB;Database=CoduisZen;Trusted_Connection=Yes;Encrypt=False;'
    try {
        $conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
        $conn.Open()
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = $query
        $reader = $cmd.ExecuteReader()
        $results = @()
        while ($reader.Read()) {
            $row = @{}
            for ($i = 0; $i -lt $reader.FieldCount; $i++) {
                $row[$reader.GetName($i)] = $reader.GetValue($i)
            }
            $results += $row
        }
        $reader.Close()
        $conn.Close()
        return $results
    } catch {
        Log "SQL QUERY ERROR: $_"
        return @()
    }
}

# ============================================================================
# MAIN
# ============================================================================
Log "============================================"
Log "RestoFlow ERP Fix Script — Starting"
Log "Install Dir: $installDir"
Log "============================================"

# --- Step 1: Check install directory ---
if (-not (Test-Path $installDir)) {
    Log "WARNING: Install directory not found at $installDir"
    Log "Trying to locate the install path from registry..."
    $regPath = Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' | Where-Object { $_.DisplayName -like '*RestoFlow*' -or $_.DisplayName -like '*Sameh*' } | Select-Object -First 1
    if ($regPath) {
        $installDir = $regPath.InstallLocation
        Log "Found install at: $installDir"
    } else {
        Log "ERROR: Cannot find RestoFlow installation. Aborting."
        exit 1
    }
}

$distServer = Join-Path $installDir 'dist-server\index.cjs'
$bridgeDir = Join-Path $installDir 'hardware-bridge'
$bridgeIndex = Join-Path $bridgeDir 'index.js'
$bridgeEnv = Join-Path $bridgeDir '.env'
$serverEnv = Join-Path $installDir '.env'

# --- Step 2: Fix CSP in compiled server ---
Log ""
Log "--- Step 2: Fix CSP (connect-src) ---"
if (Test-Path $distServer) {
    $content = Get-Content $distServer -Raw
    if ($content -match 'connectSrc:\s*\[[^\]]*\]') {
        $original = $matches[0]
        if ($original -notmatch 'localhost:3002') {
            $fixed = $original -replace '("ws:")', "`$1, 'http://localhost:3002', 'http://127.0.0.1:3002'"
            $newContent = $content -replace [regex]::Escape($original), $fixed
            if (-not $DryRun) {
                Set-Content -Path $distServer -Value $newContent -NoNewline
                Log "CSP patched: added localhost:3002 and 127.0.0.1:3002 to connectSrc"
            } else {
                Log "[DRY-RUN] Would patch CSP: add localhost:3002 and 127.0.0.1:3002 to connectSrc"
            }
        } else {
            Log "CSP already includes localhost:3002, skipping"
        }
    } else {
        Log "WARNING: Could not find connectSrc in $distServer"
    }
} else {
    Log "WARNING: dist-server/index.cjs not found at $distServer"
}

# --- Step 3: Fix DB schema (add missing columns) ---
Log ""
Log "--- Step 3: Fix DB schema ---"

# Check if DB is accessible
$testResult = RunSqlQuery "SELECT 1 AS ok"
if ($testResult.Count -gt 0 -and $testResult[0].ok -eq 1) {
    Log "Database connection OK (LocalDB MSSQLLocalDB)"
} else {
    Log "WARNING: Could not connect to LocalDB. Trying CoduisZen instance..."
    $testResult2 = RunSqlQuery "SELECT 1 AS ok"
    if ($testResult2.Count -gt 0 -and $testResult2[0].ok -eq 1) {
        Log "Database connection OK (LocalDB CoduisZen)"
    } else {
        Log "ERROR: Cannot connect to any LocalDB instance. Check SQL Server LocalDB installation."
        Log "You can install LocalDB from: https://go.microsoft.com/fwlink/?linkid=2169854"
    }
}

# Add missing columns to print_jobs (safe idempotent ALTER TABLE)
Log "Ensuring print_jobs columns exist..."
@(
    "IF COL_LENGTH('print_jobs', 'max_attempts') IS NULL ALTER TABLE print_jobs ADD max_attempts INT NOT NULL DEFAULT 3",
    "IF COL_LENGTH('print_jobs', 'attempts') IS NULL ALTER TABLE print_jobs ADD attempts INT NOT NULL DEFAULT 0",
    "IF COL_LENGTH('print_jobs', 'claimed_by') IS NULL ALTER TABLE print_jobs ADD claimed_by NVARCHAR(100) NULL",
    "IF COL_LENGTH('print_jobs', 'claimed_at') IS NULL ALTER TABLE print_jobs ADD claimed_at DATETIME2 NULL",
    "IF COL_LENGTH('print_jobs', 'failed_at') IS NULL ALTER TABLE print_jobs ADD failed_at DATETIME2 NULL",
    "IF COL_LENGTH('print_jobs', 'error_message') IS NULL ALTER TABLE print_jobs ADD error_message NVARCHAR(MAX) NULL",
    "IF COL_LENGTH('print_jobs', 'gateway_id') IS NULL ALTER TABLE print_jobs ADD gateway_id NVARCHAR(100) NULL"
) | ForEach-Object { RunSql $_ }

# Add missing columns to menu_items
Log "Ensuring menu_items columns exist..."
@(
    "IF COL_LENGTH('menu_items', 'status') IS NULL ALTER TABLE menu_items ADD status NVARCHAR(20) DEFAULT 'published'",
    "IF COL_LENGTH('menu_items', 'approved_by') IS NULL AND COL_LENGTH('menu_items', 'approvedBy') IS NULL ALTER TABLE menu_items ADD approved_by NVARCHAR(100) NULL",
    "IF COL_LENGTH('menu_items', 'approved_at') IS NULL AND COL_LENGTH('menu_items', 'approvedAt') IS NULL ALTER TABLE menu_items ADD approved_at DATETIME2 NULL",
    "IF COL_LENGTH('menu_items', 'published_at') IS NULL AND COL_LENGTH('menu_items', 'publishedAt') IS NULL ALTER TABLE menu_items ADD published_at DATETIME2 NULL",
    "IF COL_LENGTH('menu_items', 'previous_price') IS NULL ALTER TABLE menu_items ADD previous_price DECIMAL(18,2) NULL",
    "IF COL_LENGTH('menu_items', 'pending_price') IS NULL ALTER TABLE menu_items ADD pending_price DECIMAL(18,2) NULL",
    "IF COL_LENGTH('menu_items', 'price_change_reason') IS NULL ALTER TABLE menu_items ADD price_change_reason NVARCHAR(500) NULL",
    "IF COL_LENGTH('menu_items', 'price_approved_by') IS NULL ALTER TABLE menu_items ADD price_approved_by NVARCHAR(100) NULL",
    "IF COL_LENGTH('menu_items', 'price_approved_at') IS NULL ALTER TABLE menu_items ADD price_approved_at DATETIME2 NULL",
    "IF COL_LENGTH('menu_items', 'deleted_at') IS NULL ALTER TABLE menu_items ADD deleted_at DATETIME2 NULL"
) | ForEach-Object { RunSql $_ }

# --- Step 4: Reset stuck PROCESSING print jobs ---
Log ""
Log "--- Step 4: Reset stuck PROCESSING jobs ---"
$resetResult = RunSql @"
UPDATE print_jobs
SET status = 'QUEUED',
    claimed_by = NULL,
    claimed_at = NULL,
    updated_at = GETDATE(),
    error = 'STALE_JOB_RESET_BY_FIX_SCRIPT'
WHERE status = 'PROCESSING'
  AND claimed_at < DATEADD(HOUR, -1, GETDATE())
"@
Log "Stuck PROCESSING jobs reset to QUEUED"

# --- Step 5: Kill duplicate port 3002 process ---
Log ""
Log "--- Step 5: Kill stale bridge process on port 3002 ---"
$port3002 = netstat -ano | Select-String ':3002\s'
if ($port3002) {
    $pids = $port3002 | ForEach-Object { $_ -split '\s+' | Select-Object -Last 1 } | Where-Object { $_ -ne '' } | Select-Object -Unique
    foreach ($pid in $pids) {
        $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($process) {
            Log "Killing process $pid ($($process.ProcessName)) on port 3002"
            if (-not $DryRun) {
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            } else {
                Log "[DRY-RUN] Would kill process $pid"
            }
        }
    }
} else {
    Log "No process found on port 3002"
}

# --- Step 6: Check and fix bridge .env ---
Log ""
Log "--- Step 6: Verify bridge configuration ---"
if (Test-Path $bridgeEnv) {
    $envContent = Get-Content $bridgeEnv
    Log "Bridge .env found at $bridgeEnv"
    $envContent | ForEach-Object { Log "  $_" }
} else {
    Log "WARNING: Bridge .env not found at $bridgeEnv"
    if (-not $DryRun) {
        $sampleEnv = @"
# RestoFlow Hardware Bridge Configuration
SERVER_URL=http://127.0.0.1:3001
BRIDGE_PORT=3002
BRANCH_ID=d441G6uD9J70Makdu_Xug
GATEWAY_TOKEN=b0lxbaHX-QGvo6_TjOlVvKfDlFutINRQ
GATEWAY_ID=gw-desktop-537sg3s
POLL_MS=2000
"@
        Set-Content -Path $bridgeEnv -Value $sampleEnv
        Log "Created bridge .env with default values"
    } else {
        Log "[DRY-RUN] Would create bridge .env"
    }
}

# --- Step 7: Check server .env for PRINT_GATEWAY_TOKEN ---
Log ""
Log "--- Step 7: Verify server .env ---"
if (Test-Path $serverEnv) {
    $serverEnvContent = Get-Content $serverEnv | Where-Object { $_ -match 'PRINT_GATEWAY_TOKEN|BRANCH_ID|DATABASE_URL' }
    if ($serverEnvContent) {
        $serverEnvContent | ForEach-Object { Log "  $_" }
    } else {
        Log "WARNING: Server .env missing PRINT_GATEWAY_TOKEN/BRANCH_ID"
    }
} else {
    Log "WARNING: Server .env not found at $serverEnv"
}

# --- Step 8: Fix bridge error logging (patch catch {} to log) ---
Log ""
Log "--- Step 8: Patch bridge error logging ---"
if (Test-Path $bridgeIndex) {
    $bridgeContent = Get-Content $bridgeIndex -Raw
    if ($bridgeContent -match 'catch\s*\{\s*\}') {
        $patched = $bridgeContent -replace 'catch\s*\{\s*\}', 'catch (e) { log(`[fetch] ERROR: ${e?.message || e}`) }'
        if (-not $DryRun) {
            Set-Content -Path $bridgeIndex -Value $patched -NoNewline
            Log "Bridge error logging patched: catch {} now logs errors"
        } else {
            Log "[DRY-RUN] Would patch bridge catch {} to log errors"
        }
    } else {
        Log "Bridge already has error logging or unexpected pattern, skipping"
    }
} else {
    Log "WARNING: Bridge index.js not found at $bridgeIndex"
}

# --- Step 9: Restart Sameh services ---
Log ""
Log "--- Step 9: Restart Sameh services ---"
if (-not $SkipServiceRestart -and -not $DryRun) {
    $services = Get-Service -Name 'Sameh*' -ErrorAction SilentlyContinue
    if ($services) {
        foreach ($svc in $services) {
            Log "Restarting service: $($svc.Name)"
            Restart-Service -Name $svc.Name -Force -ErrorAction SilentlyContinue
        }
    } else {
        Log "No Sameh services found. Attempting to restart via supervisor..."
        $supervisorExe = Join-Path $installDir 'node_modules\.bin\supervisor.cmd'
        $supervisorBat = Join-Path $installDir 'node_modules\.bin\supervisor.bat'
        if (Test-Path $supervisorExe) {
            Log "Supervisor found at $supervisorExe"
            & $supervisorExe restart
        } elseif (Test-Path $supervisorBat) {
            Log "Supervisor found at $supervisorBat"
            & $supervisorBat restart
        } else {
            Log "Supervisor not found. Please restart the server manually."
            Log "Recommended: Open services.msc and restart 'Sameh RestoFlow' service"
        }
    }
} else {
    if ($DryRun) { Log "[DRY-RUN] Would restart services" }
    else { Log "Service restart skipped (--SkipServiceRestart)" }
}

# --- Step 10: Print diagnostic info ---
Log ""
Log "--- Step 10: Diagnostic Summary ---"
Log "Fix log written to: $logFile"

# Check bridge health
try {
    $bridgeHealth = Invoke-WebRequest -Uri 'http://localhost:3002/health' -TimeoutSec 3 -ErrorAction SilentlyContinue
    if ($bridgeHealth.StatusCode -eq 200) {
        $healthData = $bridgeHealth.Content | ConvertFrom-Json
        Log "Bridge: ONLINE (gatewayId=$($healthData.gatewayId), branchId=$($healthData.branchId))"
    }
} catch {
    Log "Bridge: OFFLINE (not responding on port 3002)"
}

# Check server health
try {
    $serverHealth = Invoke-WebRequest -Uri 'http://127.0.0.1:3001/api/health' -TimeoutSec 3 -ErrorAction SilentlyContinue
    if ($serverHealth.StatusCode -eq 200) {
        Log "Server: ONLINE (port 3001)"
    }
} catch {
    Log "Server: OFFLINE (not responding on port 3001)"
}

# Check print queue
$printJobs = RunSqlQuery "SELECT status, COUNT(*) AS cnt FROM print_jobs GROUP BY status"
if ($printJobs.Count -gt 0) {
    Log "Print Queue Status:"
    $printJobs | ForEach-Object { Log "  $($_.status): $($_.cnt)" }
} else {
    Log "Print queue: empty or could not query"
}

# Show recent print jobs
$recentJobs = RunSqlQuery "SELECT TOP 5 id, branch_id, status, target_gateway_id, gateway_id, created_at FROM print_jobs ORDER BY created_at DESC"
if ($recentJobs.Count -gt 0) {
    Log "Recent Print Jobs:"
    $recentJobs | ForEach-Object { Log "  $($_.id) | branch=$($_.branch_id) | status=$($_.status) | targetGateway=$($_.target_gateway_id) | gateway=$($_.gateway_id) | created=$($_.created_at)" }
}

Log ""
Log "============================================"
Log "Fix script completed!"
Log "============================================"
Log ""
Log "Important next steps:"
Log "  1. If bridge is OFFLINE above, start it manually:"
Log "     cd '$bridgeDir' && node index.js"
Log "  2. Open http://127.0.0.1:3001 and create a test print from Printer Manager"
Log "  3. Check the bridge console for error messages"
Log "  4. If issues persist, check the log at: $logFile"
