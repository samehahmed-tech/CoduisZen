param([string]$OutputPath = '.\artifacts\business-day-reopen-fix')

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$artifacts = [IO.Path]::GetFullPath((Join-Path $repo 'artifacts')).TrimEnd('\') + '\'
$output = [IO.Path]::GetFullPath((Join-Path $repo $OutputPath))
if (-not $output.StartsWith($artifacts, [StringComparison]::OrdinalIgnoreCase)) { throw 'OutputPath must be inside repository artifacts directory.' }
$stage = Join-Path $output 'RestoFlow Reopen Business Day'

& node.exe (Join-Path $PSScriptRoot 'business-day-reopen-fix\reopen-business-day.cjs') --self-test
if ($LASTEXITCODE -ne 0) { throw 'Reopen script self-test failed.' }

if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null
Copy-Item -Path (Join-Path $PSScriptRoot 'business-day-reopen-fix\*') -Destination $stage -Recurse -Force

$zip = Join-Path $output 'RestoFlow Reopen Business Day.zip'
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
$zipHash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $output 'RestoFlow Reopen Business Day.sha256.txt'), "$zipHash  RestoFlow Reopen Business Day.zip`r`n", [Text.UTF8Encoding]::new($false))
Write-Host "Built: $zip"
