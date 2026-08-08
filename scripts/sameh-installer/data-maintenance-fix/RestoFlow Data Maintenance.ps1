param([string]$InstallDir = '')

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()

$taskNames = @('Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge')

function Suspend-SystemTasks {
    $enabled = @()
    foreach ($name in $taskNames) {
        $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
        if (-not $task) { continue }
        if ($task.State -ne 'Disabled') { $enabled += $name }
        Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
        Disable-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue | Out-Null
    }
    return $enabled
}

function Resume-SystemTasks([string[]]$EnabledTasks) {
    foreach ($name in $EnabledTasks) {
        Enable-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue | Out-Null
        Start-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    }
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Run RestoFlow Data Maintenance.bat as Administrator.' }

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
$backup = Join-Path $InstallDir 'runtime\database-backup.cjs'
$runner = Join-Path $PSScriptRoot 'data-maintenance.cjs'
foreach ($required in @($node, $backup, $runner, (Join-Path $InstallDir '.env'))) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Required file missing: $required" }
}

Write-Host "`nSelect one or more operations, separated by commas:" -ForegroundColor Cyan
Write-Host '1) Zero current inventory quantities only'
Write-Host '2) Delete stock-count sessions and lines'
Write-Host '3) Delete the full menu, recipes, and modifiers'
Write-Host '4) Delete sales, payments, shifts, and related day-close reports'
Write-Host '5) Delete all inventory item definitions and their dependent inventory data'
Write-Host '0) Exit without changes'
$selection = (Read-Host 'Example: 1,2').Trim()
if ($selection -eq '0') { Write-Host 'Cancelled. Nothing changed.'; exit 0 }

$actionMap = @{ '1' = 'stock'; '2' = 'counts'; '3' = 'menu'; '4' = 'sales'; '5' = 'inventory-items' }
$selectedNumbers = @($selection -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($selectedNumbers.Count -eq 0 -or @($selectedNumbers | Where-Object { -not $actionMap.ContainsKey($_) }).Count -gt 0) {
    throw 'Invalid selection. Use only 1,2,3,4,5 separated by commas.'
}
$actions = @($selectedNumbers | ForEach-Object { $actionMap[$_] } | Select-Object -Unique)
$actionsCsv = $actions -join ','

$inspectionText = & $node $runner "--install-dir=$InstallDir" "--actions=$actionsCsv" --inspect 2>&1
if ($LASTEXITCODE -ne 0) { throw "Preflight failed: $inspectionText" }
$inspection = $inspectionText | ConvertFrom-Json
Write-Host "`nPreview:" -ForegroundColor Yellow
$inspection.preview | ConvertTo-Json -Depth 5 | Write-Host
Write-Host "`nA verified full database backup will be created before deletion." -ForegroundColor Yellow
$confirmation = Read-Host 'Type DELETE to execute the selected operations'
if ($confirmation -cne 'DELETE') { Write-Host 'Cancelled. Nothing changed.'; exit 0 }

$logDir = Join-Path $InstallDir 'logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$log = Join-Path $logDir ("data-maintenance-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
$enabledTasks = @()
$tasksSuspended = $false

try {
    & $node $backup 2>&1 | Tee-Object -FilePath $log
    if ($LASTEXITCODE -ne 0) { throw 'Verified database backup failed. Nothing was deleted.' }

    $enabledTasks = @(Suspend-SystemTasks)
    $tasksSuspended = $true
    Get-CimInstance Win32_Process | Where-Object {
        $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.IndexOf($InstallDir, [StringComparison]::OrdinalIgnoreCase) -ge 0
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

    & $node $runner "--install-dir=$InstallDir" "--actions=$actionsCsv" --confirm=DELETE 2>&1 | Tee-Object -FilePath $log -Append
    if ($LASTEXITCODE -ne 0) { throw 'Data maintenance failed. SQL transaction rolled back.' }

    Resume-SystemTasks $enabledTasks
    $tasksSuspended = $false
    $healthy = $false
    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        Start-Sleep -Seconds 2
        try {
            $health = Invoke-RestMethod 'http://127.0.0.1:3001/api/health' -TimeoutSec 3
            if ($health.health.services.database.status -eq 'CONNECTED') { $healthy = $true; break }
        } catch { }
    }
    if (-not $healthy) { throw 'Maintenance completed, but server health check timed out. Review the log and verified backup.' }

    @{ mode = 'SELECTIVE_DATA_MAINTENANCE'; actions = $actions; appliedAt = (Get-Date).ToString('o'); log = $log } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $InstallDir 'data-maintenance-state.json') -Encoding UTF8
    Write-Host "`nSUCCESS. Selected operations completed. Log: $log" -ForegroundColor Green
    exit 0
} catch {
    if ($tasksSuspended) { Resume-SystemTasks $enabledTasks }
    Write-Host "`nFAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Log: $log" -ForegroundColor Yellow
    exit 1
}
