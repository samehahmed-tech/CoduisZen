'use strict';

// Move open-day profits 2026-10-16 into closed day 2026-10-15.
// - Moves dbo.orders.business_date FROM -> TO (all statuses, so day 16 previews zero).
// - Patches dbo.day_close_reports of TO date (totals + sales_snapshot.salesSummary).
// - Never touches dbo.branches.business_date (operating date stays on FROM).
// - Never reopens TO date. One audit row per branch. Transactional.

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

// Pure helper: add moved revenue aggregates into a stored sales_snapshot.
// Tested by --self-test. Keeps unknown snapshot keys untouched.
function patchSalesSnapshot(raw, moved) {
  let snap = {};
  try { snap = raw ? JSON.parse(raw) : {}; } catch { snap = {}; }
  const s = (snap.salesSummary && typeof snap.salesSummary === 'object') ? { ...snap.salesSummary } : {};
  const oldOrders = Number(s.totalOrders || 0);
  const oldRevenue = Number(s.totalRevenue || 0);
  const oldDiscount = Number(s.totalDiscount || 0);
  const oldTax = Number(s.totalTax || 0);
  const oldNet = Number(s.netSales || 0);
  const newOrders = oldOrders + moved.count;
  const newRevenue = oldRevenue + moved.revenue;
  const newDiscount = oldDiscount + moved.discount;
  const newTax = oldTax + moved.tax;
  const newNet = oldNet + (moved.merchandise - moved.discount);
  s.totalOrders = newOrders;
  s.totalRevenue = newRevenue;
  s.grossSales = newRevenue;
  s.totalDiscount = newDiscount;
  s.totalTax = newTax;
  s.netSales = newNet;
  s.averageOrderValue = newOrders > 0 ? newRevenue / newOrders : 0;
  snap.salesSummary = s;
  return JSON.stringify(snap);
}

if (process.argv.includes('--self-test')) {
  assert(validDate('2026-10-16'));
  assert(validDate('2026-10-15'));
  assert(!validDate('2026-02-30'));
  const out = JSON.parse(patchSalesSnapshot(
    JSON.stringify({ salesSummary: { totalOrders: 10, totalRevenue: 1000, grossSales: 1000, totalDiscount: 100, totalTax: 140, netSales: 900, averageOrderValue: 100 }, other: 1 }),
    { count: 2, revenue: 200, merchandise: 220, discount: 20, tax: 28 }
  ));
  assert.strictEqual(out.salesSummary.totalOrders, 12);
  assert.strictEqual(out.salesSummary.totalRevenue, 1200);
  assert.strictEqual(out.salesSummary.totalDiscount, 120);
  assert.strictEqual(out.salesSummary.totalTax, 168);
  assert.strictEqual(out.salesSummary.netSales, 1100);
  assert.strictEqual(out.other, 1);
  const empty = JSON.parse(patchSalesSnapshot(null, { count: 1, revenue: 50, merchandise: 50, discount: 0, tax: 7 }));
  assert.strictEqual(empty.salesSummary.totalOrders, 1);
  assert.strictEqual(empty.salesSummary.totalRevenue, 50);
  assert.strictEqual(stableStringify({ b: 2, a: 1 }), '{"a":1,"b":2}');
  process.stdout.write('move profits self-test OK');
  process.exit(0);
}

const root = path.resolve(readArg('install-dir') || path.join(__dirname, '..', '..'));
const fromDate = readArg('from-date') || '2026-10-16';
const toDate = readArg('to-date') || '2026-10-15';
const onlyBranchId = readArg('branch-id') || null;
const inspectOnly = process.argv.includes('--inspect');
const sql = createRequire(path.join(root, 'package.json'))('mssql/msnodesqlv8');

