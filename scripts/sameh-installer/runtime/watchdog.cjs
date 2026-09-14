const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const { appendLog } = require('./log-file.cjs');
const { assessApiHealth } = require('./health-gate.cjs');

const root = path.resolve(__dirname, '..');
const node = path.join(root, 'runtime', 'node.exe');
const logFile = path.join(root, 'logs', 'watchdog.log');
const watchdogStateFile = path.join(root, 'runtime', 'watchdog-state.json');
const pendingUpdateFile = path.join(root, 'runtime', 'pending-update.json');
const updateStateFile = path.join(root, 'runtime', 'update-state.json');
fs.mkdirSync(path.dirname(logFile), { recursive: true });
const log = message => appendLog(logFile, message);
const readJson = (file, fallback = {}) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };

function probe(port, requestPath = '/', host = '127.0.0.1') {
  return new Promise(resolve => {
    const request = http.get(`http://${host}:${port}${requestPath}`, response => {
      let body = '';
      response.on('data', chunk => { if (body.length < 1_000_000) body += chunk; });
      response.on('end', () => resolve({ reachable: true, statusCode: response.statusCode || 0, body }));
    });
    request.setTimeout(2000, () => { request.destroy(); resolve({ reachable: false }); });
    request.on('error', () => resolve({ reachable: false }));
  });
}

function processExists(pidFile) {
  try { process.kill(Number(fs.readFileSync(pidFile, 'utf8')), 0); return true; } catch { return false; }
}

function launch(script) {
  const child = spawn(node, [path.join(root, 'runtime', script)], { cwd: root, detached: true, windowsHide: true, stdio: 'ignore' });
  child.on('error', error => log(`failed to start ${script}: ${error.message}`));
  child.unref();
  log(`started ${script}`);
}

function requestApiRestart(reason) {
  let state = {};
  try { state = JSON.parse(fs.readFileSync(watchdogStateFile, 'utf8')); } catch {}
  if (Date.now() - Number(state.lastApiRestartAt || 0) < 120_000) return false;
  fs.writeFileSync(path.join(root, 'runtime', 'restart.request'), new Date().toISOString());
  fs.writeFileSync(watchdogStateFile, JSON.stringify({ lastApiRestartAt: Date.now(), reason }, null, 2));
  log(`API restart requested: ${reason}`);
  return true;
}

