const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync, spawn } = require('child_process');
const { appendLog } = require('./log-file.cjs');
const { assessApiHealth } = require('./health-gate.cjs');

const root = path.resolve(__dirname, '..');
const logs = path.join(root, 'logs');
fs.mkdirSync(logs, { recursive: true });
const argv = process.argv.slice(2);
const command = argv[0] || 'install';
const value = (name, fallback = '') => argv.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const has = name => argv.includes(`--${name}`);
const log = text => appendLog(path.join(logs, 'installer.log'), text);
const run = (file, args, options = {}) => {
  const result = spawnSync(file, args, { cwd: root, encoding: 'utf8', windowsHide: true, ...options });
  log(`${path.basename(file)} exit=${result.status} ${(result.stderr || result.stdout || '').trim().slice(-1500)}`);
  return result;
};
const secret = () => crypto.randomBytes(48).toString('base64url');
const readEnv = file => Object.fromEntries((fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '').split(/\r?\n/).filter(x => x && !x.startsWith('#') && x.includes('=')).map(x => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
const writeEnv = (file, data) => fs.writeFileSync(file, Object.entries(data).map(([k, v]) => `${k}=${v}`).join('\r\n') + '\r\n');
const statusFile = path.join(root, 'runtime-status.json');
const writeStatus = status => fs.writeFileSync(statusFile, JSON.stringify({ ...status, updatedAt: new Date().toISOString() }, null, 2));
const publicError = error => String(error?.message || error).replace(/(PWD|Password)=[^;\s]+/gi, '$1=***').slice(0, 500);
const applyTaskSettings = name => run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `$settings=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero); Set-ScheduledTask -TaskName '${name}' -Settings $settings | Out-Null`]);
const task = (name, script, schedule = 'ONSTART') => {
  const created = run('schtasks.exe', ['/Create', '/TN', name, '/SC', schedule, ...(schedule === 'MINUTE' ? ['/MO', '1'] : []), '/RU', 'SYSTEM', '/RL', 'HIGHEST', '/F', '/TR', `wscript.exe //B //NoLogo "${path.join(root, 'runtime', 'hidden-runner.vbs')}" "${script}"`]);
  return created.status === 0 ? applyTaskSettings(name) : created;
};

function reconcileServerFirewall() {
  run('netsh.exe', ['advfirewall', 'firewall', 'delete', 'rule', 'name=Sameh RestoFlow Server']);
  return run('netsh.exe', ['advfirewall', 'firewall', 'add', 'rule', 'name=Sameh RestoFlow Server', 'dir=in', 'action=allow', 'protocol=TCP', 'localport=3001']);
}

function interactiveBridgeTask() {
  const launcher = path.join(root, 'runtime', 'hidden-runner.vbs').replace(/'/g, "''");
  const command = `$user=[Security.Principal.WindowsIdentity]::GetCurrent().Name; $action=New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('//B //NoLogo "${launcher}" "bridge-runner.cjs"'); $trigger=New-ScheduledTaskTrigger -AtLogOn -User $user; $principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest; $settings=New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero); Register-ScheduledTask -TaskName 'Sameh Print Bridge' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null; Start-ScheduledTask -TaskName 'Sameh Print Bridge'`;
  return run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command]);
}

function copyLegacyData(source, destination) {
  if (!fs.existsSync(source) || fs.existsSync(destination)) return;
  fs.cpSync(source, destination, { recursive: true });
}

