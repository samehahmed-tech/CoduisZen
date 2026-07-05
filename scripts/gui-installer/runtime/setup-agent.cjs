const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const logDir = path.join(root, 'logs');
fs.mkdirSync(logDir, { recursive: true });

const args = process.argv.slice(2);
const cmd = args[0] || 'install';

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = args.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function has(name) {
  return args.includes(`--${name}`);
}

function log(message) {
  fs.appendFileSync(path.join(logDir, 'setup-agent.log'), `[${new Date().toISOString()}] ${message}\n`);
}

function run(file, commandArgs, options = {}) {
  log(`${file} ${commandArgs.join(' ')}`);
  const result = spawnSync(file, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });
  if (result.stdout) log(result.stdout.trim());
  if (result.stderr) log(result.stderr.trim());
  return result;
}

function secret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function readEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

function writeEnv(file, values) {
  fs.writeFileSync(
    file,
    Object.keys(values).sort().map((key) => `${key}=${values[key]}`).join('\n') + '\n',
    'utf8',
  );
}

function localIp() {
  const nets = require('os').networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const item of list || []) {
      if (item.family === 'IPv4' && !item.internal) return item.address;
    }
  }
  return 'localhost';
}

function install() {
  const errors = [];
  const clientSlug = arg('clientSlug', 'restoflow-client');
  const port = Number(arg('port', '3001')) || 3001;
  const databaseUrl = arg('databaseUrl', '');
  const installBridge = has('printBridge');
  const enableWhatsApp = has('whatsapp');
  const restoreData = has('restoreData');
  const whatsappProvider = arg('whatsappProvider', 'whatsapp-web.js');
  const lan = localIp();
  const envPath = path.join(root, '.env');
  const existing = readEnv(envPath);
  const finalDatabaseUrl = databaseUrl || existing.DATABASE_URL || 'postgresql://restoflow_user:CHANGE_ME@127.0.0.1:5432/restoflow_erp';

  if (finalDatabaseUrl.includes('CHANGE_ME')) {
    errors.push(`DATABASE_URL missing. Edit ${envPath}, then run installer repair or restart RestoFlow.`);
  }

  const env = {
    NODE_ENV: 'production',
    HOST: '0.0.0.0',
    CLIENT_SLUG: clientSlug,
    API_PORT: String(port),
    DATABASE_URL: finalDatabaseUrl,
    CORS_ORIGINS: `http://localhost:${port},http://127.0.0.1:${port},http://${lan}:${port}`,
    JWT_SECRET: existing.JWT_SECRET || secret(48),
    AUDIT_HMAC_SECRET: existing.AUDIT_HMAC_SECRET || secret(48),
    AI_KEY_ENCRYPTION_SECRET: existing.AI_KEY_ENCRYPTION_SECRET || secret(48),
    PRINT_GATEWAY_TOKEN: existing.PRINT_GATEWAY_TOKEN || secret(48),
    ATTENDANCE_BRIDGE_TOKEN: existing.ATTENDANCE_BRIDGE_TOKEN || secret(48),
    SOCKET_REDIS_ENABLED: 'false',
    FORCE_HTTPS: 'false',
    BACKUP_DIR: path.join(root, 'backups'),
    ENABLE_WHATSAPP_WEB: enableWhatsApp ? 'true' : 'false',
    WHATSAPP_PROVIDER: enableWhatsApp ? whatsappProvider : 'disabled',
    WHATSAPP_HEADLESS: 'true',
  };
  writeEnv(envPath, env);

  if (installBridge) {
    writeEnv(path.join(root, 'hardware-bridge', '.env'), {
      NODE_ENV: 'production',
      PRINT_BACKEND_URL: `http://localhost:${port}/api/print-gateway/gateway`,
      PRINT_GATEWAY_TOKEN: env.PRINT_GATEWAY_TOKEN,
      PRINT_GATEWAY_ID: `gw-${clientSlug}`,
      PRINT_BRANCH_ID: 'b1',
      PRINT_CLAIM_UNASSIGNED: 'true',
      PRINT_BRIDGE_PORT: '3002',
    });
  }

  if (!finalDatabaseUrl.includes('CHANGE_ME')) {
    const migrate = run(path.join(root, 'runtime', 'node.exe'), [path.join(root, 'scripts', 'migrate.cjs')], {
      env: { ...process.env, ...env },
    });
    if (migrate.status !== 0) errors.push('Database migration failed. Install continues; fix DB then rerun Repair.');
    if (restoreData) {
      const restore = run(path.join(root, 'runtime', 'node.exe'), [path.join(root, 'runtime', 'restore-data.cjs')], {
        env: { ...process.env, ...env },
      });
      if (restore.status !== 0) errors.push('Included data restore failed. System still installed; check logs/setup-agent.log.');
    }
  }

  run('schtasks.exe', ['/Create', '/TN', 'RestoFlow Supervisor', '/SC', 'ONSTART', '/RU', 'SYSTEM', '/RL', 'HIGHEST', '/F', '/TR', `"${path.join(root, 'runtime', 'node.exe')}" "${path.join(root, 'runtime', 'supervisor.cjs')}"`]);
  run('schtasks.exe', ['/Create', '/TN', 'RestoFlow Supervisor Logon', '/SC', 'ONLOGON', '/RL', 'HIGHEST', '/F', '/TR', `"${path.join(root, 'runtime', 'node.exe')}" "${path.join(root, 'runtime', 'supervisor.cjs')}"`]);
  run('netsh.exe', ['advfirewall', 'firewall', 'add', 'rule', `name=RestoFlow ERP ${port}`, 'dir=in', 'action=allow', 'protocol=TCP', `localport=${port}`]);
  if (installBridge) run('netsh.exe', ['advfirewall', 'firewall', 'add', 'rule', 'name=RestoFlow Print Bridge 3002', 'dir=in', 'action=allow', 'protocol=TCP', 'localport=3002']);

  spawn(path.join(root, 'runtime', 'node.exe'), [path.join(root, 'runtime', 'supervisor.cjs')], {
    cwd: root,
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
  }).unref();

  const lines = [
    'RestoFlow setup finished.',
    `Local URL: http://localhost:${port}`,
    `LAN URL: http://${lan}:${port}`,
    `Print bridge: ${installBridge ? 'enabled' : 'disabled'}`,
    `WhatsApp: ${enableWhatsApp ? `enabled (${whatsappProvider})` : 'disabled'}`,
    `Included data restore: ${restoreData ? 'enabled' : 'disabled'}`,
    `Logs: ${logDir}`,
  ];
  if (errors.length) lines.push('', 'Errors to fix:', ...errors.map((item) => `- ${item}`));
  fs.writeFileSync(path.join(root, 'INSTALL_RESULT.txt'), lines.join('\r\n'), 'utf8');
  return errors.length ? 2 : 0;
}

