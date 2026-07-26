'use strict';

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const installArg = process.argv.find(arg => arg.startsWith('--install-dir='));
const root = installArg ? path.resolve(installArg.slice('--install-dir='.length)) : path.resolve(__dirname, '..');
const sql = createRequire(path.join(root, 'package.json'))('mssql/msnodesqlv8');
const readEnv = file => Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#') && line.includes('=')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));

async function main() {
  const fileArg = process.argv.find(arg => arg.startsWith('--file='));
  if (!fileArg || !process.argv.includes('--confirm=IMPORT')) throw new Error('Usage: --file=path --confirm=IMPORT');
  const sqlFile = path.resolve(fileArg.slice('--file='.length));
  const script = fs.readFileSync(sqlFile, 'utf8');
  if (!script.startsWith('-- RESTOFLOW_CATALOG_IMPORT_V1')) throw new Error('Invalid RestoFlow catalog SQL file');
  const connectionString = readEnv(path.join(root, '.env')).DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is missing');
  const pool = await new sql.ConnectionPool({ connectionString, requestTimeout: 600000 }).connect();
  try {
    await pool.request().batch(script);
    process.stdout.write(JSON.stringify({ ok: true, sqlFile }));
  } finally {
    await pool.close();
  }
}

main().catch(error => {
  process.stderr.write(JSON.stringify({ ok: false, error: String(error?.message || error) }));
  process.exitCode = 1;
});
