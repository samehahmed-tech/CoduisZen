param(
    [string]$Version = "",
    [string]$OutputPath = "",
    [switch]$SkipBuild,
    [switch]$SkipDependencies,
    [switch]$AllowMissingPrerequisites
)

$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$package = Get-Content (Join-Path $repo "package.json") -Raw | ConvertFrom-Json
if (-not $Version) { $Version = $package.version }
if (-not $OutputPath) { $OutputPath = ".\\artifacts\\final-setup-$Version" }

$prerequisites = Join-Path $PSScriptRoot "prerequisites"
$builder = Join-Path $PSScriptRoot "build-sameh-installer.ps1"
$setupName = "Codeuis Setup V2.exe"

function Resolve-BundledFile([string]$Primary, [string]$FileName, [string]$Label) {
    if ($Primary -and (Test-Path $Primary)) { return $Primary }
    $fallback = Join-Path "$env:ProgramFiles\Sameh\RestoFlow ERP" $FileName
    if (Test-Path $fallback) {
        Write-Host "$Label not found in prerequisites; reusing copy from installed RestoFlow: $fallback" -ForegroundColor Yellow
        return $fallback
    }
    return $Primary
}

if (-not (Test-Path $builder)) {
    throw "Installer build script was not found: $builder"
}

$sqlExpress = Resolve-BundledFile (Join-Path $prerequisites "SQLEXPR_x64_ENU.exe") "SQLEXPR_x64_ENU.exe" "SQL Server Express media"
$odbc = Join-Path $prerequisites "msodbcsql.msi"
$vc = Join-Path $prerequisites "vc_redist.x64.exe"
if ($AllowMissingPrerequisites) {
    if (-not (Test-Path $sqlExpress)) { Write-Warning "SQL Server Express media not bundled; continuing without it."; $sqlExpress = "" }
    if (-not (Test-Path $odbc)) { Write-Warning "ODBC driver not bundled; continuing without it."; $odbc = "" }
    if (-not (Test-Path $vc)) { Write-Warning "VC redist not bundled; continuing without it."; $vc = "" }
}
if ($sqlExpress -and (Test-Path $sqlExpress)) { }
elseif (-not $AllowMissingPrerequisites) {
    throw "SQL Server Express offline media is required for a clean-PC installer. Place SQLEXPR_x64_ENU.exe in scripts\sameh-installer\prerequisites (or keep the installed RestoFlow copy), or rebuild with -AllowMissingPrerequisites."
}

$arguments = @{
    Version = $Version
    OutputPath = $OutputPath
    SqlExpressInstaller = $sqlExpress
    OdbcDriverInstaller = $odbc
    VCRedistInstaller = $vc
}

if ($SkipBuild) { $arguments.SkipBuild = $true }
if ($SkipDependencies) { $arguments.SkipDependencies = $true }
if ($AllowMissingPrerequisites) { $arguments.AllowMissingPrerequisites = $true }

Push-Location $repo
try {
    Write-Host "Building RestoFlow setup version $Version..." -ForegroundColor Cyan
    & $builder @arguments
    if ($LASTEXITCODE -ne 0) { throw "Installer build failed with exit code $LASTEXITCODE." }

    $setup = Join-Path ([IO.Path]::GetFullPath((Join-Path $repo $OutputPath))) $setupName
    if (-not (Test-Path $setup)) { throw "Expected setup file was not created: $setup" }

    $hash = (Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash
    $hashFile = Join-Path (Split-Path -Parent $setup) "Codeuis Setup V2.sha256.txt"
    [IO.File]::WriteAllText($hashFile, "$hash  $setupName`r`n", [Text.UTF8Encoding]::new($false))

    Write-Host ""
    Write-Host "Setup created: $setup" -ForegroundColor Green
    Write-Host "SHA-256 file: $hashFile" -ForegroundColor Green
    Write-Host "The same setup supports clean installation and upgrade without deleting SQL data or .env." -ForegroundColor Yellow
} finally {
    Pop-Location
}
