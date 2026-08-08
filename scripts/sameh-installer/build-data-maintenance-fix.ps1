param([string]$OutputPath = '.\artifacts\data-maintenance-fix')

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$output = [IO.Path]::GetFullPath((Join-Path $repo $OutputPath))
$stage = Join-Path $output 'RestoFlow Data Maintenance FIX'

if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null
Copy-Item -Path (Join-Path $PSScriptRoot 'data-maintenance-fix\*') -Destination $stage -Recurse -Force

$zip = Join-Path $output 'RestoFlow Data Maintenance FIX.zip'
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
$hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath (Join-Path $output 'SHA256.txt') -Value "$hash  RestoFlow Data Maintenance FIX.zip" -Encoding Ascii
Write-Host "Built: $zip"
Write-Host "SHA256: $hash"
