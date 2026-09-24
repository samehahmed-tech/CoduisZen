param(
    [string]$Version = '',
    [string]$OutputPath = '',
    [string]$Description = '',
    [switch]$SkipBuild,
    [switch]$NoZip
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$package = Get-Content (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json
if (-not $Version) { $Version = $package.version }
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
if (-not $OutputPath) { $OutputPath = Join-Path $repo "RestoFlow-PrintBridge-HotFix-$Version-$stamp" }
$out = [IO.Path]::GetFullPath($OutputPath)
$payload = Join-Path $out 'payload'
function Copy-Tree([string]$Source, [string]$Destination) {
    if (-not (Test-Path -LiteralPath $Source)) { throw "Missing build input: $Source" }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Copy-Item (Join-Path $Source '*') $Destination -Recurse -Force
}
Push-Location $repo
try {
    if (-not $SkipBuild) {
        Write-Host '>> Building frontend and server...' -ForegroundColor Cyan
        npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Application build failed.' }
    }
    foreach ($required in @(
        (Join-Path $repo 'dist\index.html'),
        (Join-Path $repo 'dist-server\index.cjs'),
        (Join-Path $repo 'hardware-bridge\index.js'),
        (Join-Path $repo 'hardware-bridge\png-raster.js')
    )) { if (-not (Test-Path -LiteralPath $required)) { throw "Required file is missing: $required" } }
    if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $payload | Out-Null
    Copy-Tree (Join-Path $repo 'dist') (Join-Path $payload 'dist')
    New-Item -ItemType Directory -Force -Path (Join-Path $payload 'dist-server'), (Join-Path $payload 'hardware-bridge') | Out-Null
    Copy-Item (Join-Path $repo 'dist-server\index.cjs') (Join-Path $payload 'dist-server\index.cjs') -Force
    Copy-Item (Join-Path $repo 'hardware-bridge\index.js') (Join-Path $payload 'hardware-bridge\index.js') -Force
    Copy-Item (Join-Path $repo 'hardware-bridge\png-raster.js') (Join-Path $payload 'hardware-bridge\png-raster.js') -Force
    Copy-Item (Join-Path $PSScriptRoot 'print-bridge-hotfix\Apply Print Bridge Hotfix.bat') (Join-Path $out 'Apply Print Bridge Hotfix.bat') -Force
    Copy-Item (Join-Path $PSScriptRoot 'print-bridge-hotfix\Apply Print Bridge Hotfix.ps1') (Join-Path $out 'Apply Print Bridge Hotfix.ps1') -Force
    Set-Content (Join-Path $out 'VERSION.txt') @(
        'RestoFlow Print Bridge Hotfix',
        "Version: $Version",
        "Built: $(Get-Date -Format 'yyyy-MM-dd HH:mm')",
        "Changes: $Description"
    ) -Encoding UTF8
    Set-Content (Join-Path $out 'README AR.txt') @(
        'RestoFlow Print Bridge Hotfix',
        "Version: $Version",
        '',
        'Use this same ZIP on the Server and Cashier machines.',
        'Extract it anywhere outside Program Files, then run Apply Print Bridge Hotfix.bat as Administrator.',
        'The script detects the installed role automatically.',
        'No database backup, schema change, or printer setting deletion is performed.',
        'A file rollback is created before applying the update.'
    ) -Encoding UTF8
    if (-not $NoZip) {
        $zip = "$out.zip"
        if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
        Compress-Archive -LiteralPath $out -DestinationPath $zip -Force
        $hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash
        Set-Content "$out.sha256.txt" "$hash  $(Split-Path -Leaf $zip)" -Encoding ASCII
        Write-Host "Package: $zip" -ForegroundColor Green
    } else { Write-Host "Package folder: $out" -ForegroundColor Green }
} finally { Pop-Location }
