param([string]$InstallDir = '')

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Run-Task([string]$Action, [string]$Name) {
    & schtasks.exe "/$Action" /TN $Name 2>$null | Out-Null
}

function Start-SystemTasks {
    foreach ($name in @('Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge')) {
        Run-Task 'Run' $name
    }
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Run Apply Local Image Fix.bat as Administrator.' }

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
$restoreScript = Join-Path $InstallDir 'runtime\database-restore.cjs'
$currentServer = Join-Path $InstallDir 'dist-server\index.cjs'
$currentFrontend = Join-Path $InstallDir 'dist'
$recoveryServer = Join-Path $InstallDir 'recovery\dist-server\index.cjs'
$recoveryFrontend = Join-Path $InstallDir 'recovery\dist'
$recoveryManifest = Join-Path $InstallDir 'recovery\manifest.json'
$payloadRoot = Join-Path $PSScriptRoot 'payload'
$payloadServer = Join-Path $payloadRoot 'dist-server\index.cjs'
$payloadFrontend = Join-Path $payloadRoot 'dist'
$payloadBackupScript = Join-Path $payloadRoot 'runtime\database-backup.cjs'
$payloadRestoreScript = Join-Path $payloadRoot 'runtime\database-restore.cjs'
$payloadManifest = Join-Path $PSScriptRoot 'payload-manifest.json'
foreach ($required in @($node, $backupScript, $restoreScript, $currentServer, $currentFrontend, $payloadServer, $payloadFrontend, $payloadBackupScript, $payloadRestoreScript, $payloadManifest)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Required file missing: $required" }
}

$payloadEntries = Get-Content -LiteralPath $payloadManifest -Raw | ConvertFrom-Json
foreach ($entry in $payloadEntries) {
    $payloadFile = Join-Path $payloadRoot $entry.path
    if (-not (Test-Path -LiteralPath $payloadFile)) { throw "Payload file missing: $($entry.path)" }
    $actualHash = (Get-FileHash -LiteralPath $payloadFile -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $entry.sha256) { throw "Payload verification failed: $($entry.path)" }
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$rollback = Join-Path $InstallDir "updates\local-image-fix-rollback-$timestamp"
$logDir = Join-Path $InstallDir 'logs'
New-Item -ItemType Directory -Path $rollback, $logDir -Force | Out-Null
$log = Join-Path $logDir "local-image-fix-$timestamp.log"

try {
    $backupResult = & $node $backupScript 2>&1
    $backupResult | Add-Content -LiteralPath $log -Encoding UTF8
    if ($LASTEXITCODE -ne 0) { throw 'Verified database backup failed.' }

    foreach ($name in @('Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge')) { Run-Task 'End' $name }
    Get-CimInstance Win32_Process | Where-Object {
        $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.IndexOf($InstallDir, [StringComparison]::OrdinalIgnoreCase) -ge 0
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

    Copy-Item -LiteralPath $currentServer -Destination (Join-Path $rollback 'index.cjs') -Force
    Copy-Item -LiteralPath $currentFrontend -Destination (Join-Path $rollback 'dist') -Recurse -Force
    Copy-Item -LiteralPath $backupScript -Destination (Join-Path $rollback 'database-backup.cjs') -Force
    Copy-Item -LiteralPath $restoreScript -Destination (Join-Path $rollback 'database-restore.cjs') -Force
    if (Test-Path -LiteralPath $recoveryServer) { Copy-Item -LiteralPath $recoveryServer -Destination (Join-Path $rollback 'recovery-index.cjs') -Force }
    if (Test-Path -LiteralPath $recoveryFrontend) { Copy-Item -LiteralPath $recoveryFrontend -Destination (Join-Path $rollback 'recovery-dist') -Recurse -Force }
    if (Test-Path -LiteralPath $recoveryManifest) { Copy-Item -LiteralPath $recoveryManifest -Destination (Join-Path $rollback 'manifest.json') -Force }

    Copy-Item -LiteralPath $payloadServer -Destination $currentServer -Force
    Copy-Item -LiteralPath $payloadBackupScript -Destination $backupScript -Force
    Copy-Item -LiteralPath $payloadRestoreScript -Destination $restoreScript -Force
    Remove-Item -LiteralPath $currentFrontend -Recurse -Force
    New-Item -ItemType Directory -Path $currentFrontend -Force | Out-Null
    Copy-Item -Path (Join-Path $payloadFrontend '*') -Destination $currentFrontend -Recurse -Force

    if (Test-Path -LiteralPath $recoveryServer) { Copy-Item -LiteralPath $payloadServer -Destination $recoveryServer -Force }
    if (Test-Path -LiteralPath $recoveryFrontend) {
        Remove-Item -LiteralPath $recoveryFrontend -Recurse -Force
        New-Item -ItemType Directory -Path $recoveryFrontend -Force | Out-Null
        Copy-Item -Path (Join-Path $payloadFrontend '*') -Destination $recoveryFrontend -Recurse -Force
    }
    if (Test-Path -LiteralPath $recoveryManifest) {
        $manifest = Get-Content -LiteralPath $recoveryManifest -Raw | ConvertFrom-Json
        foreach ($entry in @(
            @{ target = 'dist-server\index.cjs'; file = $currentServer },
            @{ target = 'dist\index.html'; file = (Join-Path $currentFrontend 'index.html') }
        )) {
            $record = @($manifest | Where-Object { $_.target -eq $entry.target }) | Select-Object -First 1
            if ($record) { $record.sha256 = (Get-FileHash -LiteralPath $entry.file -Algorithm SHA256).Hash.ToLowerInvariant() }
        }
        [IO.File]::WriteAllText($recoveryManifest, ($manifest | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    }

    $uploads = Join-Path ($env:ProgramData) 'Sameh\RestoFlow ERP\uploads'
    New-Item -ItemType Directory -Path $uploads -Force | Out-Null

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
    $frontend = Invoke-WebRequest 'http://127.0.0.1:3001/' -UseBasicParsing -TimeoutSec 10
    if ($frontend.StatusCode -ne 200) { throw 'Frontend health check failed.' }

    @{ version = '1.1.16-local-images'; appliedAt = (Get-Date).ToString('o'); rollback = $rollback; uploads = $uploads } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $InstallDir 'local-image-fix-state.json') -Encoding UTF8
    "SUCCESS $(Get-Date -Format o)" | Add-Content -LiteralPath $log -Encoding UTF8
    Write-Host "`nSUCCESS. Local Image Fix applied. Log: $log" -ForegroundColor Green
    exit 0
} catch {
    $message = $_.Exception.Message
    "FAILED $(Get-Date -Format o) $message" | Add-Content -LiteralPath $log -Encoding UTF8
    if (Test-Path -LiteralPath (Join-Path $rollback 'index.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'index.cjs') -Destination $currentServer -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'dist')) {
        Remove-Item -LiteralPath $currentFrontend -Recurse -Force -ErrorAction SilentlyContinue
        Copy-Item -LiteralPath (Join-Path $rollback 'dist') -Destination $currentFrontend -Recurse -Force
    }
    if (Test-Path -LiteralPath (Join-Path $rollback 'database-backup.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'database-backup.cjs') -Destination $backupScript -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'database-restore.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'database-restore.cjs') -Destination $restoreScript -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'recovery-index.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'recovery-index.cjs') -Destination $recoveryServer -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'recovery-dist')) {
        Remove-Item -LiteralPath $recoveryFrontend -Recurse -Force -ErrorAction SilentlyContinue
        Copy-Item -LiteralPath (Join-Path $rollback 'recovery-dist') -Destination $recoveryFrontend -Recurse -Force
    }
    if (Test-Path -LiteralPath (Join-Path $rollback 'manifest.json')) { Copy-Item -LiteralPath (Join-Path $rollback 'manifest.json') -Destination $recoveryManifest -Force }
    Start-SystemTasks
    Write-Host "`nFAILED: $message" -ForegroundColor Red
    exit 1
}
