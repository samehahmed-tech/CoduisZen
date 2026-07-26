param(
    [string]$OutputPath = '.\artifacts\catalog-data-update',
    [string]$SqlFile = ''
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$output = [IO.Path]::GetFullPath((Join-Path $repo $OutputPath))
$stage = Join-Path $output 'RestoFlow Catalog Data Update'
if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

$source = Join-Path $PSScriptRoot 'catalog-update'
Copy-Item -Path (Join-Path $source '*') -Destination $stage -Recurse -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'runtime\apply-catalog-sql.cjs') -Destination $stage -Force
if ($SqlFile) { Copy-Item -LiteralPath ([IO.Path]::GetFullPath($SqlFile)) -Destination $stage -Force }

$zip = Join-Path $output 'RestoFlow Catalog Data Update.zip'
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
Write-Host "Built: $zip"
