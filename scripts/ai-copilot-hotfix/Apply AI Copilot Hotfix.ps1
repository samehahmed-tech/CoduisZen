param([string]$InstallDir = '')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Run-Task([string]$action, [string]$name) {
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    & schtasks.exe "/Query" /TN $name *> $null
    if ($LASTEXITCODE -eq 0) { & schtasks.exe "/$action" /TN $name *> $null }
    $ErrorActionPreference = $oldPreference
}
function Start-SystemTasks {
    foreach ($name in @('Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge')) { Run-Task 'Run' $name }
}

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run this FIX as Administrator.' }
if (-not $InstallDir) { $InstallDir = Join-Path $env:ProgramFiles 'Sameh\RestoFlow ERP' }
$InstallDir = [IO.Path]::GetFullPath($InstallDir).TrimEnd('\')
$node = Join-Path $InstallDir 'runtime\node.exe'
$backupTool = Join-Path $InstallDir 'runtime\database-backup.cjs'
$currentServer = Join-Path $InstallDir 'dist-server\index.cjs'
$currentFrontend = Join-Path $InstallDir 'dist'
$payloadServer = Join-Path $PSScriptRoot 'payload\dist-server\index.cjs'
$payloadFrontend = Join-Path $PSScriptRoot 'payload\dist'
foreach ($path in @($node, $backupTool, $currentServer, $currentFrontend, $payloadServer, $payloadFrontend)) { if (-not (Test-Path -LiteralPath $path)) { throw "Missing required file: $path" } }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$rollback = Join-Path $InstallDir "updates\ai-copilot-rollback-$stamp"
New-Item -ItemType Directory -Path $rollback -Force | Out-Null

try {
    & $node $backupTool
    if ($LASTEXITCODE -ne 0) { throw 'Verified database backup failed.' }
    foreach ($name in @('Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge')) { Run-Task 'End' $name }
    Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.IndexOf($InstallDir, [StringComparison]::OrdinalIgnoreCase) -ge 0 } | ForEach-Object { Stop-Process $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2

    Copy-Item $currentServer (Join-Path $rollback 'index.cjs') -Force
    Copy-Item $currentFrontend (Join-Path $rollback 'dist') -Recurse -Force
    Copy-Item $payloadServer $currentServer -Force
    Remove-Item $currentFrontend -Recurse -Force
    Copy-Item $payloadFrontend $currentFrontend -Recurse -Force
    if (Test-Path (Join-Path $InstallDir 'recovery\dist-server\index.cjs')) { Copy-Item $payloadServer (Join-Path $InstallDir 'recovery\dist-server\index.cjs') -Force }
    if (Test-Path (Join-Path $InstallDir 'recovery\dist')) { Remove-Item (Join-Path $InstallDir 'recovery\dist') -Recurse -Force; Copy-Item $payloadFrontend (Join-Path $InstallDir 'recovery\dist') -Recurse -Force }

    $statePath = Join-Path $InstallDir 'install-state.json'
    if (Test-Path $statePath) {
        $state = Get-Content $statePath -Raw | ConvertFrom-Json
        $state.version = '1.1.34'
        $state.updatedAt = (Get-Date).ToUniversalTime().ToString('o')
        $stateJson = $state | ConvertTo-Json -Depth 10
        [IO.File]::WriteAllText($statePath, $stateJson, [Text.UTF8Encoding]::new($false))
    }
    Start-SystemTasks
    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        try {
            $health = Invoke-RestMethod 'http://127.0.0.1:3001/api/health' -TimeoutSec 3
            if ($health.health.services.database.status -eq 'CONNECTED') { Write-Host 'SUCCESS: AI Copilot Hotfix 1.1.34 applied.' -ForegroundColor Green; exit 0 }
        } catch { }
        Start-Sleep -Seconds 2
    }
    throw 'Server did not become healthy within 90 seconds.'
} catch {
    if (Test-Path (Join-Path $rollback 'index.cjs')) { Copy-Item (Join-Path $rollback 'index.cjs') $currentServer -Force }
    if (Test-Path (Join-Path $rollback 'dist')) { Remove-Item $currentFrontend -Recurse -Force -ErrorAction SilentlyContinue; Copy-Item (Join-Path $rollback 'dist') $currentFrontend -Recurse -Force }
    Start-SystemTasks
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
