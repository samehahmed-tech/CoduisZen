const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const logDir = path.join(root, 'logs');
fs.mkdirSync(logDir, { recursive: true });

function log(name, message) {
  fs.appendFileSync(path.join(logDir, name), `[${new Date().toISOString()}] ${message}\n`);
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

function ok(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function service(name, command, args, options, healthUrl) {
  let child = null;
  let restarting = false;

  function start() {
    if (child || restarting) return;
    log('supervisor.log', `starting ${name}`);
    child = spawn(command, args, {
      cwd: options.cwd || root,
      env: options.env || process.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (data) => log(`${name}.log`, data.toString().trim()));
    child.stderr.on('data', (data) => log(`${name}.log`, data.toString().trim()));
    child.on('exit', (code) => {
      log('supervisor.log', `${name} exited ${code}; restarting`);
      child = null;
      setTimeout(start, 5000);
    });
  }

  async function check() {
    if (!healthUrl) return;
    const healthy = await ok(healthUrl);
    if (healthy) return;
    log('supervisor.log', `${name} health failed; restarting`);
    restarting = true;
    if (child) child.kill();
    child = null;
    setTimeout(() => {
      restarting = false;
      start();
    }, 3000);
  }

  start();
  setInterval(check, 30000);
}

const appEnv = { ...process.env, ...readEnv(path.join(root, '.env')) };
appEnv.NODE_ENV = 'production';
const port = Number(appEnv.API_PORT || 3001);
const node = path.join(root, 'runtime', 'node.exe');
const bridgeOnly = fs.existsSync(path.join(root, '.bridge-only'));

if (!bridgeOnly && fs.existsSync(path.join(root, 'dist-server', 'index.cjs'))) {
  service('server', node, [path.join(root, 'dist-server', 'index.cjs')], {
    cwd: root,
    env: appEnv,
  }, `http://localhost:${port}/api/health`);
}

const bridgeEnvPath = path.join(root, 'hardware-bridge', '.env');
if (fs.existsSync(bridgeEnvPath)) {
  const bridgeEnv = { ...process.env, ...readEnv(bridgeEnvPath) };
  const bridgePort = Number(bridgeEnv.PRINT_BRIDGE_PORT || 3002);
  service('print-bridge', node, [path.join(root, 'hardware-bridge', 'index.js')], {
    cwd: path.join(root, 'hardware-bridge'),
    env: bridgeEnv,
  }, `http://localhost:${bridgePort}/health`);
}

log('supervisor.log', 'supervisor ready');
