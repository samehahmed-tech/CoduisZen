# RestoFlow Hotfix Builder — SMART package (one ZIP for server AND cashier)
# Builds a customer-ready hotfix package from the latest source code.
# The included applier detects the machine role at install time:
#   server  -> dist + dist-server + hardware-bridge + runtime + database schema
#   cashier -> hardware-bridge only (no database, no backup, bridge .env untouched)
#
# Output layout (matches the established hotfix convention):
#   RestoFlow-HotFix-<version>-<yyyyMMdd-HHmm>\
#     Apply Latest Fixes.bat / .ps1   (smart role-aware applier, files-only + rollback)
#     README AR.txt / VERSION.txt
#     payload\dist                     (optimized production frontend)
#     payload\dist-server\index.cjs    (production server bundle)
#     payload\hardware-bridge\         (index.js, package.json, png-raster.js)
#     payload\runtime\                 (schema-doctor.cjs, watchdog.cjs)
#     payload\database\schema.ts
#   + .zip + .sha256.txt (unless -NoZip)
#
# Usage:
#   build_hot_fix.bat
#   build_hot_fix.bat -SkipBuild        (package current dist/ as-is)
#   build_hot_fix.bat -NoZip            (folder only, no zip)
#   build_hot_fix.bat -Description "..."  (note in VERSION.txt)

param(
    [string]$Version = '',
    [string]$OutputPath = '',
    [string]$Description = '',
    [switch]$SkipBuild,
    [switch]$NoZip,
    [switch]$PrintBridgeOnly
)

