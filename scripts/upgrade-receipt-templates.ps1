$ErrorActionPreference = 'Stop'
$login = Invoke-RestMethod 'http://127.0.0.1:3001/api/auth/pin-login' -Method Post -ContentType 'application/json' -Body (@{ pin='202626'; deviceName='receipt-upgrade' } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.token)"; 'Content-Type' = 'application/json' }
$settings = Invoke-RestMethod 'http://127.0.0.1:3001/api/settings' -Headers $headers
$templates = @($settings.receiptTemplates)
Write-Host "templates found: $($templates.Count)"

function Get-IntOrDefault($value, $default) {
    $n = 0
    if ([int]::TryParse([string]$value, [ref]$n)) { return $n }
    return $default
}

$updated = foreach ($tpl in $templates) {
    $changed = @()
    $newBlocks = foreach ($b in @($tpl.blocks)) {
        if ($b.type -eq 'logo') {
            $h = Get-IntOrDefault $b.config.maxHeight 0
            if ($h -lt 120) { $b.config.maxHeight = 120; $changed += 'logo->120' }
        }
        if ($b.type -eq 'qrCode') {
            $s = Get-IntOrDefault $b.config.size 0
            if ($s -lt 200) { $b.config.size = 200; $changed += 'qr->200' }
        }
        $b
    }
    $tpl.blocks = @($newBlocks)
    if ($tpl.fontSize -ne 'large') { $tpl.fontSize = 'large'; $changed += 'font->large' }
    [PSCustomObject]@{ tpl = $tpl; changed = ($changed -join ',') }
}

foreach ($u in $updated) { Write-Host ("{0}: {1}" -f $u.tpl.id, $(if ($u.changed) { $u.changed } else { 'no change' })) }

$body = @{ receiptTemplates = @($updated | ForEach-Object { $_.tpl }) } | ConvertTo-Json -Depth 12
Invoke-RestMethod 'http://127.0.0.1:3001/api/settings' -Method Put -Headers $headers -Body $body | Out-Null
Write-Host 'settings saved'

$check = (Invoke-RestMethod 'http://127.0.0.1:3001/api/settings' -Headers $headers).receiptTemplates
foreach ($tpl in $check) {
    $logo = ($tpl.blocks | Where-Object { $_.type -eq 'logo' }).config.maxHeight
    $qr = ($tpl.blocks | Where-Object { $_.type -eq 'qrCode' }).config.size
    Write-Host ("{0}: fontSize={1} logo={2} qr={3}" -f $tpl.id, $tpl.fontSize, $logo, $qr)
}
