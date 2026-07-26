param([string]$OutputPath = '.\artifacts\operational-reset')

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$output = [IO.Path]::GetFullPath((Join-Path $repo $OutputPath))
$stage = Join-Path $output 'RestoFlow Clean Operational Start'

if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null
Copy-Item -Path (Join-Path $PSScriptRoot 'operational-reset\*') -Destination $stage -Recurse -Force

$zip = Join-Path $output 'RestoFlow Clean Operational Start.zip'
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
Write-Host "Built: $zip"
