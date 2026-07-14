Write-Host "Executing SQL Server Schema..." -ForegroundColor Cyan
$script = Get-Content "scripts/sql-server-schema.sql" -Raw
$connStr = "Server=(localdb)\CoduisZen;Database=CoduisZen;Integrated Security=True;"

$conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
$conn.Open()

$batches = $script -split '(?m)^\s*GO\s*$'
$total = $batches.Count
$current = 0
$errs = @()

foreach ($batch in $batches) {
    $current++
    $sql = $batch.Trim()
    if (-not $sql) { continue }
    
    $pct = [math]::Round(($current/$total)*100, 0)
    if ($current % 5 -eq 0) { Write-Host "  ${pct}%" -NoNewline }
    
    try {
        $cmd = $conn.CreateCommand()
        $cmd.CommandTimeout = 60
        $cmd.CommandText = $sql
        $null = $cmd.ExecuteNonQuery()
    } catch {
        $msg = "Batch ${current}: " + $_.Exception.Message.Replace("`n"," ")
        $errs += $msg
    }
}
$conn.Close()
Write-Host "`nDone!" -ForegroundColor Green

if ($errs.Count -gt 0) {
    Write-Host "Warnings: $($errs.Count)" -ForegroundColor Yellow
    $errs | Select-Object -First 5
} else {
    Write-Host "All batches OK!" -ForegroundColor Green
}

# Count tables
$conn2 = New-Object System.Data.SqlClient.SqlConnection($connStr)
$conn2.Open()
$cmd2 = $conn2.CreateCommand()
$cmd2.CommandText = "SELECT COUNT(*) FROM information_schema.tables WHERE table_type='BASE TABLE'"
$count = $cmd2.ExecuteScalar()
Write-Host "Total tables: $count" -ForegroundColor Cyan

$cmd3 = $conn2.CreateCommand()
$cmd3.CommandText = "SELECT TABLE_NAME FROM information_schema.tables WHERE table_type='BASE TABLE' ORDER BY TABLE_NAME"
$reader = $cmd3.ExecuteReader()
$tables = @()
while ($reader.Read()) { $tables += $reader['TABLE_NAME'] }
$reader.Close()
$conn2.Close()

Write-Host "Tables ($($tables.Count)): $($tables -join ', ')" -ForegroundColor Green
