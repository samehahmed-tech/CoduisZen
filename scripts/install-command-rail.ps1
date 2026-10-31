param(
    [Parameter(Mandatory = $true)][string]$SourceDist,
    [Parameter(Mandatory = $true)][string]$InstallDir,
    [Parameter(Mandatory = $true)][string]$ResultFile
)

$ErrorActionPreference = 'Stop'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) { throw 'Administrator privileges are required.' }

$source = (Resolve-Path -LiteralPath $SourceDist).Path
$appRoot = (Resolve-Path -LiteralPath $InstallDir).Path.TrimEnd('\')
$target = (Resolve-Path -LiteralPath (Join-Path $appRoot 'dist')).Path
if (-not $target.StartsWith($appRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Resolved install target escaped the application directory.'
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$rollback = Join-Path $appRoot "updates\rollback-command-rail-$timestamp"
$rollbackDist = Join-Path $rollback 'dist'
New-Item -ItemType Directory -Path $rollback -Force | Out-Null
Copy-Item -LiteralPath $target -Destination $rollbackDist -Recurse -Force

$recoveryTarget = Join-Path $appRoot 'recovery\dist'
if (Test-Path -LiteralPath $recoveryTarget) {
    Copy-Item -LiteralPath $recoveryTarget -Destination (Join-Path $rollback 'recovery-dist') -Recurse -Force
}

Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $target -Recurse -Force
if (Test-Path -LiteralPath $recoveryTarget) {
    Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $recoveryTarget -Recurse -Force
}

$sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $source 'index.html')).Hash
$installedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $target 'index.html')).Hash
if ($sourceHash -ne $installedHash) { throw 'Installed index hash does not match the production build.' }

@{
    ok = $true
    installedAt = (Get-Date).ToString('o')
    rollback = $rollback
    sourceHash = $sourceHash
    installedHash = $installedHash
} | ConvertTo-Json | Set-Content -LiteralPath $ResultFile -Encoding UTF8
