param([string]$OutputPath = '.\artifacts\order-save-fix')

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$output = [IO.Path]::GetFullPath((Join-Path $repo $OutputPath))
$stage = Join-Path $output 'RestoFlow Order Save Fix'

& npm.cmd run build:server
if ($LASTEXITCODE -ne 0) { throw 'Server build failed.' }

if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $stage 'payload\dist-server'), (Join-Path $stage 'payload\dist') -Force | Out-Null
Copy-Item -Path (Join-Path $PSScriptRoot 'order-save-fix\*') -Destination $stage -Recurse -Force
Copy-Item -LiteralPath (Join-Path $repo 'dist-server\index.cjs') -Destination (Join-Path $stage 'payload\dist-server\index.cjs') -Force
Copy-Item -LiteralPath (Join-Path $repo 'public\kdslite.html') -Destination (Join-Path $stage 'payload\dist\kdslite.html') -Force

$zip = Join-Path $output 'RestoFlow Order Save Fix.zip'
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
Write-Host "Built: $zip"
