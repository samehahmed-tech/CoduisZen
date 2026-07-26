$ErrorActionPreference = 'Stop'

function Read-Default([string]$Prompt, [string]$Default) {
    $response = Read-Host "$Prompt [$Default]"
    if ([string]::IsNullOrWhiteSpace($response)) { return $Default }
    return $response.Trim()
}

$node = Join-Path $PSScriptRoot 'node.exe'
if (-not (Test-Path -LiteralPath $node)) { $node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source }
if (-not $node) { throw 'Node.js is required on the export computer.' }
$exporter = Join-Path $PSScriptRoot 'export-postgres-catalog-sql.cjs'
$output = Join-Path $PSScriptRoot ("RestoFlow-Catalog-Import-{0}.sql" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

$env:PGHOST = Read-Default 'PostgreSQL host' '127.0.0.1'
$env:PGPORT = Read-Default 'PostgreSQL port' '5432'
$env:PGDATABASE = Read-Default 'PostgreSQL database' 'restoflow'
$env:PGUSER = Read-Default 'PostgreSQL user' 'postgres'
$env:PGSCHEMA = Read-Default 'PostgreSQL schema' 'public'
$env:PGSSL = if ((Read-Default 'Use SSL? y/n' 'n') -match '^(y|yes)$') { 'true' } else { 'false' }
$securePassword = Read-Host 'PostgreSQL password' -AsSecureString
$passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPtr)
    & $node $exporter "--output=$output"
    if ($LASTEXITCODE -ne 0) { throw 'Export failed.' }
    Write-Host "`nSUCCESS: $output" -ForegroundColor Green
} finally {
    $env:PGPASSWORD = $null
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr)
}
