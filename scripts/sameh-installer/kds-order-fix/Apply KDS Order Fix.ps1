param([string]$InstallDir = '')

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Run-Task([string]$Action, [string]$Name) {
    & schtasks.exe "/$Action" /TN $Name 2>$null | Out-Null
}

function Start-SystemTasks {
    foreach ($name in @('Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge')) { Run-Task 'Run' $name }
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Run Apply KDS Order Fix.bat as Administrator.' }

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
$currentServer = Join-Path $InstallDir 'dist-server\index.cjs'
$recoveryServer = Join-Path $InstallDir 'recovery\dist-server\index.cjs'
$recoveryManifest = Join-Path $InstallDir 'recovery\manifest.json'
$payloadRoot = Join-Path $PSScriptRoot 'payload'
$payloadServer = Join-Path $payloadRoot 'dist-server\index.cjs'
$payloadManifest = Join-Path $PSScriptRoot 'payload-manifest.json'
foreach ($required in @($node, $backupScript, (Join-Path $InstallDir '.env'), $currentServer, $payloadServer, $payloadManifest)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Required file missing: $required" }
}

$entry = @(Get-Content -LiteralPath $payloadManifest -Raw | ConvertFrom-Json)[0]
$actualHash = (Get-FileHash -LiteralPath $payloadServer -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $entry.sha256) { throw 'Payload verification failed.' }

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$rollback = Join-Path $InstallDir "updates\kds-order-fix-rollback-$timestamp"
$logDir = Join-Path $InstallDir 'logs'
New-Item -ItemType Directory -Path $rollback, $logDir -Force | Out-Null
$log = Join-Path $logDir "kds-order-fix-$timestamp.log"

try {
    $backupResult = & $node $backupScript 2>&1
    $backupResult | Add-Content -LiteralPath $log -Encoding UTF8
    if ($LASTEXITCODE -ne 0) { throw 'Verified database backup failed.' }

    foreach ($name in @('Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge')) { Run-Task 'End' $name }
    Get-CimInstance Win32_Process | Where-Object {
        $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.IndexOf($InstallDir, [StringComparison]::OrdinalIgnoreCase) -ge 0
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

    Copy-Item -LiteralPath $currentServer -Destination (Join-Path $rollback 'index.cjs') -Force
    if (Test-Path -LiteralPath $recoveryServer) { Copy-Item -LiteralPath $recoveryServer -Destination (Join-Path $rollback 'recovery-index.cjs') -Force }
    if (Test-Path -LiteralPath $recoveryManifest) { Copy-Item -LiteralPath $recoveryManifest -Destination (Join-Path $rollback 'manifest.json') -Force }

    Copy-Item -LiteralPath $payloadServer -Destination $currentServer -Force
    if (Test-Path -LiteralPath $recoveryServer) { Copy-Item -LiteralPath $payloadServer -Destination $recoveryServer -Force }
    if (Test-Path -LiteralPath $recoveryManifest) {
        $manifest = Get-Content -LiteralPath $recoveryManifest -Raw | ConvertFrom-Json
        $record = @($manifest | Where-Object { $_.target -eq 'dist-server\index.cjs' }) | Select-Object -First 1
        if ($record) { $record.sha256 = $actualHash }
        [IO.File]::WriteAllText($recoveryManifest, ($manifest | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    }

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

    @{ version = '1.1.24-kds-order'; appliedAt = (Get-Date).ToString('o'); rollback = $rollback } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $InstallDir 'kds-order-fix-state.json') -Encoding UTF8
    "SUCCESS $(Get-Date -Format o)" | Add-Content -LiteralPath $log -Encoding UTF8
    Write-Host "`nSUCCESS. Orders can be sent to KDS. Log: $log" -ForegroundColor Green
    exit 0
} catch {
    $message = $_.Exception.Message
    "FAILED $(Get-Date -Format o) $message" | Add-Content -LiteralPath $log -Encoding UTF8
    if (Test-Path -LiteralPath (Join-Path $rollback 'index.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'index.cjs') -Destination $currentServer -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'recovery-index.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'recovery-index.cjs') -Destination $recoveryServer -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'manifest.json')) { Copy-Item -LiteralPath (Join-Path $rollback 'manifest.json') -Destination $recoveryManifest -Force }
    Start-SystemTasks
    Write-Host "`nFAILED: $message" -ForegroundColor Red
    exit 1
}