async function inspect(pool) {
  const result = await pool.request()
    .input('fromText', sql.NVarChar(10), fromDate)
    .input('toDate', sql.Date, toDate)
    .query(`
      SELECT b.id, b.name, b.business_date AS businessDate,
        (SELECT COUNT(*) FROM dbo.orders o
          WHERE o.branch_id = b.id AND o.business_date = @fromText
            AND o.status NOT IN ('CANCELLED', 'REFUNDED', 'VOID') AND o.deleted_at IS NULL) AS revenueOrdersOnFrom,
        (SELECT COALESCE(SUM(o.total), 0) FROM dbo.orders o
          WHERE o.branch_id = b.id AND o.business_date = @fromText
            AND o.status NOT IN ('CANCELLED', 'REFUNDED', 'VOID') AND o.deleted_at IS NULL) AS revenueOnFrom,
        (SELECT COUNT(*) FROM dbo.orders o
          WHERE o.branch_id = b.id AND o.business_date = @fromText) AS allOrdersOnFrom,
        (SELECT COUNT(*) FROM dbo.day_close_reports d
          WHERE d.branch_id = b.id AND d.[date] = @toDate) AS reportToCount,
        (SELECT COALESCE(SUM(d.total_revenue), 0) FROM dbo.day_close_reports d
          WHERE d.branch_id = b.id AND d.[date] = @toDate) AS reportToRevenue
      FROM dbo.branches b
      WHERE b.is_active = 1
      ORDER BY b.name, b.id
    `);
  return result.recordset.map(row => ({
    id: row.id,
    name: row.name,
    businessDate: row.businessDate,
    revenueOrdersOnFrom: Number(row.revenueOrdersOnFrom || 0),
    revenueOnFrom: Number(row.revenueOnFrom || 0),
    allOrdersOnFrom: Number(row.allOrdersOnFrom || 0),
    reportToCount: Number(row.reportToCount || 0),
    reportToRevenue: Number(row.reportToRevenue || 0),
    eligible: row.businessDate === fromDate
      && Number(row.revenueOrdersOnFrom || 0) > 0
      && Number(row.reportToCount || 0) === 1
      && (!onlyBranchId || row.id === onlyBranchId),
  }));
}

