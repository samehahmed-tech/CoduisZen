param([string]$SqlFile = '', [string]$InstallDir = '')

$ErrorActionPreference = 'Stop'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    if ($SqlFile) { $arguments += " -SqlFile `"$SqlFile`"" }
    if ($InstallDir) { $arguments += " -InstallDir `"$InstallDir`"" }
    $elevated = Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments -Wait -PassThru
    exit $elevated.ExitCode
}
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

if (-not $SqlFile) {
    $candidate = Get-ChildItem -LiteralPath $PSScriptRoot -Filter 'RestoFlow-Catalog-Import-*.sql' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($candidate) { $SqlFile = $candidate.FullName }
}
if (-not $SqlFile) {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Filter = 'RestoFlow Catalog SQL (*.sql)|*.sql'
    if ($dialog.ShowDialog() -ne 'OK') { exit 0 }
    $SqlFile = $dialog.FileName
}

$SqlFile = [IO.Path]::GetFullPath($SqlFile)
$node = Join-Path $InstallDir 'runtime\node.exe'
$backup = Join-Path $InstallDir 'runtime\database-backup.cjs'
$runner = Join-Path $PSScriptRoot 'apply-catalog-sql.cjs'
foreach ($required in @($SqlFile, $node, $backup, $runner, (Join-Path $InstallDir '.env'))) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Required file missing: $required" }
}
if ((Get-Content -LiteralPath $SqlFile -TotalCount 1) -ne '-- RESTOFLOW_CATALOG_IMPORT_V1') { throw 'Invalid RestoFlow catalog SQL file.' }

$logDir = Join-Path $InstallDir 'logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$log = Join-Path $logDir ("catalog-update-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
$confirmation = Read-Host 'Type IMPORT to backup and add catalog data'
if ($confirmation -cne 'IMPORT') { Write-Host 'Cancelled. Nothing changed.'; exit 0 }

& $node $backup 2>&1 | Tee-Object -FilePath $log
if ($LASTEXITCODE -ne 0) { throw 'Backup failed. Update cancelled.' }
& $node $runner "--install-dir=$InstallDir" "--file=$SqlFile" --confirm=IMPORT 2>&1 | Tee-Object -FilePath $log -Append
if ($LASTEXITCODE -ne 0) { throw 'Update failed. SQL transaction rolled back.' }
New-Item -ItemType File -Path (Join-Path $InstallDir 'runtime\restart.request') -Force | Out-Null
Write-Host "`nSUCCESS. Log: $log" -ForegroundColor Green
