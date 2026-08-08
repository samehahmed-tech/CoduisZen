param([string]$OutputPath = '.\artifacts\table-pos-fix')

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$artifacts = [IO.Path]::GetFullPath((Join-Path $repo 'artifacts')).TrimEnd('\') + '\'
$output = [IO.Path]::GetFullPath((Join-Path $repo $OutputPath))
if (-not $output.StartsWith($artifacts, [StringComparison]::OrdinalIgnoreCase)) { throw 'OutputPath must be inside the repository artifacts directory.' }
foreach ($required in @((Join-Path $repo 'dist\index.html'), (Join-Path $repo 'dist-server\index.cjs'))) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Build output missing: $required" }
}

$stage = Join-Path $output 'RestoFlow Final Upgrade Fix 1.1.22'
if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $stage 'payload\dist-server'), (Join-Path $stage 'payload\dist') -Force | Out-Null
Copy-Item -Path (Join-Path $PSScriptRoot 'table-pos-fix\*') -Destination $stage -Recurse -Force
Copy-Item -LiteralPath (Join-Path $repo 'dist-server\index.cjs') -Destination (Join-Path $stage 'payload\dist-server\index.cjs') -Force
Copy-Item -Path (Join-Path $repo 'dist\*') -Destination (Join-Path $stage 'payload\dist') -Recurse -Force

$payloadRoot = Join-Path $stage 'payload'
$manifest = Get-ChildItem -LiteralPath $payloadRoot -File -Recurse | ForEach-Object {
    [PSCustomObject]@{
        path = $_.FullName.Substring($payloadRoot.Length + 1)
        sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}
[IO.File]::WriteAllText((Join-Path $stage 'payload-manifest.json'), ($manifest | ConvertTo-Json), [Text.UTF8Encoding]::new($false))

$zip = Join-Path $output 'RestoFlow Final Upgrade Fix 1.1.22.zip'
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
$zipHash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $output 'RestoFlow Final Upgrade Fix 1.1.22.sha256.txt'), "$zipHash  RestoFlow Final Upgrade Fix 1.1.22.zip`r`n", [Text.UTF8Encoding]::new($false))
Write-Host "Built: $zip"