async function main() {
  if (!validDate(fromDate)) throw new Error('INVALID_FROM_DATE');
  if (!validDate(toDate)) throw new Error('INVALID_TO_DATE');
  if (fromDate <= toDate) throw new Error('FROM_MUST_BE_AFTER_TO');
  if (!inspectOnly && readArg('confirm') !== 'MOVE') throw new Error('Confirmation MOVE is required.');

  const env = readEnv(path.join(root, '.env'));
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is missing.');
  const pool = await new sql.ConnectionPool({ connectionString: env.DATABASE_URL, requestTimeout: 600000 }).connect();

  try {
    if (inspectOnly) {
      const candidates = await inspect(pool);
      process.stdout.write(JSON.stringify({ ok: true, fromDate, toDate, candidates }));
      return;
    }

    const pre = await inspect(pool);
    const targets = pre.filter(r => r.eligible);
    if (targets.length === 0) throw new Error('NO_ELIGIBLE_BRANCHES: need business_date=fromDate + revenue orders on fromDate + exactly one closed report on toDate.');
    const skipped = pre.filter(r => !r.eligible).map(r => r.id);

    const transaction = new sql.Transaction(pool);
    let committed = false;
    const applied = [];
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const request = () => new sql.Request(transaction);
      for (const t of targets) {
        const branchId = t.id;
        // Lock branch + report rows for this branch.
        const branchRows = await request()
          .input('branchId', sql.NVarChar(255), branchId)
          .input('fromText', sql.NVarChar(10), fromDate)
          .query(`SELECT id, business_date FROM dbo.branches WITH (UPDLOCK, HOLDLOCK) WHERE id = @branchId AND is_active = 1`);
        if (branchRows.recordset.length !== 1) throw new Error(`ACTIVE_BRANCH_NOT_FOUND: ${branchId}`);
        if (branchRows.recordset[0].business_date !== fromDate) throw new Error(`BUSINESS_DATE_CHANGED: ${branchId} expected ${fromDate}`);

        const agg = await request()
          .input('branchId', sql.NVarChar(255), branchId)
          .input('fromText', sql.NVarChar(10), fromDate)
          .query(`
            SELECT COUNT(*) AS cnt,
              COALESCE(SUM(total), 0) AS revenue,
              COALESCE(SUM(subtotal), 0) AS merchandise,
              COALESCE(SUM(discount), 0) AS discount,
              COALESCE(SUM(tax), 0) AS tax
            FROM dbo.orders WITH (UPDLOCK, HOLDLOCK)
            WHERE branch_id = @branchId AND business_date = @fromText
              AND status NOT IN ('CANCELLED', 'REFUNDED', 'VOID') AND deleted_at IS NULL
          `);
        const moved = {
          count: Number(agg.recordset[0].cnt || 0),
          revenue: Number(agg.recordset[0].revenue || 0),
          merchandise: Number(agg.recordset[0].merchandise || 0),
          discount: Number(agg.recordset[0].discount || 0),
          tax: Number(agg.recordset[0].tax || 0),
        };
        if (moved.count === 0) throw new Error(`NOTHING_TO_MOVE: ${branchId}`);

        const rep = await request()
          .input('branchId', sql.NVarChar(255), branchId)
          .input('toDate', sql.Date, toDate)
          .query(`SELECT id, total_orders, total_revenue, total_discounts, sales_snapshot
            FROM dbo.day_close_reports WITH (UPDLOCK, HOLDLOCK)
            WHERE branch_id = @branchId AND [date] = @toDate`);
        if (rep.recordset.length !== 1) throw new Error(`EXPECTED_ONE_CLOSED_REPORT_15: ${branchId}`);
        const row = rep.recordset[0];
        const newSnapshot = patchSalesSnapshot(row.sales_snapshot, moved);

        // 1. Move every order of FROM date to TO date (zeroes day-16 preview).
        await request()
          .input('branchId', sql.NVarChar(255), branchId)
          .input('fromText', sql.NVarChar(10), fromDate)
          .input('toText', sql.NVarChar(10), toDate)
          .query(`UPDATE dbo.orders SET business_date = @toText, updated_at = GETDATE()
            WHERE branch_id = @branchId AND business_date = @fromText`);

        // 2. Patch closed report of TO date with moved revenue (no reopen).
        await request()
          .input('branchId', sql.NVarChar(255), branchId)
          .input('toDate', sql.Date, toDate)
          .input('addCount', sql.Int, moved.count)
          .input('addRevenue', sql.Float, moved.revenue)
          .input('addDiscount', sql.Float, moved.discount)
          .input('snapshot', sql.NVarChar(sql.MAX), newSnapshot)
          .query(`UPDATE dbo.day_close_reports
            SET total_orders = COALESCE(total_orders, 0) + @addCount,
                total_revenue = COALESCE(total_revenue, 0) + @addRevenue,
                total_discounts = COALESCE(total_discounts, 0) + @addDiscount,
                sales_snapshot = @snapshot,
                updated_at = GETDATE()
            WHERE branch_id = @branchId AND [date] = @toDate`);

        // 3. Signed audit trail per branch.
        const createdAt = new Date();
        const reason = `Move open-day profits ${fromDate} into closed day ${toDate}`;
        const payload = { from: fromDate, to: toDate, branchId, moved, reportId: row.id };
        const toSign = stableStringify({
          eventType: 'PROFITS_MOVED_16_TO_15', userId: null, branchId, deviceId: null,
          payload, before: null, after: null, reason, createdAt: createdAt.toISOString(),
        });
        const signature = env.AUDIT_HMAC_SECRET
          ? crypto.createHmac('sha256', env.AUDIT_HMAC_SECRET).update(toSign).digest('hex')
          : null;
        await request()
          .input('branchId', sql.NVarChar(255), branchId)
          .input('payload', sql.NVarChar(sql.MAX), JSON.stringify(payload))
          .input('reason', sql.NVarChar(sql.MAX), reason)
          .input('signature', sql.NVarChar(sql.MAX), signature)
          .input('createdAt', sql.DateTime2, createdAt)
          .query(`
            INSERT INTO dbo.audit_logs
              (event_type, user_name, user_role, branch_id, payload, reason, signature, signature_version, created_at)
            VALUES
              ('PROFITS_MOVED_16_TO_15', 'RestoFlow Offline Fix', 'SYSTEM', @branchId, @payload, @reason, @signature, 1, @createdAt)
          `);
        applied.push({ branchId, branchName: t.name, moved, reportId: row.id });
      }
      await transaction.commit();
      committed = true;

      // Verification: FROM date empty, branches untouched, TO reports present.
      const verify = await pool.request()
        .input('fromText', sql.NVarChar(10), fromDate)
        .input('toDate', sql.Date, toDate)
        .query(`
          SELECT
            (SELECT COUNT(*) FROM dbo.orders WHERE business_date = @fromText) AS remainingOnFrom,
            (SELECT COUNT(*) FROM dbo.branches WHERE is_active = 1 AND business_date <> @fromText) AS branchesOffFrom,
            (SELECT COUNT(*) FROM dbo.day_close_reports WHERE [date] = @toDate) AS reportsOnTo,
            (SELECT COUNT(*) FROM dbo.audit_logs WHERE event_type = 'PROFITS_MOVED_16_TO_15' AND CAST(created_at AS date) = CAST(GETDATE() AS date)) AS auditToday
        `);
      const v = verify.recordset[0];
      if (Number(v.remainingOnFrom) !== 0) throw new Error(`POST_VERIFY_FAILED: ${v.remainingOnFrom} orders still on ${fromDate}`);
      process.stdout.write(JSON.stringify({ ok: true, fromDate, toDate, applied, skipped, verification: v }));
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