function installCashierBridge() {
  const errors = [];
  const serverUrl = arg('serverUrl', '').replace(/\/+$/, '');
  const token = arg('token', '');
  const branchId = arg('branchId', 'b1');
  if (!serverUrl) errors.push('Server URL is required.');
  if (!token) errors.push('Print gateway token is required.');
  if (errors.length === 0) {
    fs.writeFileSync(path.join(root, '.bridge-only'), '1\n', 'utf8');
    writeEnv(path.join(root, 'hardware-bridge', '.env'), {
      NODE_ENV: 'production',
      PRINT_BACKEND_URL: `${serverUrl}/api/print-gateway/gateway`,
      PRINT_GATEWAY_TOKEN: token,
      PRINT_GATEWAY_ID: `cashier-${require('os').hostname()}`,
      PRINT_BRANCH_ID: branchId,
      PRINT_CLAIM_UNASSIGNED: 'true',
      PRINT_BRIDGE_PORT: '3002',
    });
    run('schtasks.exe', ['/Create', '/TN', 'RestoFlow Supervisor', '/SC', 'ONSTART', '/RU', 'SYSTEM', '/RL', 'HIGHEST', '/F', '/TR', `"${path.join(root, 'runtime', 'node.exe')}" "${path.join(root, 'runtime', 'supervisor.cjs')}"`]);
    run('schtasks.exe', ['/Create', '/TN', 'RestoFlow Supervisor Logon', '/SC', 'ONLOGON', '/RL', 'HIGHEST', '/F', '/TR', `"${path.join(root, 'runtime', 'node.exe')}" "${path.join(root, 'runtime', 'supervisor.cjs')}"`]);
    run('netsh.exe', ['advfirewall', 'firewall', 'add', 'rule', 'name=RestoFlow Print Bridge 3002', 'dir=in', 'action=allow', 'protocol=TCP', 'localport=3002']);
    spawn(path.join(root, 'runtime', 'node.exe'), [path.join(root, 'runtime', 'supervisor.cjs')], {
      cwd: root,
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
    }).unref();
  }
  fs.writeFileSync(path.join(root, 'CASHIER_BRIDGE_RESULT.txt'), [
    'RestoFlow cashier print bridge setup finished.',
    `Server URL: ${serverUrl || '-'}`,
    `Branch: ${branchId}`,
    `Logs: ${logDir}`,
    ...(errors.length ? ['', 'Errors:', ...errors.map((item) => `- ${item}`)] : []),
  ].join('\r\n'), 'utf8');
  return errors.length ? 2 : 0;
}

function uninstall() {
  run('schtasks.exe', ['/Delete', '/TN', 'RestoFlow Supervisor', '/F']);
  run('schtasks.exe', ['/Delete', '/TN', 'RestoFlow Supervisor Logon', '/F']);
  fs.writeFileSync(path.join(root, 'UNINSTALL_RESULT.txt'), 'RestoFlow scheduled tasks removed.\r\n', 'utf8');
  return 0;
}

try {
  if (cmd === 'uninstall') process.exit(uninstall());
  if (cmd === 'cashier-bridge') process.exit(installCashierBridge());
  process.exit(install());
} catch (error) {
  log(error.stack || error.message || String(error));
  fs.writeFileSync(path.join(root, 'INSTALL_RESULT.txt'), `Setup failed but files were installed.\r\n${error.message || error}\r\nLogs: ${logDir}\r\n`, 'utf8');
  process.exit(1);
}
