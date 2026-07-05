param(
    [string]$Version = "",
    [string]$OutputPath = ".\artifacts\gui-installer",
    [string]$DatabaseUrl = "",
    [switch]$SkipBuild,
    [switch]$SkipNodeModules,
    [switch]$SkipDataExport
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$packageJson = Get-Content (Join-Path $repo "package.json") -Raw | ConvertFrom-Json
if (-not $Version) { $Version = $packageJson.version }

function Find-Iscc {
    $cmd = Get-Command "ISCC.exe" -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($path in @("${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe")) {
        if ($path -and (Test-Path $path)) { return $path }
    }
    throw "Install Inno Setup 6 to build Setup.exe."
}

function Copy-Clean($Source, $Destination) {
    if (Test-Path $Destination) { Remove-Item $Destination -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Copy-Item (Join-Path $Source "*") $Destination -Recurse -Force
}

function Get-DotEnvValue($Path, $Name) {
    if (-not (Test-Path $Path)) { return "" }
    foreach ($line in Get-Content $Path) {
        $text = $line.Trim()
        if (-not $text -or $text.StartsWith("#") -or -not $text.Contains("=")) { continue }
        $parts = $text.Split("=", 2)
        if ($parts[0].Trim() -eq $Name) { return $parts[1].Trim().Trim('"').Trim("'") }
    }
    return ""
}

function Find-PgDump {
    $cmd = Get-Command "pg_dump.exe" -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($path in @(
        "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\14\bin\pg_dump.exe"
    )) {
        if (Test-Path $path) { return $path }
    }
    return $null
}

$outRoot = Join-Path $repo $OutputPath
$stage = Join-Path $outRoot "stage"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

Set-Location $repo
if (-not $SkipBuild) {
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "Build failed." }
}

Copy-Clean (Join-Path $repo "dist") (Join-Path $stage "dist")
Copy-Clean (Join-Path $repo "dist-server") (Join-Path $stage "dist-server")
Copy-Clean (Join-Path $repo "public") (Join-Path $stage "public")
Copy-Clean (Join-Path $repo "drizzle") (Join-Path $stage "drizzle")
Copy-Item (Join-Path $repo "package.json") $stage -Force
Copy-Item (Join-Path $repo "package-lock.json") $stage -Force
New-Item -ItemType Directory -Force -Path (Join-Path $stage "scripts") | Out-Null
Copy-Item (Join-Path $repo "client-release\scripts\migrate.cjs") (Join-Path $stage "scripts\migrate.cjs") -Force
Copy-Clean (Join-Path $PSScriptRoot "runtime") (Join-Path $stage "runtime")
New-Item -ItemType Directory -Force -Path (Join-Path $stage "db\seed") | Out-Null

if (-not $SkipDataExport) {
    $databaseUrl = $DatabaseUrl
    if (-not $databaseUrl) { $databaseUrl = $env:DATABASE_URL }
    if (-not $databaseUrl) { $databaseUrl = Get-DotEnvValue (Join-Path $repo ".env.local") "DATABASE_URL" }
    if (-not $databaseUrl) { $databaseUrl = Get-DotEnvValue (Join-Path $repo ".env") "DATABASE_URL" }
    $pgDump = Find-PgDump
    if ($databaseUrl -and $pgDump) {
        $dumpPath = Join-Path $stage "db\seed\current-data.sql"
        & $pgDump $databaseUrl --data-only --inserts --column-inserts --no-owner --no-privileges -f $dumpPath
        if ($LASTEXITCODE -ne 0) { Write-Warning "Data export failed. Setup will install without included data." }
    } else {
        Write-Warning "DATABASE_URL or pg_dump not found. Setup will install without included data."
    }
}

$node = (Get-Command "node.exe" -ErrorAction Stop).Source
Copy-Item $node (Join-Path $stage "runtime\node.exe") -Force

$bridgeStage = Join-Path $stage "hardware-bridge"
New-Item -ItemType Directory -Force -Path $bridgeStage | Out-Null
Get-ChildItem (Join-Path $repo "hardware-bridge") -Force |
    Where-Object { $_.Name -notin @("node_modules", ".env", "data") } |
    ForEach-Object { Copy-Item $_.FullName (Join-Path $bridgeStage $_.Name) -Recurse -Force }

if (-not $SkipNodeModules) {
    $env:PUPPETEER_SKIP_DOWNLOAD = "true"
    $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1"
    Push-Location $stage
    try {
        npm.cmd ci --omit=dev --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed in stage." }
    } finally { Pop-Location }
    Push-Location $bridgeStage
    try {
        npm.cmd ci --omit=dev --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed in bridge." }
    } finally { Pop-Location }
}

$env:RESTOFLOW_STAGE_DIR = $stage
$env:RESTOFLOW_OUTPUT_DIR = $outRoot
$env:RESTOFLOW_INSTALLER_VERSION = $Version
& (Find-Iscc) (Join-Path $PSScriptRoot "restoflow-gui-installer.iss")
if ($LASTEXITCODE -ne 0) { throw "Inno Setup build failed." }

Write-Host "Setup.exe: $(Join-Path $outRoot "RestoFlow-ERP-GUI-Setup-$Version.exe")" -ForegroundColor Green
