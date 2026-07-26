param([string]$InstallDir = '')

$ErrorActionPreference = 'Stop'

function Run-Task([string]$Action, [string]$Name) {
    & schtasks.exe "/$Action" /TN $Name 2>$null | Out-Null
}

function Start-SystemTasks {
    foreach ($name in @('Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge')) {
        Run-Task 'Run' $name
    }
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Run Fix Order Save.bat as Administrator.' }

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
$currentKds = Join-Path $InstallDir 'dist\kdslite.html'
$recoveryServer = Join-Path $InstallDir 'recovery\dist-server\index.cjs'
$recoveryKds = Join-Path $InstallDir 'recovery\dist\kdslite.html'
$recoveryManifest = Join-Path $InstallDir 'recovery\manifest.json'
$payloadServer = Join-Path $PSScriptRoot 'payload\dist-server\index.cjs'
$payloadKds = Join-Path $PSScriptRoot 'payload\dist\kdslite.html'
$envFile = Join-Path $InstallDir '.env'
$kdsShortcut = Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) 'RestoFlow KDS Lite.url'
foreach ($required in @($node, $backupScript, $currentServer, $currentKds, $payloadServer, $payloadKds, $envFile)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Required file missing: $required" }
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$rollback = Join-Path $InstallDir "updates\order-save-rollback-$timestamp"
$logDir = Join-Path $InstallDir 'logs'
New-Item -ItemType Directory -Path $rollback, $logDir -Force | Out-Null
$log = Join-Path $logDir "order-save-fix-$timestamp.log"

try {
    & $node $backupScript 2>&1 | Tee-Object -FilePath $log
    if ($LASTEXITCODE -ne 0) { throw 'Verified database backup failed.' }

    foreach ($name in @('Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge')) { Run-Task 'End' $name }
    Get-CimInstance Win32_Process | Where-Object {
        $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.IndexOf($InstallDir, [StringComparison]::OrdinalIgnoreCase) -ge 0
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

    Copy-Item -LiteralPath $currentServer -Destination (Join-Path $rollback 'index.cjs') -Force
    Copy-Item -LiteralPath $currentKds -Destination (Join-Path $rollback 'kdslite.html') -Force
    if (Test-Path -LiteralPath $recoveryServer) { Copy-Item -LiteralPath $recoveryServer -Destination (Join-Path $rollback 'recovery-index.cjs') -Force }
    if (Test-Path -LiteralPath $recoveryKds) { Copy-Item -LiteralPath $recoveryKds -Destination (Join-Path $rollback 'recovery-kdslite.html') -Force }
    if (Test-Path -LiteralPath $recoveryManifest) { Copy-Item -LiteralPath $recoveryManifest -Destination (Join-Path $rollback 'manifest.json') -Force }
    if (Test-Path -LiteralPath $kdsShortcut) { Copy-Item -LiteralPath $kdsShortcut -Destination (Join-Path $rollback 'RestoFlow KDS Lite.url') -Force }
    Copy-Item -LiteralPath $envFile -Destination (Join-Path $rollback '.env') -Force

    Copy-Item -LiteralPath $payloadServer -Destination $currentServer -Force
    Copy-Item -LiteralPath $payloadKds -Destination $currentKds -Force
    if (Test-Path -LiteralPath $recoveryServer) { Copy-Item -LiteralPath $payloadServer -Destination $recoveryServer -Force }
    if (Test-Path -LiteralPath $recoveryKds) { Copy-Item -LiteralPath $payloadKds -Destination $recoveryKds -Force }
    if (Test-Path -LiteralPath $recoveryManifest) {
        $manifest = Get-Content -LiteralPath $recoveryManifest -Raw | ConvertFrom-Json
        foreach ($entry in @(
            @{ target = 'dist-server\index.cjs'; file = $currentServer },
            @{ target = 'dist\kdslite.html'; file = $currentKds }
        )) {
            $record = $manifest | Where-Object { $_.target -eq $entry.target }
            if ($record) { $record.sha256 = (Get-FileHash -LiteralPath $entry.file -Algorithm SHA256).Hash.ToLowerInvariant() }
        }
        [IO.File]::WriteAllText($recoveryManifest, ($manifest | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    }

    $envLines = @(Get-Content -LiteralPath $envFile)
    $lanSettingFound = $false
    for ($index = 0; $index -lt $envLines.Count; $index++) {
        if ($envLines[$index] -match '^PUBLIC_SCREEN_LAN_NO_KEY=') {
            $envLines[$index] = 'PUBLIC_SCREEN_LAN_NO_KEY=true'
            $lanSettingFound = $true
        }
    }
    if (-not $lanSettingFound) { $envLines += 'PUBLIC_SCREEN_LAN_NO_KEY=true' }
    [IO.File]::WriteAllLines($envFile, $envLines, [Text.UTF8Encoding]::new($false))

    $serverIp = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address } |
        ForEach-Object { $_.IPv4Address.IPAddress } | Select-Object -First 1
    if (-not $serverIp) { $serverIp = '127.0.0.1' }
    $screenUrl = "http://${serverIp}:3001/kdslite.html?branchId=b1"
    $shortcut = "[InternetShortcut]`r`nURL=$screenUrl`r`n"
    [IO.File]::WriteAllText($kdsShortcut, $shortcut, [Text.UTF8Encoding]::new($false))

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

    @{ version = '1.1.10-order-save'; appliedAt = (Get-Date).ToString('o'); rollback = $rollback } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $InstallDir 'order-save-fix-state.json') -Encoding UTF8
    "SUCCESS $(Get-Date -Format o)" | Add-Content -LiteralPath $log -Encoding UTF8
    Write-Host "`nSUCCESS. Order Save and KDS Lite fixed. Log: $log" -ForegroundColor Green
    exit 0
} catch {
    $message = $_.Exception.Message
    "FAILED $(Get-Date -Format o) $message" | Add-Content -LiteralPath $log -Encoding UTF8
    if (Test-Path -LiteralPath (Join-Path $rollback 'index.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'index.cjs') -Destination $currentServer -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'kdslite.html')) { Copy-Item -LiteralPath (Join-Path $rollback 'kdslite.html') -Destination $currentKds -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'recovery-index.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'recovery-index.cjs') -Destination $recoveryServer -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'recovery-kdslite.html')) { Copy-Item -LiteralPath (Join-Path $rollback 'recovery-kdslite.html') -Destination $recoveryKds -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'manifest.json')) { Copy-Item -LiteralPath (Join-Path $rollback 'manifest.json') -Destination $recoveryManifest -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback '.env')) { Copy-Item -LiteralPath (Join-Path $rollback '.env') -Destination $envFile -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'RestoFlow KDS Lite.url')) {
        Copy-Item -LiteralPath (Join-Path $rollback 'RestoFlow KDS Lite.url') -Destination $kdsShortcut -Force
    } elseif (Test-Path -LiteralPath $kdsShortcut) {
        Remove-Item -LiteralPath $kdsShortcut -Force
    }
    Start-SystemTasks
    Write-Host "`nFAILED: $message" -ForegroundColor Red
    exit 1
}
