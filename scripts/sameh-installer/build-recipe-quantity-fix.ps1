param(
    [string]$OutputPath = '.\artifacts\recipe-quantity-fix',
    [string]$FrontendPath = '.\dist'
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$artifacts = [IO.Path]::GetFullPath((Join-Path $repo 'artifacts')).TrimEnd('\') + '\'
$output = [IO.Path]::GetFullPath((Join-Path $repo $OutputPath))
$frontend = [IO.Path]::GetFullPath((Join-Path $repo $FrontendPath))
if (-not $output.StartsWith($artifacts, [StringComparison]::OrdinalIgnoreCase)) { throw 'OutputPath must be inside the repository artifacts directory.' }
if (-not (Test-Path -LiteralPath (Join-Path $frontend 'index.html'))) { throw 'Frontend build is missing.' }

$stage = Join-Path $output 'RestoFlow Recipe Quantity Fix'
if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $stage 'payload\dist') -Force | Out-Null
Copy-Item -Path (Join-Path $PSScriptRoot 'recipe-quantity-fix\*') -Destination $stage -Recurse -Force
Copy-Item -Path (Join-Path $frontend '*') -Destination (Join-Path $stage 'payload\dist') -Recurse -Force

$payloadRoot = Join-Path $stage 'payload'
$manifest = Get-ChildItem -LiteralPath $payloadRoot -File -Recurse | ForEach-Object {
    [PSCustomObject]@{
        path = $_.FullName.Substring($payloadRoot.Length + 1)
        sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}
[IO.File]::WriteAllText((Join-Path $stage 'payload-manifest.json'), ($manifest | ConvertTo-Json), [Text.UTF8Encoding]::new($false))

$zip = Join-Path $output 'RestoFlow Recipe Quantity Fix.zip'
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
$zipHash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $output 'RestoFlow Recipe Quantity Fix.sha256.txt'), "$zipHash  RestoFlow Recipe Quantity Fix.zip`r`n", [Text.UTF8Encoding]::new($false))
Write-Host "Built: $zip"
