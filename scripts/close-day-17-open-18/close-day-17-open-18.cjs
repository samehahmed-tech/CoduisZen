'use strict';

// Fold the drifted future days back into one bucket day, then hand that day
// back to the app to be closed normally.
//
// Root cause it repairs: auto-close (old build, no future-date guard) advanced
// the branch business date day after day, so real sales ended up scattered
// across 2026-10-18 .. 2026-10-29 instead of one clean operating day.
//
// What it does (one SERIALIZABLE transaction, signed audit row):
//   1. Moves every order dated on/after `from-date` (>= bucket+1) to `target-date`.
//   2. Deletes every day_close_report with [date] >= `target-date` (stale/wrong
//      bucket report included, so the app regenerates it correctly).
//   3. Deletes every daily_pnl_snapshot with business_date >= `target-date`.
//   4. Sets branches.business_date = `target-date`.
//   5. Writes a signed DAY_MERGED_AND_RESET audit row.
//
// After this the app closes `target-date` as usual (Close Day, or the fixed
// auto-close on server restart), which advances business_date to the next day.

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
const addDays = (value, days) => {
  const d = new Date(`${value}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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
  assert.strictEqual(addDays('2026-10-17', 1), '2026-10-18');
  assert.strictEqual(addDays('2026-01-31', 1), '2026-02-01');
  assert(stableStringify({ b: 2, a: 1 }) === '{"a":1,"b":2}');
  process.stdout.write('close-day-17 self-test OK');
  process.exit(0);
}

const root = path.resolve(readArg('install-dir') || path.join(__dirname, '..', '..'));
const targetDate = readArg('target-date') || '2026-10-17';   // bucket day to close
const fromDate = readArg('from-date') || addDays(targetDate, 1); // first drifted day
const onlyBranchId = readArg('branch-id') || null;
const inspectOnly = process.argv.includes('--inspect');
const sql = createRequire(path.join(root, 'package.json'))('mssql/msnodesqlv8');

async function inspect(pool) {
  const futureReports = await pool.request()
    .input('targetDate', sql.Date, targetDate)
    .query(`
      SELECT branch_id, [date], total_revenue, total_orders, status, closed_at
      FROM dbo.day_close_reports
      WHERE [date] >= @targetDate
      ORDER BY branch_id, [date]
    `);

  const futureOrders = await pool.request()
    .input('fromDate', sql.NVarChar(10), fromDate)
    .query(`
      SELECT branch_id, business_date, COUNT(*) AS cnt, COALESCE(SUM(total), 0) AS revenue
      FROM dbo.orders
      WHERE business_date >= @fromDate AND deleted_at IS NULL
      GROUP BY branch_id, business_date
      ORDER BY branch_id, business_date
    `);

  const bucketOrders = await pool.request()
    .input('targetDate', sql.NVarChar(10), targetDate)
    .query(`
      SELECT branch_id,
        COUNT(*) AS cnt,
        COALESCE(SUM(CASE WHEN status NOT IN ('CANCELLED','REFUNDED','VOID') THEN total ELSE 0 END), 0) AS revenue
      FROM dbo.orders
      WHERE business_date = @targetDate AND deleted_at IS NULL
      GROUP BY branch_id
      ORDER BY branch_id
    `);

  const futurePnl = await pool.request()
    .input('targetDate', sql.Date, targetDate)
    .query(`
      SELECT branch_id, business_date, status, total_revenue
      FROM dbo.daily_pnl_snapshots
      WHERE business_date >= @targetDate
      ORDER BY branch_id, business_date
    `);

  const branches = await pool.request().query(`
    SELECT id, name, business_date
    FROM dbo.branches
    WHERE is_active = 1
    ORDER BY name, id
  `);

  return {
    targetDate,
    fromDate,
    futureReports: futureReports.recordset,
    futureOrders: futureOrders.recordset,
    bucketOrders: bucketOrders.recordset,
    futurePnl: futurePnl.recordset,
    branches: branches.recordset,
  };
}

async function main() {
  if (!validDate(fromDate)) throw new Error('INVALID_FROM_DATE');
  if (!validDate(targetDate)) throw new Error('INVALID_TARGET_DATE');
  if (fromDate <= targetDate) throw new Error('FROM_MUST_BE_AFTER_TARGET');
  if (!inspectOnly && readArg('confirm') !== 'MERGE') throw new Error('Confirmation MERGE is required.');

  const env = readEnv(path.join(root, '.env'));
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is missing.');
  const pool = await new sql.ConnectionPool({ connectionString: env.DATABASE_URL, requestTimeout: 600000 }).connect();

  try {
    const pre = await inspect(pool);

    if (inspectOnly) {
      process.stdout.write(JSON.stringify({ ok: true, ...pre }));
      return;
    }

    const transaction = new sql.Transaction(pool);
    let committed = false;
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const request = () => new sql.Request(transaction);
      const results = { targetDate, fromDate, movedOrders: 0, deletedReports: 0, deletedPnl: 0, branchesUpdated: [] };

      // 1. Move every drifted order into the bucket day.
      const moveOrders = await request()
        .input('fromDate', sql.NVarChar(10), fromDate)
        .input('targetDate', sql.NVarChar(10), targetDate)
        .query(`UPDATE dbo.orders SET business_date = @targetDate, updated_at = GETDATE()
          WHERE business_date >= @fromDate AND deleted_at IS NULL`);
      results.movedOrders = Number(moveOrders.rowsAffected[0] || 0);

      // 2. Delete every report from the bucket day onward (bucket report is
      //    regenerated by the app close so it reflects the merged orders).
      const delReports = await request()
        .input('targetDate', sql.Date, targetDate)
        .query(`DELETE FROM dbo.day_close_reports WHERE [date] >= @targetDate`);
      results.deletedReports = Number(delReports.rowsAffected[0] || 0);

      // 3. Delete future pnl snapshots from the bucket day onward.
      try {
        const delPnl = await request()
          .input('targetDate', sql.Date, targetDate)
          .query(`DELETE FROM dbo.daily_pnl_snapshots WHERE business_date >= @targetDate`);
        results.deletedPnl = Number(delPnl.rowsAffected[0] || 0);
      } catch { /* legacy databases may not have this table */ }

      // 4. Point the operating date at the bucket day.
      const branchIds = onlyBranchId ? [onlyBranchId] : pre.branches.map(b => b.id);
      for (const branchId of branchIds) {
        const upd = await request()
          .input('branchId', sql.NVarChar(255), branchId)
          .input('targetText', sql.NVarChar(10), targetDate)
          .query(`UPDATE dbo.branches SET business_date = @targetText, updated_at = GETDATE() WHERE id = @branchId`);
        if (Number(upd.rowsAffected[0] || 0) > 0) results.branchesUpdated.push(branchId);
      }

      // 5. Signed audit trail.
      const createdAt = new Date();
      const reason = `Merge days >= ${fromDate} into ${targetDate} and reset business_date. Moved ${results.movedOrders} orders, deleted ${results.deletedReports} reports, ${results.deletedPnl} pnl snapshots.`;
      const payload = results;
      const toSign = stableStringify({
        eventType: 'DAY_MERGED_AND_RESET', userId: null, branchId: null, deviceId: null,
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
            ('DAY_MERGED_AND_RESET', 'RestoFlow Offline Fix', 'SYSTEM', @payload, @reason, @signature, 1, @createdAt)
        `);

      await transaction.commit();
      committed = true;

      // Verify: no reports at/after the bucket day, no drifted orders left,
      // and every targeted branch now points at the bucket day.
      const verify = await pool.request()
        .input('targetDate', sql.Date, targetDate)
        .input('fromDate', sql.NVarChar(10), fromDate)
        .input('targetText', sql.NVarChar(10), targetDate)
        .query(`
          SELECT
            (SELECT COUNT(*) FROM dbo.day_close_reports WHERE [date] >= @targetDate) AS reportsRemaining,
            (SELECT COUNT(*) FROM dbo.orders WHERE business_date >= @fromDate AND deleted_at IS NULL) AS ordersRemaining,
            (SELECT COUNT(*) FROM dbo.branches WHERE is_active = 1 AND business_date <> @targetText) AS branchesOffTarget,
            (SELECT COUNT(*) FROM dbo.orders WHERE business_date = @targetText AND deleted_at IS NULL) AS bucketOrderCount
        `);
      const v = verify.recordset[0];
      if (Number(v.reportsRemaining) !== 0) throw new Error(`POST_VERIFY_FAILED: ${v.reportsRemaining} reports still >= ${targetDate}`);
      if (Number(v.ordersRemaining) !== 0) throw new Error(`POST_VERIFY_FAILED: ${v.ordersRemaining} orders still >= ${fromDate}`);
      if (!onlyBranchId && Number(v.branchesOffTarget) !== 0) throw new Error(`POST_VERIFY_FAILED: ${v.branchesOffTarget} branches not on ${targetDate}`);

      process.stdout.write(JSON.stringify({ ok: true, ...results, verification: v }));
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
