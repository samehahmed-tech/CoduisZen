param(
    [string]$InstallDir = '',
    [string]$TargetDate = '2026-07-21'
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
if (-not $isAdmin) { throw 'Run Reopen Business Day.bat as Administrator.' }

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
$runner = Join-Path $PSScriptRoot 'reopen-business-day.cjs'
foreach ($required in @($node, $backup, $runner, (Join-Path $InstallDir '.env'))) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Required file missing: $required" }
}

$inspectionText = & $node $runner "--install-dir=$InstallDir" "--target-date=$TargetDate" --inspect 2>&1
if ($LASTEXITCODE -ne 0) { throw "Preflight failed: $inspectionText" }
$inspection = $inspectionText | ConvertFrom-Json
$candidates = @($inspection.candidates)
if ($candidates.Count -eq 0) { throw "No branch can be safely reopened for $TargetDate. Fix may already be applied or branch state differs." }

if ($candidates.Count -eq 1) {
    $selected = $candidates[0]
} else {
    Write-Host "`nBranches eligible for $TargetDate`:" -ForegroundColor Cyan
    for ($index = 0; $index -lt $candidates.Count; $index++) {
        Write-Host ("{0}) {1} [{2}]" -f ($index + 1), $candidates[$index].name, $candidates[$index].id)
    }
    $selection = 0
    if (-not [int]::TryParse((Read-Host 'Select branch number'), [ref]$selection) -or $selection -lt 1 -or $selection -gt $candidates.Count) {
        throw 'Invalid branch selection.'
    }
    $selected = $candidates[$selection - 1]
}

if ([int64]$selected.ordersOnNextDate -ne 0 -or [int64]$selected.shiftsOnNextDate -ne 0) {
    throw "Next-day activity exists. orders=$($selected.ordersOnNextDate), shifts=$($selected.shiftsOnNextDate). Manual review required."
}

Write-Host "`nBranch: $($selected.name) [$($selected.id)]" -ForegroundColor Yellow
Write-Host "Business Date: $($selected.businessDate) -> $TargetDate"
Write-Host 'The incorrect close snapshot will be removed. Orders, payments, stock, and audit history stay untouched.'
$confirmation = Read-Host 'Type REOPEN to continue'
if ($confirmation -cne 'REOPEN') { Write-Host 'Cancelled. Nothing changed.'; exit 0 }

$logDir = Join-Path $InstallDir 'logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$log = Join-Path $logDir ("business-day-reopen-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
$tasksStopped = $false

try {
    & $node $backup 2>&1 | Tee-Object -FilePath $log
    if ($LASTEXITCODE -ne 0) { throw 'Verified database backup failed. Fix cancelled.' }

    foreach ($name in @('Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge')) { Run-Task 'End' $name }
    $tasksStopped = $true
    Get-CimInstance Win32_Process | Where-Object {
        $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.IndexOf($InstallDir, [StringComparison]::OrdinalIgnoreCase) -ge 0
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

    & $node $runner "--install-dir=$InstallDir" "--target-date=$TargetDate" "--branch-id=$($selected.id)" --confirm=REOPEN 2>&1 | Tee-Object -FilePath $log -Append
    if ($LASTEXITCODE -ne 0) { throw 'Business day reopen failed. SQL transaction rolled back.' }

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
    if (-not $healthy) { throw 'Day reopened, but server did not become healthy within 90 seconds. Review log and backup.' }

    @{ mode = 'BUSINESS_DAY_REOPEN'; branchId = $selected.id; targetDate = $TargetDate; appliedAt = (Get-Date).ToString('o'); log = $log } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $InstallDir 'business-day-reopen-state.json') -Encoding UTF8
    Write-Host "`nSUCCESS. Business Date is $TargetDate. Log: $log" -ForegroundColor Green
    exit 0
} catch {
    if ($tasksStopped) { Start-SystemTasks }
    Write-Host "`nFAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Log: $log" -ForegroundColor Yellow
    exit 1
}