function requestBridgeRestart(reason) {
  let state = {};
  try { state = JSON.parse(fs.readFileSync(watchdogStateFile, 'utf8')); } catch {}
  if (Date.now() - Number(state.lastBridgeRestartAt || 0) < 120_000) return false;
  const escapedRoot = root.replace(/'/g, "''");
  const command = `$root='${escapedRoot}'; Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like ('*' + $root + '*hardware-bridge\\index.js*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], { windowsHide: true });
  spawnSync('schtasks.exe', ['/Run', '/TN', 'Sameh Print Bridge'], { windowsHide: true });
  fs.writeFileSync(watchdogStateFile, JSON.stringify({ ...state, lastBridgeRestartAt: Date.now(), bridgeReason: reason }, null, 2));
  log(`Print Bridge restart requested: ${reason}`);
  return true;
}

function updateVersionParts(value) { return String(value || '').replace(/^v/i, '').split('.').map(part => Number.parseInt(part, 10) || 0); }
function newerVersion(candidate, current) {
  const a = updateVersionParts(candidate); const b = updateVersionParts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return false;
}

async function applyPendingUpdate() {
  if (!fs.existsSync(pendingUpdateFile)) return false;
  let release;
  try { release = JSON.parse(fs.readFileSync(pendingUpdateFile, 'utf8')); } catch { return false; }
  const state = readJson(updateStateFile, {});
  if (state.status === 'installing' || (state.version === release.version && state.status === 'complete')) return false;
  if (state.version === release.version && state.status === 'failed' && Date.now() - new Date(state.updatedAt || 0).getTime() < 5 * 60 * 1000) return false;
  let installState = {};
  try { installState = JSON.parse(fs.readFileSync(path.join(root, 'install-state.json'), 'utf8')); } catch {}
  if (!newerVersion(release.version, installState.version)) { fs.rmSync(pendingUpdateFile, { force: true }); return false; }
  const parsed = new URL(String(release.setupUrl || ''));
  if (!['https:', 'http:'].includes(parsed.protocol) || (parsed.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(parsed.hostname))) {
    fs.writeFileSync(updateStateFile, JSON.stringify({ status: 'failed', version: release.version, error: 'SETUP_URL_MUST_USE_HTTPS', updatedAt: new Date().toISOString() }, null, 2));
    return false;
  }
  const updatesDir = path.join(root, 'updates'); fs.mkdirSync(updatesDir, { recursive: true });
  const target = path.join(updatesDir, `RestoFlow-${release.version}.exe`);
  fs.writeFileSync(updateStateFile, JSON.stringify({ status: 'downloading', version: release.version, updatedAt: new Date().toISOString() }, null, 2));
  try {
    const response = await fetch(release.setupUrl);
    if (!response.ok) throw new Error(`DOWNLOAD_HTTP_${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    if (hash !== String(release.sha256).toLowerCase()) throw new Error('SETUP_SHA256_MISMATCH');
    fs.writeFileSync(target, buffer);
    fs.writeFileSync(updateStateFile, JSON.stringify({ status: 'installing', version: release.version, target, updatedAt: new Date().toISOString() }, null, 2));
    log(`verified update ${release.version}; launching setup`);
    const child = spawn(target, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CLOSEAPPLICATIONS'], { cwd: root, detached: true, windowsHide: true, stdio: 'ignore' });
    child.unref();
    return true;
  } catch (error) {
    fs.writeFileSync(updateStateFile, JSON.stringify({ status: 'failed', version: release.version, error: String(error.message || error), updatedAt: new Date().toISOString() }, null, 2));
    log(`update ${release.version} failed: ${error.stack || error}`);
    return false;
  }
}

function sqlInstance() {
  for (const [service, server] of [['MSSQL$CODUISZEN', '.\\CODUISZEN'], ['MSSQL$SQLEXPRESS', '.\\SQLEXPRESS'], ['MSSQLSERVER', 'localhost']]) {
    const query = spawnSync('sc.exe', ['query', service], { windowsHide: true, encoding: 'utf8' });
    if (query.status === 0) return { service, server, running: /RUNNING/i.test(query.stdout || '') };
  }
  return null;
}

function repairDatabaseUrl() {
  const envFile = path.join(root, '.env');
  if (!fs.existsSync(envFile)) return false;
  const instance = sqlInstance();
  if (!instance) return false;
  if (!instance.running) spawnSync('sc.exe', ['start', instance.service], { windowsHide: true });
  const original = fs.readFileSync(envFile, 'utf8');
  const repaired = original.replace(/^(DATABASE_URL=.*?Server=)(?:(?:localhost|\.)\\CODUISZEN|\(localdb\)\\CoduisZen)(;.*)$/mi, `$1${instance.server}$2`);
  if (repaired === original) return false;
  fs.writeFileSync(envFile, repaired);
  fs.writeFileSync(path.join(root, 'runtime', 'restart.request'), new Date().toISOString());
  log(`DATABASE_URL repaired for ${instance.server}`);
  return true;
}

function ensureTask(name, script, schedule) {
  const exists = spawnSync('schtasks.exe', ['/Query', '/TN', name], { windowsHide: true }).status === 0;
  const launcher = path.join(root, 'runtime', 'hidden-runner.vbs');
  let created = { status: 0 };
  if (!exists) {
    const args = ['/Create', '/TN', name, '/SC', schedule, ...(schedule === 'MINUTE' ? ['/MO', '1'] : []), '/RU', 'SYSTEM', '/RL', 'HIGHEST', '/F', '/TR', `wscript.exe //B //NoLogo "${launcher}" "${script}"`];
    created = spawnSync('schtasks.exe', args, { windowsHide: true });
    log(`${name}: task repair exit=${created.status}`);
  }
  const settings = `$settings=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero); Set-ScheduledTask -TaskName '${name}' -Settings $settings | Out-Null`;
  spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', settings], { windowsHide: true });
  return !exists && created.status === 0;
}

(async () => {
  if (!fs.existsSync(path.join(root, 'install-state.json'))) { log('install-state.json missing'); return; }
  const repairs = [];
  if (repairDatabaseUrl()) repairs.push('تم إصلاح رابط SQL Server تلقائياً.');
  if (ensureTask('Sameh RestoFlow Supervisor', 'supervisor.cjs', 'ONSTART')) repairs.push('تمت إعادة إنشاء Task الخاصة بالسيرفر.');
  if (ensureTask('Sameh System Monitor', 'monitor.cjs', 'ONSTART')) repairs.push('تمت إعادة إنشاء Task الخاصة بالـMonitor.');
  if (ensureTask('Sameh Installer Watchdog', 'watchdog.cjs', 'MINUTE')) repairs.push('تمت إعادة إنشاء Task الخاصة بالإصلاح التلقائي.');
  if (!processExists(path.join(root, 'runtime', 'supervisor.pid'))) launch('supervisor.cjs');
  if (!(await probe(3099, '/health')).reachable) launch('monitor.cjs');
  const state = JSON.parse(fs.readFileSync(path.join(root, 'install-state.json'), 'utf8'));
  await applyPendingUpdate();
  const apiTarget = new URL(state.appUrl);
  const apiHealth = assessApiHealth(await probe(Number(apiTarget.port || 80), '/api/health', apiTarget.hostname));
  if (state.role === 'server' && !apiHealth.reachable && requestApiRestart('unreachable')) {
    repairs.push('تم طلب إعادة تشغيل API لأنه لا يقبل اتصالات.');
  } else if (state.role === 'server' && !apiHealth.databaseConnected && requestApiRestart('database disconnected')) {
    repairs.push('تم تشغيل SQL وطلب إعادة تشغيل API لأن قاعدة البيانات غير متصلة.');
  }
  if (fs.existsSync(path.join(root, 'hardware-bridge', '.env'))) {
    const bridgeHealth = await probe(3002, '/health');
    let stale = !bridgeHealth.reachable;
    if (bridgeHealth.reachable) {
      try {
        const status = JSON.parse(bridgeHealth.body || '{}');
        const lastSuccess = new Date(status.lastSuccessAt || 0).getTime();
        stale = !status.serverConnected || !lastSuccess || Date.now() - lastSuccess > 90_000;
      } catch { stale = true; }
    }
    if (stale && requestBridgeRestart(bridgeHealth.reachable ? 'health-stale' : 'health-unreachable')) {
      repairs.push('تم طلب إعادة تشغيل Print Bridge لأنه متوقف أو لا يتصل بالسيرفر.');
    }
  }
  if (repairs.length) {
    const statusFile = path.join(root, 'runtime-status.json');
    const status = fs.existsSync(statusFile) ? JSON.parse(fs.readFileSync(statusFile, 'utf8')) : {};
    fs.writeFileSync(statusFile, JSON.stringify({ ...status, lastRepairs: repairs, repairedAt: new Date().toISOString() }, null, 2));
  }
})().catch(error => { log(error.stack || error); process.exitCode = 1; });
