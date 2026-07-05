param(
    [string]$InstallDir = "$PSScriptRoot\..\client-delivery\openwa-gateway",
    [string]$RepoUrl = "https://github.com/rmyndharis/OpenWA.git",
    [switch]$SkipDockerStart
)

$ErrorActionPreference = "Stop"

function Set-EnvValue {
    param(
        [Parameter(Mandatory=$true)][string]$Path,
        [Parameter(Mandatory=$true)][string]$Key,
        [Parameter(Mandatory=$true)][string]$Value
    )
    if (!(Test-Path -LiteralPath $Path)) {
        New-Item -ItemType File -Path $Path -Force | Out-Null
    }
    $content = Get-Content -Raw -Path $Path
    $escaped = [regex]::Escape($Key)
    if ($content -match "(?m)^$escaped=") {
        $content = [regex]::Replace($content, "(?m)^$escaped=.*$", "$Key=$Value")
    } else {
        if ($content.Length -gt 0 -and !$content.EndsWith("`n")) { $content += "`r`n" }
        $content += "$Key=$Value`r`n"
    }
    Set-Content -Path $Path -Value $content -Encoding UTF8
}

$root = Resolve-Path "$PSScriptRoot\.."
$installPath = [System.IO.Path]::GetFullPath($InstallDir)
$rootEnv = Join-Path $root ".env"
$openwaEnv = Join-Path $installPath ".env"

Write-Host "== RestoFlow OpenWA zero-touch setup =="
Write-Host "Workspace: $root"
Write-Host "OpenWA dir: $installPath"

if (!(Get-Command git -ErrorAction SilentlyContinue)) {
    throw "git is required to clone OpenWA."
}

if (!(Test-Path -LiteralPath $installPath)) {
    New-Item -ItemType Directory -Path (Split-Path $installPath -Parent) -Force | Out-Null
    git clone $RepoUrl $installPath
} elseif (!(Test-Path -LiteralPath (Join-Path $installPath ".git"))) {
    throw "InstallDir exists but is not an OpenWA git checkout: $installPath"
} else {
    git -C $installPath pull --ff-only
}

$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$apiKeyBytes = New-Object byte[] 32
$rng.GetBytes($apiKeyBytes)
$apiKey = [Convert]::ToBase64String($apiKeyBytes).Replace("+","").Replace("/","").Replace("=","")
$webhookSecretBytes = New-Object byte[] 24
$rng.GetBytes($webhookSecretBytes)
$webhookSecret = [Convert]::ToBase64String($webhookSecretBytes).Replace("+","").Replace("/","").Replace("=","")
$rng.Dispose()

Set-EnvValue -Path $openwaEnv -Key "NODE_ENV" -Value "production"
Set-EnvValue -Path $openwaEnv -Key "API_PORT" -Value "2785"
Set-EnvValue -Path $openwaEnv -Key "DASHBOARD_PORT" -Value "2886"
Set-EnvValue -Path $openwaEnv -Key "DATABASE_TYPE" -Value "sqlite"
Set-EnvValue -Path $openwaEnv -Key "DATABASE_NAME" -Value "/app/data/openwa.sqlite"
Set-EnvValue -Path $openwaEnv -Key "ENGINE_TYPE" -Value "whatsapp-web.js"
Set-EnvValue -Path $openwaEnv -Key "PUPPETEER_HEADLESS" -Value "true"
Set-EnvValue -Path $openwaEnv -Key "PUPPETEER_ARGS" -Value "--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage,--disable-gpu"
Set-EnvValue -Path $openwaEnv -Key "STORAGE_TYPE" -Value "local"
Set-EnvValue -Path $openwaEnv -Key "API_MASTER_KEY" -Value $apiKey
Set-EnvValue -Path $openwaEnv -Key "ENABLE_SWAGGER" -Value "true"

# WhatsApp provider defaults to whatsapp-web.js (internal engine)
# Uncomment below to use external OpenWA gateway instead
# Set-EnvValue -Path $rootEnv -Key "WHATSAPP_PROVIDER" -Value "openwa"
# Set-EnvValue -Path $rootEnv -Key "OPENWA_API_URL" -Value "http://localhost:2785/api"
# Set-EnvValue -Path $rootEnv -Key "OPENWA_API_KEY" -Value $apiKey
# Set-EnvValue -Path $rootEnv -Key "OPENWA_SESSION_NAME" -Value "restoflow-orders"
# Set-EnvValue -Path $rootEnv -Key "OPENWA_SESSIONS" -Value '[{"name":"restoflow-orders","role":"ORDERS","default":true},{"name":"restoflow-support","role":"SUPPORT"},{"name":"restoflow-marketing","role":"MARKETING"},{"name":"restoflow-feedback","role":"FEEDBACK"}]'
Set-EnvValue -Path $rootEnv -Key "WHATSAPP_AUTOMATION_ENABLED" -Value "true"
Set-EnvValue -Path $rootEnv -Key "WHATSAPP_FEEDBACK_DELAY_MS" -Value "3600000"
Set-EnvValue -Path $rootEnv -Key "WHATSAPP_WEBHOOK_VERIFY_TOKEN" -Value $webhookSecret

Write-Host "OpenWA and RestoFlow env files are configured."
Write-Host "API:       http://localhost:2785/api"
Write-Host "Dashboard: http://localhost:2886"

if (!$SkipDockerStart) {
    if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Warning "Docker was not found. Env is ready, but OpenWA was not started."
        exit 0
    }
    Push-Location $installPath
    try {
        docker compose up -d
    } finally {
        Pop-Location
    }
    Write-Host "OpenWA started. Open the dashboard, create/start sessions, then scan WhatsApp QR once."
}
