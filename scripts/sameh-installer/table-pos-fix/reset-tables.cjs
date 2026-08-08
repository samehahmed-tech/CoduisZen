'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const readArg = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const readEnv = file => Object.fromEntries(fs.readFileSync(file, 'utf8')
  .split(/\r?\n/)
  .filter(line => line && !line.trimStart().startsWith('#') && line.includes('='))
  .map(line => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]));
const buildAssignments = columns => {
  const assignments = ["status = 'AVAILABLE'"];
  if (columns.has('current_order_id')) assignments.push('current_order_id = NULL');
  if (columns.has('locked_by_user_id')) assignments.push('locked_by_user_id = NULL');
  if (columns.has('updated_at')) assignments.push('updated_at = GETDATE()');
  return assignments;
};

if (process.argv.includes('--self-test')) {
  assert.deepStrictEqual(buildAssignments(new Set(['current_order_id', 'locked_by_user_id'])), [
    "status = 'AVAILABLE'", 'current_order_id = NULL', 'locked_by_user_id = NULL',
  ]);
  process.stdout.write('table reset self-test OK\n');
  process.exit(0);
}

const root = path.resolve(readArg('install-dir') || path.join(__dirname, '..'));
const runtimeRequire = createRequire(path.join(root, 'runtime', 'database-backup.cjs'));
const sql = runtimeRequire('mssql/msnodesqlv8');

async function main() {
  const env = readEnv(path.join(root, '.env'));
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is missing from .env');
  const pool = await new sql.ConnectionPool({ connectionString: env.DATABASE_URL, requestTimeout: 600000 }).connect();
  try {
    const exists = await pool.request().query("SELECT OBJECT_ID('dbo.tables', 'U') AS tableId");
    if (!exists.recordset[0]?.tableId) throw new Error('dbo.tables is missing');
    const columnResult = await pool.request().query("SELECT LOWER(name) AS name FROM sys.columns WHERE object_id = OBJECT_ID('dbo.tables')");
    const columns = new Set(columnResult.recordset.map(row => String(row.name)));
    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const request = new sql.Request(transaction);
      const updated = await request.query(`UPDATE dbo.tables SET ${buildAssignments(columns).join(', ')}`);
      const verification = await request.query(`SELECT COUNT_BIG(*) AS invalidCount FROM dbo.tables WHERE status <> 'AVAILABLE'${columns.has('current_order_id') ? ' OR current_order_id IS NOT NULL' : ''}${columns.has('locked_by_user_id') ? ' OR locked_by_user_id IS NOT NULL' : ''}`);
      const invalidCount = Number(verification.recordset[0]?.invalidCount || 0);
      if (invalidCount !== 0) throw new Error(`TABLE_RESET_VERIFICATION_FAILED:${invalidCount}`);
      await transaction.commit();
      process.stdout.write(`${JSON.stringify({ ok: true, tablesReset: Number(updated.rowsAffected[0] || 0), invalidCount })}\n`);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } finally {
    await pool.close();
  }
}

main().catch(error => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exit(1);
});
