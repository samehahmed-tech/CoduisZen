const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const port = Math.max(1, Number(process.argv[2] || 3001));
const escapedRoot = root.replace(/'/g, "''");
const script = `$root='${escapedRoot}'; Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $p=Get-CimInstance Win32_Process -Filter ('ProcessId=' + $_.OwningProcess) -ErrorAction SilentlyContinue; $owned=$p -and $p.Name -eq 'node.exe' -and ($p.CommandLine -like ('*' + $root + '*') -or $p.CommandLine -like '*RestoFlow*' -or $p.CommandLine -like '*CoduisZen*' -or $p.CommandLine -like '*Sameh*'); if($owned){ Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; Write-Output ('KILLED|' + $p.ProcessId + '|' + $p.Name) } else { Write-Output ('BLOCKED|' + $p.ProcessId + '|' + $p.Name) } }`;
const check = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { encoding: 'utf8', windowsHide: true });
if (check.stdout) process.stdout.write(check.stdout);
if (check.stderr) process.stderr.write(check.stderr);
process.exit(check.status || 0);
