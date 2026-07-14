const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const { appendLog } = require('./log-file.cjs');
const { assessApiHealth } = require('./health-gate.cjs');

const root = path.resolve(__dirname, '..');
const node = path.join(root, 'runtime', 'node.exe');
const logFile = path.join(root, 'logs', 'watchdog.log');
const watchdogStateFile = path.join(root, 'runtime', 'watchdog-state.json');
fs.mkdirSync(path.dirname(logFile), { recursive: true });
const log = message => appendLog(logFile, message);

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
  const apiTarget = new URL(state.appUrl);
  const apiHealth = assessApiHealth(await probe(Number(apiTarget.port || 80), '/api/health', apiTarget.hostname));
  if (state.role === 'server' && !apiHealth.reachable && requestApiRestart('unreachable')) {
    repairs.push('تم طلب إعادة تشغيل API لأنه لا يقبل اتصالات.');
  } else if (state.role === 'server' && !apiHealth.databaseConnected && requestApiRestart('database disconnected')) {
    repairs.push('تم تشغيل SQL وطلب إعادة تشغيل API لأن قاعدة البيانات غير متصلة.');
  }
  if (fs.existsSync(path.join(root, 'hardware-bridge', '.env')) && !(await probe(3002, '/health')).reachable) {
    spawnSync('schtasks.exe', ['/Run', '/TN', 'Sameh Print Bridge'], { windowsHide: true });
    repairs.push('تم طلب إعادة تشغيل Interactive Print Bridge.');
  }
  if (repairs.length) {
    const statusFile = path.join(root, 'runtime-status.json');
    const status = fs.existsSync(statusFile) ? JSON.parse(fs.readFileSync(statusFile, 'utf8')) : {};
    fs.writeFileSync(statusFile, JSON.stringify({ ...status, lastRepairs: repairs, repairedAt: new Date().toISOString() }, null, 2));
  }
})().catch(error => { log(error.stack || error); process.exitCode = 1; });
