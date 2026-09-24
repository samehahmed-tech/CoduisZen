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
      const guard = spawnSync(path.join(root, 'runtime', 'node.exe'), [path.join(root, 'runtime', 'port-guard.cjs'), '3001'], { cwd: root, encoding: 'utf8', windowsHide: true });
      if (guard.stdout) log(`port guard: ${guard.stdout.trim()}`);
    }
    log(`${name}: starting`);
    const child = spawn(path.join(root, 'runtime', 'node.exe'), [file], {
      cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    managedChildren.add(child);
    const serviceLog = chunk => appendLog(path.join(logDir, `${name}.log`), String(chunk).trim());
    child.stdout.on('data', serviceLog);
    child.stderr.on('data', serviceLog);
    child.on('error', error => log(`${name}: spawn failed: ${error.message}`));
    child.on('exit', code => { managedChildren.delete(child); log(`${name}: stopped (${code}); retry in 5 seconds`); setTimeout(start, 5000); });
  };
  start();
}

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
const previousPid = Number(fs.existsSync(pidFile) ? fs.readFileSync(pidFile, 'utf8') : 0);
if (previousPid) {
  let alive = false;
  try { process.kill(previousPid, 0); alive = true; } catch { alive = false; }
  const ours = alive && commandLineOf(previousPid).includes('supervisor.cjs');
  if (ours) {
    log(`another supervisor already running (pid ${previousPid}); exiting`);
    process.exit(0);
  }
  if (alive) log(`stale supervisor.pid (pid ${previousPid} belongs to another process); starting anyway`);
}
fs.writeFileSync(pidFile, String(process.pid));
process.on('exit', () => { try { fs.unlinkSync(pidFile); } catch {} });

try {
  const state = JSON.parse(fs.readFileSync(path.join(root, 'install-state.json'), 'utf8'));
  if (state.role === 'server') supervise('server', path.join(root, 'dist-server', 'index.cjs'), root, readEnv(path.join(root, '.env')));
  setInterval(() => {
    if (!fs.existsSync(restartFile)) return;
    try { fs.unlinkSync(restartFile); } catch {}
    log('manual restart requested');
    for (const child of managedChildren) child.kill();
  }, 1000);
  log('supervisor ready');
} catch (error) {
  log(`startup failed: ${error.stack || error}`);
  process.exit(1);
}
