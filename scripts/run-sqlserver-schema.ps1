Write-Host "Executing SQL Server Schema..." -ForegroundColor Cyan

$script = Get-Content "scripts/sql-server-schema.sql" -Raw

$connStr = "Server=(localdb)\CoduisZen;Database=CoduisZen;Integrated Security=True;"
$conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
$conn.Open()

$batches = $script -split '\bGO\b'
$total = $batches.Count
$current = 0
$errs = @()

foreach ($batch in $batches) {
    $current++
    $sql = $batch.Trim()
    if (-not $sql) { continue }
    
    if ($current % 20 -eq 0 -or $current -eq $total) {
        Write-Host "  $([math]::Round(($current/$total)*100, 1))%"
    }
    
    try {
        $cmd = $conn.CreateCommand()
        $cmd.CommandTimeout = 30
        $cmd.CommandText = $sql
        $null = $cmd.ExecuteNonQuery()
    } catch {
        $msg = "Batch $current`: $($_.Exception.Message)"
        $errs += $msg
        Write-Host "  WARN: Batch $current failed (continuing)" -ForegroundColor Yellow
    }
}

$conn.Close()
Write-Host "`nSchema execution complete!" -ForegroundColor Green

if ($errs.Count -gt 0) {
    Write-Host "Warnings ($($errs.Count)):" -ForegroundColor Yellow
    $errs | Select-Object -First 20
}

$conn2 = New-Object System.Data.SqlClient.SqlConnection($connStr)
$conn2.Open()
$cmd2 = $conn2.CreateCommand()
$cmd2.CommandText = "SELECT COUNT(*) FROM information_schema.tables WHERE table_type='BASE TABLE'"
$count = $cmd2.ExecuteScalar()
Write-Host "Total tables created: $count" -ForegroundColor Cyan

$cmd3 = $conn2.CreateCommand()
$cmd3.CommandText = "SELECT TABLE_NAME FROM information_schema.tables WHERE table_type='BASE TABLE' ORDER BY TABLE_NAME"
$reader = $cmd3.ExecuteReader()
$tables = @()
while ($reader.Read()) { $tables += $reader['TABLE_NAME'] }
$reader.Close()
$conn2.Close()

Write-Host "Tables ($($tables.Count)): $($tables -join ', ')" -ForegroundColor Green
