const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { appendLog } = require('./log-file.cjs');

const root = path.resolve(__dirname, '..');
const pidFile = path.join(root, 'runtime', 'bridge-runner.pid');
const logFile = path.join(root, 'logs', 'print-bridge.log');
fs.mkdirSync(path.dirname(logFile), { recursive: true });

function processExists(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function readEnv(file) {
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
}

const oldPid = Number(fs.existsSync(pidFile) ? fs.readFileSync(pidFile, 'utf8') : 0);
if (oldPid && processExists(oldPid)) process.exit(0);
fs.writeFileSync(pidFile, String(process.pid));
process.on('exit', () => { try { fs.unlinkSync(pidFile); } catch {} });

const start = () => {
  const bridgeFile = path.join(root, 'hardware-bridge', 'index.js');
  const envFile = path.join(root, 'hardware-bridge', '.env');
  const nodeBin = path.join(root, 'runtime', 'node.exe');
  // Never exit silently: every missing piece is logged LOUDLY (this file is
  // the reason "bridge is down" mysteries used to have zero log trail), and
  // startup is retried so a later repair heals the bridge automatically.
  if (!fs.existsSync(bridgeFile)) {
    appendLog(logFile, `FATAL: bridge code missing at ${bridgeFile}; retry in 30 seconds`);
    setTimeout(start, 30000);
    return;
  }
  if (!fs.existsSync(envFile)) {
    appendLog(logFile, `FATAL: bridge config missing at ${envFile} (re-run installer with Print Bridge checked, or Monitor repair); retry in 30 seconds`);
    setTimeout(start, 30000);
    return;
  }
  if (!fs.existsSync(nodeBin)) {
    appendLog(logFile, `FATAL: runtime node missing at ${nodeBin}; retry in 30 seconds`);
    setTimeout(start, 30000);
    return;
  }
  let env = {};
  try {
    env = readEnv(envFile);
  } catch (error) {
    appendLog(logFile, `FATAL: cannot read bridge config: ${error.message}; retry in 30 seconds`);
    setTimeout(start, 30000);
    return;
  }
  if (!env.SERVER_URL) appendLog(logFile, 'WARN: SERVER_URL is empty in bridge .env; defaulting to http://localhost:3001');
  if (!env.GATEWAY_TOKEN) appendLog(logFile, 'WARN: GATEWAY_TOKEN is empty in bridge .env; server will reject polling with 401 (bridge shows connected=false in Monitor)');
  const child = spawn(nodeBin, [bridgeFile], {
    cwd: path.dirname(bridgeFile), env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const write = chunk => appendLog(logFile, String(chunk).trim());
  child.stdout.on('data', write);
  child.stderr.on('data', write);
  child.on('error', error => write(`spawn failed: ${error.message}`));
  child.on('exit', code => { write(`stopped (${code}); retry in 5 seconds`); setTimeout(start, 5000); });
};

start();
