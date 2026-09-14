param([string]$InstallDir = '')

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Step([string]$Message) { Write-Host "`n>> $Message" -ForegroundColor Cyan }
function Run-Task([string]$Action, [string]$Name) { & schtasks.exe "/$Action" /TN $Name 2>$null | Out-Null }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Run this fix as Administrator.' }

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

$payloadBridge = Join-Path $PSScriptRoot 'payload\hardware-bridge\index.js'
$payloadWatchdog = Join-Path $PSScriptRoot 'payload\runtime\watchdog.cjs'
$currentBridge = Join-Path $InstallDir 'hardware-bridge\index.js'
$currentWatchdog = Join-Path $InstallDir 'runtime\watchdog.cjs'
foreach ($required in @($payloadBridge, $payloadWatchdog, $currentBridge, $currentWatchdog)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Required file is missing: $required" }
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$rollback = Join-Path $InstallDir "updates\print-bridge-rollback-$timestamp"
New-Item -ItemType Directory -Path $rollback -Force | Out-Null

try {
    Step 'Stopping Print Bridge and saving rollback'
    Run-Task 'End' 'Sameh Print Bridge'
    Get-CimInstance Win32_Process | Where-Object {
        $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.IndexOf($InstallDir, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and $_.CommandLine -match 'hardware-bridge[\\/]index\.js'
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Copy-Item -LiteralPath $currentBridge -Destination (Join-Path $rollback 'bridge-index.js') -Force
    Copy-Item -LiteralPath $currentWatchdog -Destination (Join-Path $rollback 'watchdog.cjs') -Force

    Step 'Applying resilience fix'
    Copy-Item -LiteralPath $payloadBridge -Destination $currentBridge -Force
    Copy-Item -LiteralPath $payloadWatchdog -Destination $currentWatchdog -Force
    Run-Task 'Run' 'Sameh Print Bridge'
    if (-not (Get-ScheduledTask -TaskName 'Sameh Print Bridge' -ErrorAction SilentlyContinue)) {
        throw 'Sameh Print Bridge task was not found. Re-run the full Setup once.'
    }

    Step 'Checking Bridge'
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $health = Invoke-RestMethod 'http://127.0.0.1:3002/health' -TimeoutSec 3
            if ($health.serverConnected) { $ready = $true; break }
        } catch { }
        Start-Sleep -Seconds 2
    }
    if (-not $ready) { Write-Host 'Bridge started, but server connection is not ready yet. It will retry automatically.' -ForegroundColor Yellow }
    @{ version='print-bridge-resilience-1.0.0'; appliedAt=(Get-Date).ToString('o'); rollback=$rollback } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $InstallDir 'print-bridge-fix-state.json') -Encoding UTF8
    Write-Host "`nSUCCESS: Print Bridge resilience fix applied." -ForegroundColor Green
} catch {
    if (Test-Path -LiteralPath (Join-Path $rollback 'bridge-index.js')) { Copy-Item -LiteralPath (Join-Path $rollback 'bridge-index.js') -Destination $currentBridge -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'watchdog.cjs')) { Copy-Item -LiteralPath (Join-Path $rollback 'watchdog.cjs') -Destination $currentWatchdog -Force }
    Run-Task 'Run' 'Sameh Print Bridge'
    throw
}