if ($PrintBridgeOnly) {
    $bridgeBuilder = Join-Path $PSScriptRoot 'build-print-bridge-hotfix.ps1'
    $bridgeArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $bridgeBuilder)
    if ($Version) { $bridgeArgs += @('-Version', $Version) }
    if ($OutputPath) { $bridgeArgs += @('-OutputPath', $OutputPath) }
    if ($Description) { $bridgeArgs += @('-Description', $Description) }
    if ($SkipBuild) { $bridgeArgs += '-SkipBuild' }
    if ($NoZip) { $bridgeArgs += '-NoZip' }
    & powershell.exe @bridgeArgs
    exit $LASTEXITCODE
}

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$package = Get-Content (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json
if (-not $Version) { $Version = $package.version }
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
if (-not $OutputPath) { $OutputPath = Join-Path $repo "RestoFlow-HotFix-$Version-$stamp" }
$out = [IO.Path]::GetFullPath($OutputPath)
$payload = Join-Path $out 'payload'

function Copy-Tree([string]$Source, [string]$Destination) {
    if (-not (Test-Path -LiteralPath $Source)) { throw "Missing build input: $Source" }
    if (Test-Path -LiteralPath $Destination) { Remove-Item -LiteralPath $Destination -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Copy-Item (Join-Path $Source '*') $Destination -Recurse -Force
}

Push-Location $repo
try {
    if (-not $SkipBuild) {
        Write-Host '>> Building application (frontend + server)...' -ForegroundColor Cyan
        npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Application build failed.' }
    } else {
        Write-Host '>> Skipping build, packaging current dist/ as-is.' -ForegroundColor Yellow
    }

    foreach ($required in @(
        (Join-Path $repo 'dist\index.html'),
        (Join-Path $repo 'dist-server\index.cjs'),
        (Join-Path $repo 'hardware-bridge\index.js'),
        (Join-Path $repo 'src\db\schema.ts')
    )) {
        if (-not (Test-Path -LiteralPath $required)) { throw "Required file is missing: $required" }
    }

    Write-Host '>> Assembling hotfix payload...' -ForegroundColor Cyan
    if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $payload | Out-Null

    Copy-Tree (Join-Path $repo 'dist') (Join-Path $payload 'dist')
    New-Item -ItemType Directory -Force -Path (Join-Path $payload 'dist-server') | Out-Null
    Copy-Item (Join-Path $repo 'dist-server\index.cjs') (Join-Path $payload 'dist-server\index.cjs') -Force
    $serverMap = Join-Path $repo 'dist-server\index.cjs.map'
    if (Test-Path -LiteralPath $serverMap) { Copy-Item $serverMap (Join-Path $payload 'dist-server\index.cjs.map') -Force }

    New-Item -ItemType Directory -Force -Path (Join-Path $payload 'hardware-bridge') | Out-Null
    foreach ($f in @('index.js', 'package.json', 'png-raster.js')) {
        Copy-Item (Join-Path $repo "hardware-bridge\$f") (Join-Path $payload "hardware-bridge\$f") -Force
    }
    New-Item -ItemType Directory -Force -Path (Join-Path $payload 'runtime') | Out-Null
    Copy-Item (Join-Path $PSScriptRoot 'runtime\schema-doctor.cjs') (Join-Path $payload 'runtime\schema-doctor.cjs') -Force
    Copy-Item (Join-Path $PSScriptRoot 'runtime\watchdog.cjs') (Join-Path $payload 'runtime\watchdog.cjs') -Force
    Copy-Item (Join-Path $PSScriptRoot 'runtime\supervisor.cjs') (Join-Path $payload 'runtime\supervisor.cjs') -Force
    New-Item -ItemType Directory -Force -Path (Join-Path $payload 'database') | Out-Null
    Copy-Item (Join-Path $repo 'src\db\schema.ts') (Join-Path $payload 'database\schema.ts') -Force

    Copy-Item (Join-Path $PSScriptRoot 'latest-fixes\Apply Latest Fixes.bat') (Join-Path $out 'Apply Latest Fixes.bat') -Force
    Copy-Item (Join-Path $PSScriptRoot 'latest-fixes\Apply Latest Fixes.ps1') (Join-Path $out 'Apply Latest Fixes.ps1') -Force

    $builtLine = "Built: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    $appLine = "App version: $Version"
    $newLine = if ($Description) { "NEW: $Description" } else { 'NEW: latest code fixes (see README AR.txt)' }
    Set-Content -LiteralPath (Join-Path $out 'VERSION.txt') -Value @($builtLine, $appLine, $newLine) -Encoding UTF8

    Set-Content -LiteralPath (Join-Path $out 'README AR.txt') -Value @(
        'RestoFlow - حزمة إصلاح ذكية (Hotfix واحد للسيرفر والكاشير)',
        "التاريخ: $(Get-Date -Format 'yyyy-MM-dd HH:mm')",
        "النسخة: $Version",
        '',
        'نفس الحزمة تُستخدم على الجهازين — السكريبت يكتشف نوع الجهاز تلقائياً:',
        '- جهاز السيرفر: يحدّث dist + dist-server + hardware-bridge + runtime + فحص قاعدة البيانات.',
        '- جهاز الكاشير: يحدّث hardware-bridge فقط (بدون قاعدة بيانات وبدون مساس بإعدادات البريدج).',
        '',
        'طريقة التثبيت (على كل جهاز):',
        '1) انسخ مجلد الحزمة كاملاً إلى الجهاز.',
        '2) شغّل: Apply Latest Fixes.bat',
        '3) وافق بـ Yes عند طلب صلاحية Administrator.',
        '4) انتظر رسالة SUCCESS (السكريبت يعمل نسخة rollback تلقائياً أولاً).',
        '5) افتح التطبيق مرة واحدة، ثم اضغط Ctrl+F5 داخله.',
        '',
        'ملاحظات أمان (مضمّنة في السكريبت):',
        '- نسخة rollback كاملة تُحفظ في updates\rollback-<timestamp> قبل أي تغيير.',
        '- عند أي فشل تُسترجع الملفات القديمة تلقائياً.',
        '- على السيرفر: قاعدة البيانات تُنسخ احتياطياً وتُفحص فقط (لا تُحذف أي بيانات).',
        '- على الكاشير: ملف bridge .env (التوكن وعنوان السيرفر) لا يُمس إطلاقاً.'
    ) -Encoding UTF8

    $assetCount = (Get-ChildItem (Join-Path $payload 'dist\assets\*.js')).Count
    Write-Host ">> Payload ready: $assetCount frontend JS files." -ForegroundColor Green

    if (-not $NoZip) {
        $zip = "$out.zip"
        if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
        Compress-Archive -LiteralPath $out -DestinationPath $zip
        $hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash
        [IO.File]::WriteAllText("$out.sha256.txt", "$hash  $(Split-Path -Leaf $zip)`r`n", [Text.UTF8Encoding]::new($false))
        Write-Host ''
        Write-Host "Package: $zip" -ForegroundColor Green
        Write-Host "SHA-256: $out.sha256.txt" -ForegroundColor Green
    } else {
        Write-Host ''
        Write-Host "Package folder: $out" -ForegroundColor Green
    }
} finally {
    Pop-Location
}
