'use strict';

// Cleanup future-dated day closes caused by auto-close drift.
// 1. Finds an empty past day (no orders) as dump target.
// 2. Moves all orders with business_date >= from-date to the dump day.
// 3. Deletes all day_close_reports with date >= from-date.
// 4. Deletes daily_pnl_snapshots with business_date >= from-date.
// 5. Sets branches.business_date = target-date (e.g. 2026-10-17).
// Transactional + signed audit log.

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const readArg = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const validDate = value => {
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '')
    && Number.isFinite(parsed)
    && new Date(parsed).toISOString().slice(0, 10) === value;
};
const stableStringify = value => {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
};
const readEnv = file => Object.fromEntries(fs.readFileSync(file, 'utf8')
  .split(/\r?\n/)
  .filter(line => line && !line.startsWith('#') && line.includes('='))
  .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));

if (process.argv.includes('--self-test')) {
  assert(validDate('2026-10-17'));
  assert(!validDate('2026-02-30'));
  assert(stableStringify({ b: 2, a: 1 }) === '{"a":1,"b":2}');
  process.stdout.write('cleanup future days self-test OK');
  process.exit(0);
}

const root = path.resolve(readArg('install-dir') || path.join(__dirname, '..', '..'));
const fromDate = readArg('from-date') || '2026-10-17'; // first future-closed day
const targetDate = readArg('target-date') || '2026-10-17'; // new business_date
const onlyBranchId = readArg('branch-id') || null;
const inspectOnly = process.argv.includes('--inspect');
const sql = createRequire(path.join(root, 'package.json'))('mssql/msnodesqlv8');

async function inspect(pool) {
  // Find future-closed reports
  const futureReports = await pool.request()
    .input('fromDate', sql.Date, fromDate)
    .query(`
      SELECT branch_id, [date], total_revenue, total_orders, status, closed_at
      FROM dbo.day_close_reports
      WHERE [date] >= @fromDate
      ORDER BY branch_id, [date]
    `);

  // Find future orders
  const futureOrders = await pool.request()
    .input('fromDate', sql.NVarChar(10), fromDate)
    .query(`
      SELECT branch_id, business_date, COUNT(*) AS cnt, COALESCE(SUM(total), 0) AS revenue
      FROM dbo.orders
      WHERE business_date >= @fromDate AND deleted_at IS NULL
      GROUP BY branch_id, business_date
      ORDER BY branch_id, business_date
    `);

  // Find future pnl snapshots
  const futurePnl = await pool.request()
    .input('fromDate', sql.Date, fromDate)
    .query(`
      SELECT branch_id, business_date, status, total_revenue
      FROM dbo.daily_pnl_snapshots
      WHERE business_date >= @fromDate
      ORDER BY branch_id, business_date
    `);

  // Find empty past days (no orders) in the 90 days before fromDate
  const emptyDays = await pool.request()
    .input('fromDate', sql.NVarChar(10), fromDate)
    .query(`
      SELECT CAST(DATEADD(DAY, -n, CAST(@fromDate AS DATE)) AS DATE) AS empty_day
      FROM (SELECT TOP 90 ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n FROM sys.all_columns) nums
      WHERE NOT EXISTS (
        SELECT 1 FROM dbo.orders o
        WHERE o.business_date = CAST(DATEADD(DAY, -n, CAST(@fromDate AS DATE)) AS NVARCHAR(10))
          AND o.deleted_at IS NULL
      )
      ORDER BY empty_day DESC
    `);

  // Branch info
  const branches = await pool.request().query(`
    SELECT id, name, business_date
    FROM dbo.branches
    WHERE is_active = 1
    ORDER BY name, id
  `);

  return {
    futureReports: futureReports.recordset,
    futureOrders: futureOrders.recordset,
    futurePnl: futurePnl.recordset,
    emptyDays: emptyDays.recordset.map(r => r.empty_day instanceof Date ? r.empty_day.toISOString().split('T')[0] : String(r.empty_day).slice(0, 10)),
    branches: branches.recordset,
  };
}

