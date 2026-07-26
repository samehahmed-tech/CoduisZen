param([string]$OutputPath = '.\artifacts\catalog-data-export')

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$output = [IO.Path]::GetFullPath((Join-Path $repo $OutputPath))
$stage = Join-Path $output 'RestoFlow PostgreSQL Catalog Export'
if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

Copy-Item -Path (Join-Path $PSScriptRoot 'data-export\*') -Destination $stage -Recurse -Force
Copy-Item -LiteralPath (Get-Command node.exe).Source -Destination (Join-Path $stage 'node.exe') -Force
& npm.cmd install --prefix $stage --omit=dev --legacy-peer-deps --no-audit --no-fund pg@8.22.0
if ($LASTEXITCODE -ne 0) { throw 'Failed to package PostgreSQL driver.' }

$zip = Join-Path $output 'RestoFlow PostgreSQL Catalog Export.zip'
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
Write-Host "Built: $zip"
