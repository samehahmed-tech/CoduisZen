$ErrorActionPreference = 'Stop'
Remove-Item "scripts\sameh-installer\latest-fixes\latest-fixes.zip" -Force -ErrorAction SilentlyContinue
$zip = "RestoFlow-Latest-Fixes-2026-09-02-v6.zip"
$workZip = Join-Path $env:TEMP "restoflow-latest-fixes-$([guid]::NewGuid().ToString('N')).zip"
Compress-Archive -Path "scripts\sameh-installer\latest-fixes\*" -DestinationPath $workZip -CompressionLevel Optimal
Copy-Item $workZip $zip -Force
$workZip = $null
$desktop = [Environment]::GetFolderPath('Desktop')
$dest = Join-Path $desktop $zip
try {
    Remove-Item $dest -Force -ErrorAction SilentlyContinue
    Copy-Item $zip $dest -Force
} catch {
    Write-Warning "ZIP created in the repository, but desktop copy was skipped: $($_.Exception.Message)"
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $zip).Path)
Write-Host ("ZIP OK: {0} entries" -f $z.Entries.Count)
$z.Dispose()
Get-Item $zip | Select-Object FullName, @{N='SizeMB';E={[math]::Round($_.Length/1MB,1)}}