function removeLegacyInstall() {
  for (const name of [
    'RestoFlow Supervisor', 'RestoFlow Supervisor Logon', 'RestoflowPrintBridge',
    'Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge',
  ]) {
    run('schtasks.exe', ['/End', '/TN', name]);
    run('schtasks.exe', ['/Delete', '/TN', name, '/F']);
  }
  run('powershell.exe', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*C:\\RestoFlow*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"]);
  const legacyRoot = path.resolve('C:\\RestoFlow');
  if (root.toLowerCase() === legacyRoot.toLowerCase() || !fs.existsSync(legacyRoot)) return;
  copyLegacyData(path.join(legacyRoot, '.env'), path.join(root, '.env'));
  copyLegacyData(path.join(legacyRoot, 'backups'), path.join(root, 'backups'));
  copyLegacyData(path.join(legacyRoot, '.wwebjs_auth'), path.join(root, '.wwebjs_auth'));
  fs.rmSync(legacyRoot, { recursive: true, force: true });
  log(`removed legacy install ${legacyRoot}`);
}

function stopManagedRestoFlowProcesses() {
  const command = `$pattern='[\\/]runtime[\\/](supervisor|monitor|watchdog|bridge-runner)\\.cjs|[\\/]dist-server[\\/]index\\.cjs|[\\/]hardware-bridge[\\/]index\\.js'; for($i=0;$i -lt 15;$i++){ $procs=Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match $pattern }; if(-not $procs){break}; $procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Start-Sleep -Milliseconds 300 }`;
  const result = run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command]);
  if (result.status !== 0) throw new Error('Failed to stop an older RestoFlow process.');
}

function detectSqlInstance() {
  const candidates = [
    ['MSSQL$CODUISZEN', '.\\CODUISZEN'],
    ['MSSQL$SQLEXPRESS', '.\\SQLEXPRESS'],
    ['MSSQLSERVER', 'localhost'],
  ];
  return candidates.find(([service]) => run('sc.exe', ['query', service]).status === 0)?.[1] || '';
}

function installSqlExpress(installer) {
  const existing = detectSqlInstance();
  if (existing) return existing;
  if (!installer || !fs.existsSync(installer)) throw new Error('SQL Server CODUISZEN غير موجود وملف SQL Express غير مدمج. ابنِ النسخة مع -SqlExpressInstaller.');
  const result = run(installer, ['/Q', '/ACTION=Install', '/FEATURES=SQLENGINE', '/INSTANCENAME=CODUISZEN', '/SQLSVCACCOUNT=NT AUTHORITY\\NETWORK SERVICE', '/SQLSYSADMINACCOUNTS=BUILTIN\\Administrators', '/TCPENABLED=1', '/IACCEPTSQLSERVERLICENSETERMS']);
  if (result.status !== 0 && result.status !== 3010) throw new Error(`SQL Express setup failed (${result.status}).`);
  return '.\\CODUISZEN';
}

function installOdbcDriver(installer) {
  const drivers = run('powershell.exe', ['-NoProfile', '-Command', '(Get-OdbcDriver -Name "ODBC Driver 18 for SQL Server" -ErrorAction SilentlyContinue).Name']);
  if (String(drivers.stdout || '').includes('ODBC Driver 18')) return;
  if (!installer || !fs.existsSync(installer)) throw new Error('ODBC Driver 18 غير موجود وملف التثبيت غير مدمج. ابنِ النسخة مع -OdbcDriverInstaller.');
  const installed = run('msiexec.exe', ['/i', installer, '/qn', '/norestart', 'IACCEPTMSODBCSQLLICENSETERMS=YES']);
  if (installed.status !== 0 && installed.status !== 3010) throw new Error(`ODBC Driver setup failed (${installed.status}).`);
}

function installVcRuntime(installer) {
  if (!installer || !fs.existsSync(installer)) throw new Error('Microsoft Visual C++ x64 Runtime غير مدمج. ابنِ النسخة مع -VCRedistInstaller.');
  const installed = run(installer, ['/install', '/quiet', '/norestart']);
  if (![0, 1638, 3010].includes(installed.status)) throw new Error(`Visual C++ Runtime setup failed (${installed.status}).`);
}

