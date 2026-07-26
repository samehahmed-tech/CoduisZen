'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const installDirArg = process.argv.find(argument => argument.startsWith('--install-dir='));
const migrationFile = path.join(__dirname, 'migrate-daily-order-number.sql');

if (process.argv.includes('--self-test')) {
  const migration = fs.readFileSync(migrationFile, 'utf8');
  assert(migration.includes("COL_LENGTH('dbo.orders', 'daily_order_number')"));
  assert(migration.includes('ROW_NUMBER() OVER'));
  process.stdout.write('daily order number migration self-test OK');
  process.exit(0);
}

const installDir = path.resolve(installDirArg?.slice('--install-dir='.length) || path.join(__dirname, '..'));
const sql = createRequire(path.join(installDir, 'package.json'))('mssql/msnodesqlv8');
const env = Object.fromEntries(fs.readFileSync(path.join(installDir, '.env'), 'utf8')
  .split(/\r?\n/)
  .filter(line => line && !line.startsWith('#') && line.includes('='))
  .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));

async function migrate() {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is missing.');
  const pool = await new sql.ConnectionPool({ connectionString: env.DATABASE_URL, requestTimeout: 600000 }).connect();
  try {
    await pool.request().batch(fs.readFileSync(migrationFile, 'utf8'));
    const verification = await pool.request().query('SELECT COUNT_BIG(*) AS missing FROM dbo.orders WHERE daily_order_number IS NULL');
    if (Number(verification.recordset[0]?.missing || 0) !== 0) throw new Error('DAILY_ORDER_NUMBER_MIGRATION_INCOMPLETE');
    process.stdout.write(JSON.stringify({ ok: true }));
  } finally {
    await pool.close();
  }
}

migrate().catch(error => {
  process.stderr.write(JSON.stringify({ ok: false, error: String(error?.message || error) }));
  process.exitCode = 1;
});
