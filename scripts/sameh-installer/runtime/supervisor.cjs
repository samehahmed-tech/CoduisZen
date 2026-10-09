const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { appendLog } = require('./log-file.cjs');

const root = path.resolve(__dirname, '..');
const logDir = path.join(root, 'logs');
const pidFile = path.join(root, 'runtime', 'supervisor.pid');
const restartFile = path.join(root, 'runtime', 'restart.request');
const managedChildren = new Set();
fs.mkdirSync(logDir, { recursive: true });

const log = message => appendLog(path.join(logDir, 'supervisor.log'), message);

function processExists(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
}

function supervise(name, file, cwd, env) {
  const start = () => {
    if (!fs.existsSync(file)) { log(`${name}: missing ${file}`); return; }
    if (name === 'server') {
      // The WMI probe inside port-guard can hang forever on sick machines;
      // NEVER let it wedge the supervisor — time out and start anyway.
      try {
        const guard = spawnSync(path.join(root, 'runtime', 'node.exe'), [path.join(root, 'runtime', 'port-guard.cjs'), '3001'], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 20000 });
        if (guard.error) log(`port guard: ${guard.error.message} (continuing anyway)`);
        else if (guard.stdout) log(`port guard: ${guard.stdout.trim()}`);
      } catch (error) {
        log(`port guard: ${error.message} (continuing anyway)`);
      }
    }
    log(`${name}: starting`);
    serverStartedAt = Date.now();
    const child = spawn(path.join(root, 'runtime', 'node.exe'), [file], {
      cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    managedChildren.add(child);
    const serviceLog = chunk => appendLog(path.join(logDir, `${name}.log`), String(chunk).trim());
    child.stdout.on('data', serviceLog);
    child.stderr.on('data', serviceLog);
    child.on('error', error => log(`${name}: spawn failed: ${error.message}`));
    child.on('exit', code => {
      managedChildren.delete(child);
      const livedMs = Date.now() - serverStartedAt;
      // Crash-loop brake: a bundle that dies in seconds would otherwise
      // churn forever and flood the disk. Back off after repeated quick deaths.
      if (livedMs < 10000) quickDeaths += 1; else quickDeaths = 0;
      const waitMs = quickDeaths >= 10 ? 60000 : 5000;
      if (waitMs > 5000) log(`${name}: stopped (${code}) after ${livedMs}ms ${quickDeaths}x in a row; backing off 60s`);
      else log(`${name}: stopped (${code}); retry in 5 seconds`);
      setTimeout(start, waitMs);
    });
  };
  start();
}

let serverStartedAt = 0;
let quickDeaths = 0;

// A force-killed supervisor never unlinks supervisor.pid. PIDs get recycled,
// so "pid exists" alone is NOT proof another supervisor runs — verify the
// command line first, otherwise one stale file wedges the whole system
// (task exits 0, nothing ever starts, zero log output).
function commandLineOf(pid) {
  try {
    const probe = spawnSync('powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
        `Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CommandLine`],
      { encoding: 'utf8', windowsHide: true, timeout: 15000 });
    return String(probe.stdout || '');
  } catch { return ''; }
}
// Fast image check that never touches WMI (tasklist answers in ms).
// Used when the WMI command-line probe hangs — the exact wedge that used to
// let duplicate supervisors pile up while port-guard.cjs never exited.
function taskImageOf(pid) {
  try {
    const probe = spawnSync('tasklist.exe', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true, timeout: 8000 });
    const line = String(probe.stdout || '').split(/\r?\n/).find(l => l.includes(String(pid))) || '';
    const m = line.match(/^"([^"]+)"/);
    return m ? m[1].toLowerCase() : '';
  } catch { return ''; }
}
function pidFileAgeMs() {
  try { return Date.now() - fs.statSync(pidFile).mtimeMs; } catch { return Infinity; }
}
const previousPid = Number(fs.existsSync(pidFile) ? fs.readFileSync(pidFile, 'utf8') : 0);
if (previousPid) {
  let alive = false;
  try { process.kill(previousPid, 0); alive = true; } catch { alive = false; }
  const cmd = alive ? commandLineOf(previousPid) : '';
  let ours = alive && cmd.includes('supervisor.cjs');
  if (alive && !ours && !cmd) {
    // WMI hung: fall back to image + freshness. A live node.exe behind a
    // fresh pidfile is almost certainly our supervisor — exit quietly.
    // Anything else (dead pid, non-node, stale pidfile) is safe to take over.
    ours = taskImageOf(previousPid) === 'node.exe' && pidFileAgeMs() < 10 * 60 * 1000;
    if (ours) log(`another supervisor likely running (pid ${previousPid}, WMI unverifiable); exiting`);
    else log(`stale supervisor.pid (pid ${previousPid} unverifiable); taking over`);
  } else if (alive && !ours) {
    log(`stale supervisor.pid (pid ${previousPid} belongs to another process); starting anyway`);
  }
  if (ours) {
    log(`another supervisor already running (pid ${previousPid}); exiting`);
    process.exit(0);
  }
}
fs.writeFileSync(pidFile, String(process.pid));
process.on('exit', () => { try { fs.unlinkSync(pidFile); } catch {} });

try {
  const state = JSON.parse(fs.readFileSync(path.join(root, 'install-state.json'), 'utf8'));
  if (state.role === 'server') supervise('server', path.join(root, 'dist-server', 'index.cjs'), root, readEnv(path.join(root, '.env')));
  let warmupNoted = false;
  setInterval(() => {
    if (!fs.existsSync(restartFile)) { warmupNoted = false; return; }
    // Warmup grace: restart storms used to kill the server 1 second after
    // every start (health flaps during DB warmup), so port 3001 never came
    // up and the watchdog escalated forever. The request is KEPT and honored
    // once warmup passes — nothing legitimate is ever lost.
    if (Date.now() - serverStartedAt < 30000) {
      if (!warmupNoted) { warmupNoted = true; log('deferring restart request: server still warming up'); }
      return;
    }
    warmupNoted = false;
    try { fs.unlinkSync(restartFile); } catch {}
    log('manual restart requested');
    for (const child of managedChildren) child.kill();
  }, 1000);
  log('supervisor ready');
} catch (error) {
  log(`startup failed: ${error.stack || error}`);
  process.exit(1);
}
