param(
    [string]$Version = "",
    [string]$OutputPath = ".\artifacts\sameh-installer",
    [string]$SqlExpressInstaller = "",
    [string]$OdbcDriverInstaller = "",
    [string]$VCRedistInstaller = "",
    [switch]$AllowMissingPrerequisites,
    [switch]$SkipBuild,
    [switch]$SkipDependencies
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$package = Get-Content (Join-Path $repo "package.json") -Raw | ConvertFrom-Json
if (-not $Version) { $Version = $package.version }

function Find-Iscc {
    $command = Get-Command ISCC.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    foreach ($candidate in @("${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe")) {
        if ($candidate -and (Test-Path $candidate)) { return $candidate }
    }
    throw "Inno Setup 6 is required: https://jrsoftware.org/isdl.php"
}

function Copy-Clean([string]$Source, [string]$Destination) {
    if (Test-Path $Destination) { Remove-Item -LiteralPath $Destination -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Copy-Item (Join-Path $Source "*") $Destination -Recurse -Force
}

function Copy-MicrosoftPrerequisite([string]$Source, [string]$Destination, [string]$Name) {
    if (-not $Source) {
        if ($AllowMissingPrerequisites) {
            Write-Warning "$Name is not bundled."
            return
        }
        throw "$Name is required for a clean-PC installer."
    }
    if (-not (Test-Path $Source)) { throw "$Name not found: $Source" }
    $signature = Get-AuthenticodeSignature -LiteralPath $Source
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft') {
        throw "$Name must have a valid Microsoft Authenticode signature: $Source"
    }
    Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

$out = [IO.Path]::GetFullPath((Join-Path $repo $OutputPath))
$stage = Join-Path $out "stage"
if (Test-Path $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

Push-Location $repo
try {
    if (-not $SkipBuild) {
        npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw "Application build failed." }
    }

    foreach ($folder in @("dist", "dist-server", "public", "hardware-bridge")) {
        $source = Join-Path $repo $folder
        if (-not (Test-Path $source)) { throw "Missing build input: $source" }
        Copy-Clean $source (Join-Path $stage $folder)
    }
    Get-ChildItem (Join-Path $stage "dist-server") -Filter "*.map" -Recurse | Remove-Item -Force
    Copy-Clean (Join-Path $PSScriptRoot "runtime") (Join-Path $stage "runtime")
    Copy-Clean (Join-Path $PSScriptRoot "data-maintenance-fix") (Join-Path $stage "maintenance")
    Copy-Item (Join-Path $PSScriptRoot "hotfix\create-recovery-admin.cjs") (Join-Path $stage "runtime\create-recovery-admin.cjs") -Force
    Copy-Item (Join-Path $PSScriptRoot "table-pos-fix\reset-tables.cjs") (Join-Path $stage "runtime\reset-tables.cjs") -Force
    $tokenBytes = New-Object byte[] 48
    $tokenGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $tokenGenerator.GetBytes($tokenBytes) } finally { $tokenGenerator.Dispose() }
    $bridgeToken = [Convert]::ToBase64String($tokenBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    Set-Content -Path (Join-Path $stage "runtime\bridge-package-token") -Value $bridgeToken -NoNewline
    New-Item -ItemType Directory -Force -Path (Join-Path $stage "database") | Out-Null
    Copy-Item (Join-Path $repo "scripts\sql-server-schema.sql") (Join-Path $stage "database\empty-schema.sql") -Force
    Copy-Item (Join-Path $repo "scripts\sqlserver-schema-repair.sql") (Join-Path $stage "database\schema-repair.sql") -Force
    Copy-Item (Join-Path $repo "src\db\schema.ts") (Join-Path $stage "database\schema.ts") -Force
    Copy-Item (Join-Path $PSScriptRoot "daily-order-number-fix\migrate-daily-order-number.sql") (Join-Path $stage "database\daily-order-number.sql") -Force
    Copy-Item (Join-Path $repo "package.json"), (Join-Path $repo "package-lock.json") $stage -Force

    $node = (Get-Command node.exe -ErrorAction Stop).Source
    Copy-Item $node (Join-Path $stage "runtime\node.exe") -Force

    if (-not $SkipDependencies) {
        $env:PUPPETEER_SKIP_DOWNLOAD = "true"
        $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1"
        Push-Location $stage
        try {
            npm.cmd ci --omit=dev --no-audit --no-fund --legacy-peer-deps
            if ($LASTEXITCODE -ne 0) { throw "Server dependency packaging failed." }
        } finally { Pop-Location }
        Push-Location (Join-Path $stage "hardware-bridge")
        try {
            npm.cmd ci --omit=dev --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) { throw "Bridge dependency packaging failed." }
        } finally { Pop-Location }
    } else {
        if (-not (Test-Path (Join-Path $repo "node_modules"))) { throw "node_modules is required with -SkipDependencies." }
        Copy-Clean (Join-Path $repo "node_modules") (Join-Path $stage "node_modules")
    }

    New-Item -ItemType Directory -Force -Path (Join-Path $stage "prerequisites") | Out-Null
    Copy-MicrosoftPrerequisite $SqlExpressInstaller (Join-Path $stage "prerequisites\SQLEXPR_x64_ENU.exe") "SQL Server Express offline media"
    Copy-MicrosoftPrerequisite $OdbcDriverInstaller (Join-Path $stage "prerequisites\msodbcsql.msi") "Microsoft ODBC Driver 18 x64"
    Copy-MicrosoftPrerequisite $VCRedistInstaller (Join-Path $stage "prerequisites\vc_redist.x64.exe") "Microsoft Visual C++ x64 Redistributable"

    $recovery = Join-Path $stage "recovery"
    New-Item -ItemType Directory -Force -Path $recovery | Out-Null
    $criticalFiles = @(
        @{ Target = "runtime\setup-agent.cjs"; Role = "all" },
        @{ Target = "runtime\health-gate.cjs"; Role = "all" },
        @{ Target = "runtime\log-file.cjs"; Role = "all" },
        @{ Target = "runtime\hidden-runner.vbs"; Role = "all" },
        @{ Target = "runtime\supervisor.cjs"; Role = "all" },
        @{ Target = "runtime\watchdog.cjs"; Role = "all" },
        @{ Target = "runtime\monitor.cjs"; Role = "all" },
        @{ Target = "runtime\port-guard.cjs"; Role = "all" },
        @{ Target = "runtime\schema-doctor.cjs"; Role = "server" },
        @{ Target = "runtime\reset-tables.cjs"; Role = "server" },
        @{ Target = "database\daily-order-number.sql"; Role = "server" },
        @{ Target = "runtime\create-recovery-admin.cjs"; Role = "server" },
        @{ Target = "runtime\bridge-runner.cjs"; Role = "all" },
        @{ Target = "hardware-bridge\index.js"; Role = "all" },
        @{ Target = "hardware-bridge\png-raster.js"; Role = "all" },
        @{ Target = "dist-server\index.cjs"; Role = "server" },
        @{ Target = "dist\index.html"; Role = "server" }
    )
    $manifest = foreach ($entry in $criticalFiles) {
        $source = Join-Path $stage $entry.Target
        if (-not (Test-Path $source)) { throw "Critical recovery file missing: $source" }
        $destination = Join-Path $recovery $entry.Target
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
        Copy-Item $source $destination -Force
        [ordered]@{ target = $entry.Target; recovery = $entry.Target; role = $entry.Role; sha256 = (Get-FileHash $source -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
    $manifestJson = $manifest | ConvertTo-Json
    [IO.File]::WriteAllText((Join-Path $recovery "manifest.json"), $manifestJson, (New-Object Text.UTF8Encoding($false)))

    $env:SAMEH_STAGE_DIR = $stage
    $env:SAMEH_OUTPUT_DIR = $out
    $env:SAMEH_INSTALLER_VERSION = $Version
    & (Find-Iscc) (Join-Path $PSScriptRoot "sameh-installer.iss")
    if ($LASTEXITCODE -ne 0) { throw "Inno Setup build failed." }
} finally {
    Pop-Location
}

Write-Host "Built: $(Join-Path $out "Codeuis Setup V2.exe")" -ForegroundColor Green
