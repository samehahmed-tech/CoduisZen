const fs = require('fs');
const path = require('path');

const maxBytes = 5 * 1024 * 1024;

function appendLog(file, message) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && fs.statSync(file).size >= maxBytes) {
    const previous = `${file}.1`;
    if (fs.existsSync(previous)) fs.rmSync(previous, { force: true });
    fs.renameSync(file, previous);
  }
  fs.appendFileSync(file, `[${new Date().toISOString()}] ${message}\n`);
}

module.exports = { appendLog };