function waitForSqlService(server) {
  const service = server === 'localhost' ? 'MSSQLSERVER' : `MSSQL$${server.split('\\').pop()}`;
  run('sc.exe', ['start', service]);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const status = spawnSync('sc.exe', ['query', service], { encoding: 'utf8', windowsHide: true });
    if (status.status === 0 && /RUNNING/i.test(status.stdout || '')) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  }
  throw new Error(`SQL Server service ${service} did not become ready.`);
}

async function ensureEmptyDatabase(connectionString) {
  const sql = require('mssql/msnodesqlv8');
  const master = connectionString.replace(/Database=[^;]*/i, 'Database=master');
  let pool = await new sql.ConnectionPool({ connectionString: master }).connect();
  const database = await pool.request().query("SELECT DB_ID(N'CoduisZen') AS id");
  const databaseExists = Boolean(database.recordset?.[0]?.id);
  await pool.request().query("IF SUSER_ID(N'NT AUTHORITY\\SYSTEM') IS NULL CREATE LOGIN [NT AUTHORITY\\SYSTEM] FROM WINDOWS");
  if (!databaseExists) await pool.request().query('CREATE DATABASE [CoduisZen]');
  await pool.close();
  pool = await new sql.ConnectionPool({ connectionString }).connect();
  await pool.request().query("IF USER_ID(N'NT AUTHORITY\\SYSTEM') IS NULL CREATE USER [NT AUTHORITY\\SYSTEM] FOR LOGIN [NT AUTHORITY\\SYSTEM]; IF IS_ROLEMEMBER(N'db_owner', N'NT AUTHORITY\\SYSTEM') = 0 ALTER ROLE [db_owner] ADD MEMBER [NT AUTHORITY\\SYSTEM]");
  const schemaExists = await pool.request().query("SELECT OBJECT_ID(N'users', N'U') AS id");
  if (schemaExists.recordset?.[0]?.id) { await pool.close(); return false; }
  const schema = fs.readFileSync(path.join(root, 'database', 'empty-schema.sql'), 'utf8');
  for (const batch of schema.split(/^\s*GO\s*$/gim).map(x => x.trim()).filter(Boolean)) await pool.request().batch(batch);
  await pool.close();
  return true;
}

async function ensureDatabaseWithRetry(connectionString) {
  let lastError;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try { return await ensureEmptyDatabase(connectionString); }
    catch (error) { lastError = error; await new Promise(resolve => setTimeout(resolve, 5000)); }
  }
  throw lastError;
}

function createVerifiedBackup() {
  const backup = run(path.join(root, 'runtime', 'node.exe'), [path.join(root, 'runtime', 'database-backup.cjs')]);
  if (backup.status !== 0) throw new Error(`Initial verified database backup failed: ${publicError(backup.stderr || backup.stdout)}`);
}

async function probeUrl(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return { reachable: true, statusCode: response.status, body: await response.text() };
  } catch {
    return { reachable: false };
  }
}

async function waitForServerReady(appUrl) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (assessApiHealth(await probeUrl(`${appUrl}/api/health`)).ready) return;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('API لم يصبح جاهزاً أو قاعدة البيانات غير متصلة بعد دقيقتين.');
}

