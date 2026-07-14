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
  if (!fs.existsSync(bridgeFile) || !fs.existsSync(envFile)) return;
  const child = spawn(path.join(root, 'runtime', 'node.exe'), [bridgeFile], {
    cwd: path.dirname(bridgeFile), env: { ...process.env, ...readEnv(envFile) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const write = chunk => appendLog(logFile, String(chunk).trim());
  child.stdout.on('data', write);
  child.stderr.on('data', write);
  child.on('error', error => write(`spawn failed: ${error.message}`));
  child.on('exit', code => { write(`stopped (${code}); retry in 5 seconds`); setTimeout(start, 5000); });
};

start();