async function main() {
  if (!validDate(fromDate)) throw new Error('INVALID_FROM_DATE');
  if (!validDate(targetDate)) throw new Error('INVALID_TARGET_DATE');
  if (!inspectOnly && readArg('confirm') !== 'CLEANUP') throw new Error('Confirmation CLEANUP is required.');

  const env = readEnv(path.join(root, '.env'));
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is missing.');
  const pool = await new sql.ConnectionPool({ connectionString: env.DATABASE_URL, requestTimeout: 600000 }).connect();

  try {
    const pre = await inspect(pool);

    if (inspectOnly) {
      process.stdout.write(JSON.stringify({ ok: true, fromDate, targetDate, ...pre }));
      return;
    }

    if (pre.futureReports.length === 0 && pre.futureOrders.length === 0 && pre.futurePnl.length === 0) {
      throw new Error('NOTHING_TO_CLEANUP: no future-dated records found.');
    }

    const dumpDay = pre.emptyDays[0];
    if (!dumpDay) throw new Error('NO_EMPTY_DAY_FOUND: could not find an empty past day in 90 days before fromDate.');

    const transaction = new sql.Transaction(pool);
    let committed = false;
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const request = () => new sql.Request(transaction);
      const results = { dumpDay, movedOrders: 0, deletedReports: 0, deletedPnl: 0, branchesUpdated: [] };

      // 1. Move future orders to dump day
      const moveOrders = await request()
        .input('fromDate', sql.NVarChar(10), fromDate)
        .input('dumpDay', sql.NVarChar(10), dumpDay)
        .query(`UPDATE dbo.orders SET business_date = @dumpDay, updated_at = GETDATE()
          WHERE business_date >= @fromDate AND deleted_at IS NULL`);
      results.movedOrders = Number(moveOrders.rowsAffected[0] || 0);

      // 2. Delete future day_close_reports
      const delReports = await request()
        .input('fromDate', sql.Date, fromDate)
        .query(`DELETE FROM dbo.day_close_reports WHERE [date] >= @fromDate`);
      results.deletedReports = Number(delReports.rowsAffected[0] || 0);

      // 3. Delete future pnl snapshots
      try {
        const delPnl = await request()
          .input('fromDate', sql.Date, fromDate)
          .query(`DELETE FROM dbo.daily_pnl_snapshots WHERE business_date >= @fromDate`);
        results.deletedPnl = Number(delPnl.rowsAffected[0] || 0);
      } catch { /* legacy databases may not have this table */ }

      // 4. Reset branches.business_date to targetDate
      const branchIds = onlyBranchId ? [onlyBranchId] : pre.branches.map(b => b.id);
      for (const branchId of branchIds) {
        const upd = await request()
          .input('branchId', sql.NVarChar(255), branchId)
          .input('targetText', sql.NVarChar(10), targetDate)
          .query(`UPDATE dbo.branches SET business_date = @targetText, updated_at = GETDATE() WHERE id = @branchId`);
        if (Number(upd.rowsAffected[0] || 0) > 0) results.branchesUpdated.push(branchId);
      }

      // 5. Audit
      const createdAt = new Date();
      const reason = `Cleanup future days >= ${fromDate}. Moved ${results.movedOrders} orders to ${dumpDay}, deleted ${results.deletedReports} reports, ${results.deletedPnl} pnl snapshots. business_date -> ${targetDate}.`;
      const payload = results;
      const toSign = stableStringify({
        eventType: 'FUTURE_DAYS_CLEANUP', userId: null, branchId: null, deviceId: null,
        payload, before: null, after: null, reason, createdAt: createdAt.toISOString(),
      });
      const signature = env.AUDIT_HMAC_SECRET
        ? crypto.createHmac('sha256', env.AUDIT_HMAC_SECRET).update(toSign).digest('hex')
        : null;
      await request()
        .input('payload', sql.NVarChar(sql.MAX), JSON.stringify(payload))
        .input('reason', sql.NVarChar(sql.MAX), reason)
        .input('signature', sql.NVarChar(sql.MAX), signature)
        .input('createdAt', sql.DateTime2, createdAt)
        .query(`
          INSERT INTO dbo.audit_logs
            (event_type, user_name, user_role, payload, reason, signature, signature_version, created_at)
          VALUES
            ('FUTURE_DAYS_CLEANUP', 'RestoFlow Offline Fix', 'SYSTEM', @payload, @reason, @signature, 1, @createdAt)
        `);

      await transaction.commit();
      committed = true;

      // Verify: no future reports remain
      const verify = await pool.request()
        .input('fromDate', sql.Date, fromDate)
        .query(`SELECT COUNT(*) AS cnt FROM dbo.day_close_reports WHERE [date] >= @fromDate`);
      const remaining = Number(verify.recordset[0].cnt || 0);
      if (remaining !== 0) throw new Error(`POST_VERIFY_FAILED: ${remaining} future reports still exist`);

      process.stdout.write(JSON.stringify({ ok: true, ...results, verification: { remainingFutureReports: remaining } }));
    } catch (error) {
      if (!committed) await transaction.rollback().catch(() => undefined);
      throw error;
    }
  } finally {
    await pool.close();
  }
}

main().catch(error => {
  process.stderr.write(JSON.stringify({ ok: false, error: String(error?.message || error) }));
  process.exitCode = 1;
});
