'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { createRequire } = require('module');

const readArg = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const validDate = date => {
  const parsed = Date.parse(`${date}T00:00:00.000Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date || '') && Number.isFinite(parsed)
    && new Date(parsed).toISOString().slice(0, 10) === date;
};

if (process.argv.includes('--self-test')) {
  assert(validDate('2026-07-18'));
  assert(!validDate('2026-02-30'));
  process.stdout.write('cutover self-test OK');
  process.exit(0);
}

const root = path.resolve(readArg('install-dir') || path.join(__dirname, '..'));
const targetDate = readArg('target-date');
const sql = createRequire(path.join(root, 'package.json'))('mssql/msnodesqlv8');
const readEnv = file => Object.fromEntries(fs.readFileSync(file, 'utf8')
  .split(/\r?\n/)
  .filter(line => line && !line.startsWith('#') && line.includes('='))
  .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));

async function main() {
  if (readArg('confirm') !== 'CUTOVER') throw new Error('Confirmation CUTOVER is required.');
  if (!validDate(targetDate)) throw new Error('INVALID_TARGET_DATE');
  const connectionString = readEnv(path.join(root, '.env')).DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is missing.');

  const pool = await new sql.ConnectionPool({ connectionString, requestTimeout: 600000 }).connect();
  const transaction = new sql.Transaction(pool);
  let committed = false;
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const request = () => new sql.Request(transaction);
    const branches = await request().query('SELECT id, business_date FROM dbo.branches WHERE is_active = 1');
    if (!branches.recordset.length) throw new Error('NO_ACTIVE_BRANCHES');

    const activeOrders = await request().input('targetDate', sql.Date, targetDate).query(`
      SELECT COUNT_BIG(*) AS count
      FROM dbo.orders
      WHERE ISNULL(status, '') NOT IN ('COMPLETED', 'DELIVERED', 'CANCELLED', 'REFUNDED')
        AND (business_date IS NULL OR business_date < @targetDate)
    `);
    const preservedActiveOldOrders = Number(activeOrders.recordset[0]?.count || 0);

    const closedShifts = await request().query(`
      UPDATE dbo.shifts
      SET status = 'CLOSED', closing_time = COALESCE(closing_time, GETDATE()), updated_at = GETDATE(),
          notes = LEFT(CONCAT(COALESCE(notes + ' | ', ''), 'Cutover to ${targetDate}'), 255)
      WHERE status = 'OPEN'
    `);
    await request().input('targetDate', sql.NVarChar(10), targetDate).query(`
      UPDATE dbo.branches SET business_date = @targetDate, updated_at = GETDATE() WHERE is_active = 1
    `);
    await transaction.commit();
    committed = true;

    const verification = await pool.request().input('targetDate', sql.NVarChar(10), targetDate).query(`
      SELECT COUNT_BIG(*) AS count FROM dbo.branches WHERE is_active = 1 AND business_date <> @targetDate
    `);
    if (Number(verification.recordset[0]?.count || 0) > 0) throw new Error('CUTOVER_VERIFICATION_FAILED');
    process.stdout.write(JSON.stringify({
      ok: true,
      targetDate,
      branches: branches.recordset.map(branch => ({ id: branch.id, from: branch.business_date, to: targetDate })),
      closedShifts: Number(closedShifts.rowsAffected[0] || 0),
      preservedActiveOldOrders,
    }));
  } catch (error) {
    if (!committed) await transaction.rollback().catch(() => undefined);
    throw error;
  } finally {
    await pool.close();
  }
}

main().catch(error => {
  process.stderr.write(JSON.stringify({ ok: false, error: String(error?.message || error) }));
  process.exitCode = 1;
});
