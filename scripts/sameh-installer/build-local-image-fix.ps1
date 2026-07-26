param(
    [string]$OutputPath = '.\artifacts\local-image-fix',
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$artifacts = [IO.Path]::GetFullPath((Join-Path $repo 'artifacts')).TrimEnd('\') + '\'
$output = [IO.Path]::GetFullPath((Join-Path $repo $OutputPath))
if (-not $output.StartsWith($artifacts, [StringComparison]::OrdinalIgnoreCase)) { throw 'OutputPath must be inside the repository artifacts directory.' }
$stage = Join-Path $output 'RestoFlow Local Image Fix'

if (-not $SkipBuild) {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Application build failed.' }
}

if (-not (Test-Path -LiteralPath (Join-Path $repo 'dist\index.html'))) { throw 'Frontend build is missing.' }
if (-not (Test-Path -LiteralPath (Join-Path $repo 'dist-server\index.cjs'))) { throw 'Server build is missing.' }

if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $stage 'payload\dist-server'), (Join-Path $stage 'payload\dist'), (Join-Path $stage 'payload\runtime') -Force | Out-Null
Copy-Item -Path (Join-Path $PSScriptRoot 'local-image-fix\*') -Destination $stage -Recurse -Force
Copy-Item -LiteralPath (Join-Path $repo 'dist-server\index.cjs') -Destination (Join-Path $stage 'payload\dist-server\index.cjs') -Force
Copy-Item -Path (Join-Path $repo 'dist\*') -Destination (Join-Path $stage 'payload\dist') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'runtime\database-backup.cjs') -Destination (Join-Path $stage 'payload\runtime\database-backup.cjs') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'runtime\database-restore.cjs') -Destination (Join-Path $stage 'payload\runtime\database-restore.cjs') -Force

$payloadRoot = Join-Path $stage 'payload'
$manifest = Get-ChildItem -LiteralPath $payloadRoot -File -Recurse | ForEach-Object {
    [PSCustomObject]@{
        path = $_.FullName.Substring($payloadRoot.Length + 1)
        sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}
[IO.File]::WriteAllText((Join-Path $stage 'payload-manifest.json'), ($manifest | ConvertTo-Json), [Text.UTF8Encoding]::new($false))

$zip = Join-Path $output 'RestoFlow Local Image Fix.zip'
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
$zipHash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $output 'RestoFlow Local Image Fix.sha256.txt'), "$zipHash  RestoFlow Local Image Fix.zip`r`n", [Text.UTF8Encoding]::new($false))
Write-Host "Built: $zip"
