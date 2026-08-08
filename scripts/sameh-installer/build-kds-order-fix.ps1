param([string]$OutputPath = '.\artifacts\kds-order-fix')

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$artifacts = [IO.Path]::GetFullPath((Join-Path $repo 'artifacts')).TrimEnd('\') + '\'
$output = [IO.Path]::GetFullPath((Join-Path $repo $OutputPath))
if (-not $output.StartsWith($artifacts, [StringComparison]::OrdinalIgnoreCase)) { throw 'OutputPath must be inside the repository artifacts directory.' }

& npm.cmd run build:server
if ($LASTEXITCODE -ne 0) { throw 'Server build failed.' }

$stage = Join-Path $output 'RestoFlow KDS Order Fix 1.1.24'
if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $stage 'payload\dist-server') -Force | Out-Null
Copy-Item -Path (Join-Path $PSScriptRoot 'kds-order-fix\*') -Destination $stage -Recurse -Force
Copy-Item -LiteralPath (Join-Path $repo 'dist-server\index.cjs') -Destination (Join-Path $stage 'payload\dist-server\index.cjs') -Force

$payload = Join-Path $stage 'payload\dist-server\index.cjs'
$manifest = @(@{ path = 'dist-server\index.cjs'; sha256 = (Get-FileHash -LiteralPath $payload -Algorithm SHA256).Hash.ToLowerInvariant() })
[IO.File]::WriteAllText((Join-Path $stage 'payload-manifest.json'), ($manifest | ConvertTo-Json), [Text.UTF8Encoding]::new($false))

$zip = Join-Path $output 'RestoFlow KDS Order Fix 1.1.24.zip'
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
$hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $output 'RestoFlow KDS Order Fix 1.1.24.sha256.txt'), "$hash  RestoFlow KDS Order Fix 1.1.24.zip`r`n", [Text.UTF8Encoding]::new($false))
Write-Host "Built: $zip"
