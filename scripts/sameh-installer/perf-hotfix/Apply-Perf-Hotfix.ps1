# RestoFlow Performance Hotfix (frontend only)
# Applies the optimized production frontend (dist/) to an installed copy.
# SAFE BY DESIGN: files-only change (no server code, no database touch),
# full rollback backup first, automatic restore on any failure.
#
# What this contains (P0+P1 perf pass):
#  - legacy polyfill/duplicate chunks removed (modern es2020 target)
#  - Dashboard charts (recharts) lazy-loaded past LCP
#  - framer-motion removed from shell critical path (CSS transitions)
#  - shared-* chunks so routes load only their own JS (no entry->route edges)
#  - deferred global init (audit/AI/menu catalog off critical path)
#  - fonts via preconnect+link; robots.txt Sitemap fix

param(
    [string]$InstallDir = '',
    [string]$PayloadFrontend = ''
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Step([string]$Message) { Write-Host "`n>> $Message" -ForegroundColor Cyan }
function Run-Task([string]$Action, [string]$Name) {
    & schtasks.exe "/$Action" /TN $Name 2>$null | Out-Null
}
function Start-SystemTasks {
    foreach ($name in @('Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge')) {
        $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
        if ($task) {
            $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
            Set-ScheduledTask -TaskName $name -Settings $settings | Out-Null
        }
        Run-Task 'Run' $name
    }
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Run this hotfix as Administrator (Run as administrator).' }

$repo = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
if (-not $PayloadFrontend) { $PayloadFrontend = Join-Path $repo 'dist' }

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

$payloadIndex = Join-Path $PayloadFrontend 'index.html'
foreach ($required in @($PayloadFrontend, $payloadIndex)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Required payload file is missing: $required" }
}
# Guard: refuse to install a stale (pre-optimization) build — the optimized
# entry preloads ONLY shared/vendor chunks, never page-*/motion/charts.
$payloadHtml = Get-Content -LiteralPath $payloadIndex -Raw
foreach ($banned in @('legacy', 'polyfills', 'page-dashboard', 'page-pos', '/motion-')) {
    if ($payloadHtml -match [regex]::Escape($banned)) { throw "Payload looks stale (contains '$banned'). Rebuild frontend first: npm run build:frontend" }
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$rollback = Join-Path $InstallDir "updates\rollback-perf-$timestamp"
$currentFrontend = Join-Path $InstallDir 'dist'
$recoveryFrontend = Join-Path $InstallDir 'recovery\dist\index.html'
$recoveryManifest = Join-Path $InstallDir 'recovery\manifest.json'
$logDir = Join-Path $InstallDir 'logs'
New-Item -ItemType Directory -Path $rollback, $logDir -Force | Out-Null
$log = Join-Path $logDir "perf-hotfix-$timestamp.log"
"START $(Get-Date -Format o) payload=$PayloadFrontend" | Add-Content -LiteralPath $log -Encoding UTF8

try {
    Step 'Stopping RestoFlow tasks and processes'
    foreach ($name in @('Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge')) { Run-Task 'End' $name }
    Get-CimInstance Win32_Process | Where-Object {
        $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.IndexOf($InstallDir, [StringComparison]::OrdinalIgnoreCase) -ge 0
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 3

    Step 'Saving rollback files'
    Copy-Item -LiteralPath $currentFrontend -Destination (Join-Path $rollback 'dist') -Recurse -Force
    if (Test-Path -LiteralPath $recoveryFrontend) { Copy-Item -LiteralPath $recoveryFrontend -Destination (Join-Path $rollback 'recovery-index.html') -Force }
    if (Test-Path -LiteralPath $recoveryManifest) { Copy-Item -LiteralPath $recoveryManifest -Destination (Join-Path $rollback 'manifest.json') -Force }

    Step 'Applying optimized frontend (dist/)'
    Remove-Item -LiteralPath $currentFrontend -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $currentFrontend -Force | Out-Null
    Copy-Item -Path (Join-Path $PayloadFrontend '*') -Destination $currentFrontend -Recurse -Force

    if (Test-Path -LiteralPath $recoveryFrontend) {
        Step 'Refreshing recovery copy + hash'
        Copy-Item -LiteralPath (Join-Path $currentFrontend 'index.html') -Destination $recoveryFrontend -Force
        if (Test-Path -LiteralPath $recoveryManifest) {
            $manifest = Get-Content -LiteralPath $recoveryManifest -Raw | ConvertFrom-Json
            $hash = (Get-FileHash -LiteralPath (Join-Path $currentFrontend 'index.html') -Algorithm SHA256).Hash.ToLowerInvariant()
            $record = $manifest | Where-Object { $_.target -eq 'dist\index.html' }
            if ($record) { $record.sha256 = $hash }
            [IO.File]::WriteAllText($recoveryManifest, ($manifest | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
        }
    }

    Step 'Restarting services and checking health'
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

    Step 'Verifying served frontend is the optimized build'
    $served = Invoke-WebRequest 'http://127.0.0.1:3001/index.html' -UseBasicParsing -TimeoutSec 10
    foreach ($banned in @('legacy', 'polyfills', 'page-dashboard', 'page-pos', '/motion-')) {
        if ($served.Content -match [regex]::Escape($banned)) { throw "Served index.html still references '$banned'." }
    }
    $robots = Invoke-WebRequest 'http://127.0.0.1:3001/robots.txt' -UseBasicParsing -TimeoutSec 10
    if ($robots.Content -match '(?m)^Sitemap: /sitemap\.xml') { throw 'Served robots.txt still has the relative Sitemap.' }

    @{ version = 'perf-hotfix-frontend'; appliedAt = (Get-Date).ToString('o'); rollback = $rollback } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $InstallDir 'hotfix-state.json') -Encoding UTF8
    "SUCCESS $(Get-Date -Format o) rollback=$rollback" | Add-Content -LiteralPath $log -Encoding UTF8
    Write-Host "`nSUCCESS: performance hotfix applied. Rollback: $rollback" -ForegroundColor Green
    Write-Host 'Open the app once, then press Ctrl+F5 inside it (hashed assets are immutable-cached).' -ForegroundColor Yellow
    exit 0
} catch {
    $message = $_.Exception.Message
    "FAILED $(Get-Date -Format o) $message" | Add-Content -LiteralPath $log -Encoding UTF8
    Write-Host "`nFAILED: $message" -ForegroundColor Red
    Write-Host 'Restoring previous frontend automatically...' -ForegroundColor Yellow
    if (Test-Path -LiteralPath (Join-Path $rollback 'dist')) {
        Remove-Item -LiteralPath $currentFrontend -Recurse -Force -ErrorAction SilentlyContinue
        Copy-Item -LiteralPath (Join-Path $rollback 'dist') -Destination $currentFrontend -Recurse -Force
    }
    if (Test-Path -LiteralPath (Join-Path $rollback 'recovery-index.html')) { Copy-Item -LiteralPath (Join-Path $rollback 'recovery-index.html') -Destination $recoveryFrontend -Force }
    if (Test-Path -LiteralPath (Join-Path $rollback 'manifest.json')) { Copy-Item -LiteralPath (Join-Path $rollback 'manifest.json') -Destination $recoveryManifest -Force }
    Start-SystemTasks
    exit 1
}
