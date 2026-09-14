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

if (-not (Test-Path $builder)) {
    throw "Installer build script was not found: $builder"
}

$arguments = @{
    Version = $Version
    OutputPath = $OutputPath
    SqlExpressInstaller = Join-Path $prerequisites "SQLEXPR_x64_ENU.exe"
    OdbcDriverInstaller = Join-Path $prerequisites "msodbcsql.msi"
    VCRedistInstaller = Join-Path $prerequisites "vc_redist.x64.exe"
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
