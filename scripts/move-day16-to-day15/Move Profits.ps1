param(
    [string]$InstallDir = '',
    [string]$FromDate = '2026-10-16',
    [string]$ToDate = '2026-10-15'
)

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
if (-not $isAdmin) { throw 'Run Move Profits.bat as Administrator.' }

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
$runner = Join-Path $PSScriptRoot 'move-profits-16-to-15.cjs'
foreach ($required in @($node, $backup, $runner, (Join-Path $InstallDir '.env'))) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Required file missing: $required" }
}

$inspectionText = & $node $runner "--install-dir=$InstallDir" "--from-date=$FromDate" "--to-date=$ToDate" --inspect 2>&1
if ($LASTEXITCODE -ne 0) { throw "Preflight failed: $inspectionText" }
$inspection = $inspectionText | ConvertFrom-Json
$candidates = @($inspection.candidates | Where-Object { $_.eligible })
if ($candidates.Count -eq 0) {
    Write-Host "No eligible branches. Full inspect:" -ForegroundColor Yellow
    $inspection.candidates | Format-Table name, businessDate, revenueOrdersOnFrom, revenueOnFrom, reportToCount -AutoSize | Out-String | Write-Host
    throw "Nothing to move from $FromDate to $ToDate. Need business_date=$FromDate + revenue orders + one closed report on $ToDate."
}

Write-Host "`nBranches eligible ($FromDate -> $ToDate):" -ForegroundColor Cyan
foreach ($c in $candidates) {
    Write-Host ("- {0} [{1}] orders={2} revenue={3} report15_revenue={4}" -f $c.name, $c.id, $c.revenueOrdersOnFrom, $c.revenueOnFrom, $c.reportToRevenue)
}
Write-Host 'Branches business_date stays on 16. Closed report of 15 gets patched, no reopen.' -ForegroundColor Yellow
$confirmation = Read-Host 'Type MOVE to continue'
if ($confirmation -cne 'MOVE') { Write-Host 'Cancelled. Nothing changed.'; exit 0 }

$logDir = Join-Path $InstallDir 'logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$log = Join-Path $logDir ("move-profits-16-to-15-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
$tasksStopped = $false

try {
    Write-Host '[1/4] Backup...' -ForegroundColor Cyan
    & $node $backup 2>&1 | Tee-Object -FilePath $log
    if ($LASTEXITCODE -ne 0) { throw 'Verified database backup failed. Fix cancelled.' }

    Write-Host '[2/4] Stopping tasks (best-effort)...' -ForegroundColor Cyan
    try {
        foreach ($name in @('Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge')) { Run-Task 'End' $name }
        $tasksStopped = $true
        Get-CimInstance Win32_Process | Where-Object {
            $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.IndexOf($InstallDir, [StringComparison]::OrdinalIgnoreCase) -ge 0
        } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    } catch {
        Write-Host ("Stop-tasks skipped (non-fatal): {0}" -f $_.Exception.Message) -ForegroundColor Yellow
    }

    Write-Host '[3/4] Moving profits...' -ForegroundColor Cyan
    & $node $runner "--install-dir=$InstallDir" "--from-date=$FromDate" "--to-date=$ToDate" --confirm=MOVE >> $log 2>&1
    Write-Host ("runner exit: {0}" -f $LASTEXITCODE) -ForegroundColor Cyan
    Get-Content -LiteralPath $log -Tail 5 | Write-Host
    if ($LASTEXITCODE -ne 0) { throw 'Profit move failed. SQL transaction rolled back.' }

    Write-Host '[4/4] Restart + health...' -ForegroundColor Cyan
    Start-SystemTasks
    $tasksStopped = $false
    $healthy = $false
    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        Start-Sleep -Seconds 2
        try {
            $health = Invoke-RestMethod 'http://127.0.0.1:3001/api/health' -TimeoutSec 3
            if ($health.health.services.database.status -eq 'CONNECTED') { $healthy = $true; break }
        } catch { }
    }
    if (-not $healthy) { throw 'Profits moved, but server did not become healthy within 90 seconds. Review log and backup.' }

    @{ mode = 'MOVE_PROFITS_16_TO_15'; fromDate = $FromDate; toDate = $ToDate; appliedAt = (Get-Date).ToString('o'); log = $log } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $InstallDir 'move-profits-16-to-15-state.json') -Encoding UTF8
    Write-Host "`nSUCCESS. $FromDate is now zero, profits added to $ToDate. Log: $log" -ForegroundColor Green
    exit 0
} catch {
    if ($tasksStopped) { Start-SystemTasks }
    Write-Host "`nFAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Log: $log" -ForegroundColor Yellow
    exit 1
}
