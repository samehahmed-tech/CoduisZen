import concurrently from 'concurrently';

const rawCwd = process.cwd();
const cwd = rawCwd.replace(/^\\\\\?\\/, '');
const includeBridge = process.argv.includes('--bridge');

const commands = [
  { command: 'npm run dev', name: 'web', cwd },
  { command: 'npm run server', name: 'api', cwd },
];

if (includeBridge) {
  commands.push({ command: 'npm run bridge:start', name: 'bridge', cwd });
}

concurrently(commands, {
  prefix: 'name',
  killOthersOn: ['failure', 'success'],
  restartTries: 0,
}).result.catch(() => {
  process.exitCode = 1;
});