async function validateRecoveryUsers(appUrl) {
  const login = async pin => {
    const response = await fetch(`${appUrl}/api/auth/pin-login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin, deviceName: 'Installer validation' }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`PIN ${pin} validation failed (${response.status}).`);
    return response.json();
  };
  const admin = await login('202626');
  const cashier = await login('111111');
  if (!admin.refreshToken || cashier.user?.role !== 'CASHIER') throw new Error('Recovery users validation failed.');
}

async function waitForBridgeReady() {
  let reason = 'Print Bridge لا يستجيب محلياً.';
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const probe = await probeUrl('http://127.0.0.1:3002/health');
    if (probe.reachable) {
      try {
        const status = JSON.parse(probe.body || '{}');
        if (status.serverConnected) return { ready: true };
        reason = status.lastError || 'Print Bridge لا يصل للسيرفر.';
      } catch { reason = 'Print Bridge أعاد استجابة غير صالحة.'; }
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  return { ready: false, reason };
}

function launch(script) {
  spawn(path.join(root, 'runtime', 'node.exe'), [path.join(root, 'runtime', script)], { cwd: root, detached: true, windowsHide: true, stdio: 'ignore' }).unref();
}

function restoreCriticalFiles(role) {
  const manifestFile = path.join(root, 'recovery', 'manifest.json');
  if (!fs.existsSync(manifestFile)) return ['Recovery manifest غير موجود؛ أعد تشغيل Installer لإصلاح الملفات.'];
  const records = JSON.parse(fs.readFileSync(manifestFile, 'utf8').replace(/^\uFEFF/, ''));
  const repairs = [];
  for (const record of records) {
    if (record.role === 'server' && role !== 'server') continue;
    const target = path.join(root, record.target);
    const recovery = path.join(root, 'recovery', record.recovery);
    const currentHash = fs.existsSync(target) ? crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex') : '';
    if (currentHash === record.sha256) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(recovery, target);
    repairs.push(`تمت استعادة ${record.target}`);
  }
  return repairs;
}

function repairBridgeConfig(state) {
  const bridgeFile = path.join(root, 'hardware-bridge', '.env');
  if (!fs.existsSync(bridgeFile)) return false;
  const current = readEnv(bridgeFile);
  const app = readEnv(path.join(root, '.env'));
  const packageTokenFile = path.join(root, 'runtime', 'bridge-package-token');
  const packageToken = fs.existsSync(packageTokenFile) ? fs.readFileSync(packageTokenFile, 'utf8').trim() : '';
  const repaired = {
    ...current,
    SERVER_URL: state.appUrl,
    GLOBAL_CLAIM: 'true',
    POLL_MS: '500',
    GATEWAY_TOKEN: state.role === 'server' ? (app.PRINT_GATEWAY_TOKEN || packageToken) : packageToken,
    BRIDGE_PORT: '3002',
  };
  delete repaired.BRANCH_ID;
  const before = JSON.stringify(current);
  writeEnv(bridgeFile, repaired);
  return before !== JSON.stringify(repaired);
}

function runSchemaDoctor() {
  const doctor = run(path.join(root, 'runtime', 'node.exe'), [path.join(root, 'runtime', 'schema-doctor.cjs')]);
  if (doctor.status !== 0) return { warning: `Schema Doctor: ${publicError(doctor.stderr || doctor.stdout || 'فشل الفحص')}` };
  try {
    const report = JSON.parse(String(doctor.stdout || '').trim().split(/\r?\n/).pop());
    return { repairs: report.added || [], missingTables: report.missingTables || [] };
  } catch (error) {
    return { warning: `Schema Doctor result: ${publicError(error)}` };
  }
}

function repairSystem() {
  const state = JSON.parse(fs.readFileSync(path.join(root, 'install-state.json'), 'utf8'));
  const repairs = restoreCriticalFiles(state.role);
  if (repairBridgeConfig(state)) repairs.push('تم إصلاح ربط Print Bridge تلقائياً بدون Branch ID.');
  const warnings = [];
  if (state.role === 'server') {
    const schema = runSchemaDoctor();
    if (schema.warning) warnings.push(schema.warning);
    if (schema.repairs?.length) repairs.push(`تمت إضافة ${schema.repairs.length} أعمدة ناقصة بدون حذف بيانات.`);
    if (schema.missingTables?.length) warnings.push(`جداول ناقصة تحتاج مراجعة: ${schema.missingTables.slice(0, 20).join(', ')}`);
  }
  const port = run(path.join(root, 'runtime', 'node.exe'), [path.join(root, 'runtime', 'port-guard.cjs'), '3001']);
  if (/BLOCKED\|/i.test(port.stdout || '')) warnings.push(`Port 3001 محجوز ببرنامج غير تابع للنظام: ${(port.stdout || '').trim()}`);
  if (/KILLED\|/i.test(port.stdout || '')) repairs.push('تم إيقاف Server قديم كان يستخدم Port 3001.');
  for (const [name, script, schedule] of [
    ['Sameh RestoFlow Supervisor', 'supervisor.cjs', 'ONSTART'],
    ['Sameh System Monitor', 'monitor.cjs', 'ONSTART'],
    ['Sameh Installer Watchdog', 'watchdog.cjs', 'MINUTE'],
  ]) {
    if (task(name, script, schedule).status === 0) repairs.push(`تم إصلاح Task: ${name}`);
    else warnings.push(`تعذر إصلاح Task: ${name}`);
  }
  if (fs.existsSync(path.join(root, 'hardware-bridge', '.env'))) {
    if (interactiveBridgeTask().status === 0) repairs.push('تم إصلاح Interactive Task الخاصة بـPrint Bridge.');
    else warnings.push('تعذر إصلاح Interactive Task الخاصة بـPrint Bridge.');
  }
  if (state.role === 'server' && reconcileServerFirewall().status !== 0) warnings.push('تعذر إصلاح Firewall الخاصة بالسيرفر.');
  fs.writeFileSync(path.join(root, 'runtime', 'restart.request'), new Date().toISOString());
  writeStatus({ phase: warnings.length ? 'needs-attention' : 'repair-complete', warnings, errors: [], lastRepairs: repairs, repairedAt: new Date().toISOString() });
  launch('watchdog.cjs');
  return warnings.length ? 2 : 0;
}

async function install() {
  const role = value('role', 'server');
  const serverIp = value('serverIp', '127.0.0.1');
  const upgrade = has('upgrade') || fs.existsSync(path.join(root, 'install-state.json'));
  const warnings = [];
  const errors = [];
  try { removeLegacyInstall(); } catch (error) { warnings.push(`تنظيف النسخة القديمة: ${publicError(error)}`); log(`legacy cleanup warning: ${error.stack || error}`); }
  stopManagedRestoFlowProcesses();
  const old = readEnv(path.join(root, '.env'));
  const packageTokenFile = path.join(root, 'runtime', 'bridge-package-token');
  const packageToken = fs.existsSync(packageTokenFile) ? fs.readFileSync(packageTokenFile, 'utf8').trim() : '';
  const appUrl = `http://${role === 'server' ? '127.0.0.1' : serverIp}:3001`;

  if (role === 'server') {
    const detectedServer = detectSqlInstance();
    const databaseServer = detectedServer || '.\\CODUISZEN';
    const detectedUrl = `Driver={ODBC Driver 18 for SQL Server};Server=${databaseServer};Database=CoduisZen;Trusted_Connection=Yes;Encrypt=No;`;
    const databaseUrl = upgrade && old.DATABASE_URL ? old.DATABASE_URL : detectedUrl;
    writeEnv(path.join(root, '.env'), {
      ...old, NODE_ENV: 'production', HOST: '0.0.0.0', API_PORT: '3001', DATABASE_URL: databaseUrl,
      JWT_SECRET: old.JWT_SECRET || secret(), AUDIT_HMAC_SECRET: old.AUDIT_HMAC_SECRET || secret(),
      AI_KEY_ENCRYPTION_SECRET: old.AI_KEY_ENCRYPTION_SECRET || secret(), PRINT_GATEWAY_TOKEN: packageToken || old.PRINT_GATEWAY_TOKEN || secret(),
      PUBLIC_SCREEN_TOKEN: old.PUBLIC_SCREEN_TOKEN || secret(),
      PUBLIC_SCREEN_LAN_NO_KEY: old.PUBLIC_SCREEN_LAN_NO_KEY || 'true',
      ENABLE_WHATSAPP_WEB: has('whatsapp') ? 'true' : (old.ENABLE_WHATSAPP_WEB || 'false'), WHATSAPP_PROVIDER: old.WHATSAPP_PROVIDER || 'whatsapp-web.js',
      CORS_ORIGINS: old.CORS_ORIGINS && old.CORS_ORIGINS !== '*'
        ? old.CORS_ORIGINS
        : 'http://localhost:3001,http://127.0.0.1:3001'
    });
    const backupDir = path.join(root, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const backupAcl = run('icacls.exe', [backupDir, '/grant', 'NT AUTHORITY\\NETWORK SERVICE:(OI)(CI)M', '/T', '/C']);
    if (backupAcl.status !== 0) warnings.push('تعذر منح خدمة SQL صلاحية الكتابة داخل مجلد النسخ الاحتياطي. راجع installer.log.');
  }

  if (has('bridge')) {
    writeEnv(path.join(root, 'hardware-bridge', '.env'), {
      SERVER_URL: appUrl, GLOBAL_CLAIM: 'true', POLL_MS: '500',
      GATEWAY_TOKEN: role === 'server' ? (readEnv(path.join(root, '.env')).PRINT_GATEWAY_TOKEN || '') : packageToken, BRIDGE_PORT: '3002'
    });
  } else if (fs.existsSync(path.join(root, 'hardware-bridge', '.env'))) fs.unlinkSync(path.join(root, 'hardware-bridge', '.env'));

  fs.writeFileSync(path.join(root, 'install-state.json'), JSON.stringify({ role, serverIp, appUrl, version: value('version'), updatedAt: new Date().toISOString() }, null, 2));
  writeStatus({ phase: 'bootstrap', warnings, errors });

  if (role === 'server') {
    writeStatus({ phase: 'installing-prerequisites', warnings, errors });
    installVcRuntime(value('vcInstaller'));
    installOdbcDriver(value('odbcInstaller'));
    const installedServer = installSqlExpress(value('sqlInstaller'));
    waitForSqlService(installedServer);
    const current = readEnv(path.join(root, '.env'));
    if (!upgrade && /Server=(?:localhost|\.)\\CODUISZEN/i.test(current.DATABASE_URL || '') && installedServer !== '.\\CODUISZEN') {
      current.DATABASE_URL = `Driver={ODBC Driver 18 for SQL Server};Server=${installedServer};Database=CoduisZen;Trusted_Connection=Yes;Encrypt=No;`;
      writeEnv(path.join(root, '.env'), current);
    }
    const databaseCreated = await ensureDatabaseWithRetry(readEnv(path.join(root, '.env')).DATABASE_URL);
    if (!databaseCreated) createVerifiedBackup();
    const schema = runSchemaDoctor();
    if (schema.warning) throw new Error(schema.warning);
    if (schema.missingTables?.length) throw new Error(`جداول ناقصة: ${schema.missingTables.slice(0, 20).join(', ')}`);
    if (databaseCreated) createVerifiedBackup();
    const recoveryUsers = run(path.join(root, 'runtime', 'node.exe'), [path.join(root, 'runtime', 'create-recovery-admin.cjs')]);
    if (recoveryUsers.status !== 0) throw new Error(`Recovery users setup failed: ${publicError(recoveryUsers.stderr || recoveryUsers.stdout)}`);
    const port = run(path.join(root, 'runtime', 'node.exe'), [path.join(root, 'runtime', 'port-guard.cjs'), '3001']);
    if (/BLOCKED\|/i.test(port.stdout || '')) throw new Error(`Port 3001 محجوز ببرنامج آخر: ${(port.stdout || '').trim()}`);
  }

  const taskResults = [
    task('Sameh RestoFlow Supervisor', 'supervisor.cjs'),
    task('Sameh System Monitor', 'monitor.cjs'),
    task('Sameh Installer Watchdog', 'watchdog.cjs', 'MINUTE'),
  ];
  if (has('bridge')) taskResults.push(interactiveBridgeTask());
  if (taskResults.some(result => result.status !== 0)) throw new Error('تعذر إنشاء Task أو أكثر في Task Scheduler. شغّل Installer كمسؤول.');
  if (role === 'server' && reconcileServerFirewall().status !== 0) throw new Error('تعذر ضبط Windows Firewall على Port 3001.');
  // Start through Task Scheduler so server processes stay in the hidden SYSTEM
  // session. Direct launches here can leak Node/Chrome windows onto the desktop.
  for (const name of ['Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog']) {
    run('schtasks.exe', ['/Run', '/TN', name]);
  }
  writeStatus({ phase: 'checking-readiness', warnings, errors });

  if (role === 'server') {
    await waitForServerReady(appUrl);
    await validateRecoveryUsers(appUrl);
  }
  else if (!assessApiHealth(await probeUrl(`${appUrl}/api/health`)).ready) warnings.push(`لا يمكن الوصول لسيرفر جاهز على ${serverIp}:3001 الآن. Bridge سيستمر في المحاولة تلقائياً.`);
  if (has('bridge')) {
    const printers = run('powershell.exe', ['-NoProfile', '-Command', '(Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue | Measure-Object).Count']);
    if (Number(String(printers.stdout || '').trim()) < 1) warnings.push('لا توجد Windows Printers معرفة. أضف USB أو LAN printer من Windows ثم اضغط فحص وإصلاح داخل Monitor.');
    const bridge = await waitForBridgeReady();
    if (!bridge.ready) warnings.push(bridge.reason);
  }

  const warningsFile = path.join(root, 'INSTALL_WARNINGS.txt');
  if (warnings.length) {
    fs.writeFileSync(warningsFile, warnings.map((w, i) => `${i + 1}. ${w}`).join('\r\n') + '\r\n');
  } else if (fs.existsSync(warningsFile)) {
    fs.unlinkSync(warningsFile);
  }
  if (fs.existsSync(path.join(root, 'INSTALL_ERROR.txt'))) fs.unlinkSync(path.join(root, 'INSTALL_ERROR.txt'));
  writeStatus({ phase: warnings.length ? 'needs-attention' : 'ready', warnings, errors });

  log(`${upgrade ? 'upgrade' : 'clean install'} complete role=${role} version=${value('version')} warnings=${warnings.length}`);
  return warnings.length ? 2 : 0;
}

function uninstall() {
  for (const name of ['Sameh RestoFlow Supervisor', 'Sameh System Monitor', 'Sameh Installer Watchdog', 'Sameh Print Bridge']) {
    run('schtasks.exe', ['/End', '/TN', name]);
    run('schtasks.exe', ['/Delete', '/TN', name, '/F']);
  }
  const escapedRoot = root.replace(/'/g, "''");
  run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `$root='${escapedRoot}'; $caller=${process.pid}; Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.ProcessId -ne $caller -and $_.CommandLine -like ('*' + $root + '*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`]);
  run('netsh.exe', ['advfirewall', 'firewall', 'delete', 'rule', 'name=Sameh RestoFlow Server']);
  run('netsh.exe', ['advfirewall', 'firewall', 'delete', 'rule', 'name=Sameh System Monitor']);
}

Promise.resolve().then(() => command === 'uninstall' ? uninstall() : command === 'repair' ? repairSystem() : install()).then(code => { process.exit(code || 0); }).catch(error => {
  const message = String(error.message || error);
  log(error.stack || error);
  fs.writeFileSync(path.join(root, 'INSTALL_ERROR.txt'), message);
  writeStatus({ phase: 'failed', warnings: [], errors: [message] });
  try {
    run('schtasks.exe', ['/Run', '/TN', 'Sameh System Monitor']);
    run('schtasks.exe', ['/Run', '/TN', 'Sameh Installer Watchdog']);
  }
  catch (launchError) { log(`recovery launch failed: ${launchError.stack || launchError}`); }
  process.exit(1);
});
