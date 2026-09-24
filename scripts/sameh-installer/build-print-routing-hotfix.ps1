# Builds two small customer hotfixes for the print-routing/bridge changes.
# The server package contains the API + frontend; the cashier package contains
# the frontend + bridge. Neither package contains SQL data or customer secrets.
param(
    [string]$Version = '',
    [string]$OutputPath = '',
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$package = Get-Content (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json
if (-not $Version) { $Version = $package.version }
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
if (-not $OutputPath) { $OutputPath = Join-Path $repo "RestoFlow-PrintRouting-HotFix-$Version-$stamp" }
$root = [IO.Path]::GetFullPath($OutputPath)

function Copy-Tree([string]$Source, [string]$Destination) {
    if (-not (Test-Path -LiteralPath $Source)) { throw "Missing build input: $Source" }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Copy-Item (Join-Path $Source '*') $Destination -Recurse -Force
}
function New-Package([string]$Role) {
    $out = Join-Path $root $Role
    $payload = Join-Path $out 'payload'
    New-Item -ItemType Directory -Force -Path $payload | Out-Null
    Copy-Tree (Join-Path $repo 'dist') (Join-Path $payload 'dist')
    if ($Role -eq 'Server') {
        New-Item -ItemType Directory -Force -Path (Join-Path $payload 'dist-server') | Out-Null
        Copy-Item (Join-Path $repo 'dist-server\index.cjs') (Join-Path $payload 'dist-server\index.cjs') -Force
    } else {
        New-Item -ItemType Directory -Force -Path (Join-Path $payload 'hardware-bridge') | Out-Null
        foreach ($file in @('index.js', 'png-raster.js')) {
            Copy-Item (Join-Path $repo "hardware-bridge\$file") (Join-Path $payload "hardware-bridge\$file") -Force
        }
    }
    Copy-Item (Join-Path $PSScriptRoot 'print-routing-hotfix\Apply Print Routing Hotfix.bat') (Join-Path $out 'Apply Print Routing Hotfix.bat') -Force
    Copy-Item (Join-Path $PSScriptRoot 'print-routing-hotfix\Apply Print Routing Hotfix.ps1') (Join-Path $out 'Apply Print Routing Hotfix.ps1') -Force
    Set-Content (Join-Path $out 'VERSION.txt') @(
        "RestoFlow Print Routing Hotfix",
        "Role: $Role",
        "Version: $Version",
        "Built: $(Get-Date -Format 'yyyy-MM-dd HH:mm')",
        'Changes: explicit printer routing, faster bridge capability registration, duplicate-print protection.'
    ) -Encoding UTF8
    Set-Content (Join-Path $out 'README AR.txt') @(
        'RestoFlow Print Routing Update',
        "Package role: $Role",
        '',
        '1) Copy the complete package folder to the customer device.',
        '2) Run Apply Print Routing Hotfix.bat as Administrator.',
        '3) Wait for SUCCESS, open the app, and press Ctrl+F5.',
        '4) No database or printer settings are deleted. A rollback is created before changes.',
        '',
        'Important: Server package is for the server only; Cashier package is for the cashier only.'
    ) -Encoding UTF8
    $zip = "$out.zip"
    if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
    Compress-Archive -LiteralPath $out -DestinationPath $zip -Force
    $hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash
    Set-Content "$out.sha256.txt" "$hash  $(Split-Path -Leaf $zip)" -Encoding ASCII
    return $zip
}

Push-Location $repo
try {
    if (-not $SkipBuild) {
        Write-Host '>> Building frontend and server once...' -ForegroundColor Cyan
        npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Application build failed.' }
    }
    foreach ($required in @(
        (Join-Path $repo 'dist\index.html'),
        (Join-Path $repo 'dist-server\index.cjs'),
        (Join-Path $repo 'hardware-bridge\index.js'),
        (Join-Path $repo 'hardware-bridge\png-raster.js')
    )) { if (-not (Test-Path -LiteralPath $required)) { throw "Required file is missing: $required" } }
    if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $root | Out-Null
    $serverZip = New-Package 'Server'
    $cashierZip = New-Package 'Cashier'
    Write-Host "`nServer package: $serverZip" -ForegroundColor Green
    Write-Host "Cashier package: $cashierZip" -ForegroundColor Green
} finally { Pop-Location }
