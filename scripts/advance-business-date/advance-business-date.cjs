'use strict';

// Advance branch business_date to a target date.
// - Deletes erroneous day_close_reports for target date (blocks the advance).
// - Updates branches.business_date.
// - Never touches orders, payments, stock, or audit history.
// - Transactional + signed audit log.

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
  process.stdout.write('advance date self-test OK');
  process.exit(0);
}

const root = path.resolve(readArg('install-dir') || path.join(__dirname, '..', '..'));
const targetDate = readArg('target-date') || '2026-10-17';
const onlyBranchId = readArg('branch-id') || null;
const inspectOnly = process.argv.includes('--inspect');
const sql = createRequire(path.join(root, 'package.json'))('mssql/msnodesqlv8');

async function inspect(pool) {
  const result = await pool.request()
    .input('targetDate', sql.Date, targetDate)
    .input('targetText', sql.NVarChar(10), targetDate)
    .query(`
      SELECT b.id, b.name, b.business_date AS businessDate,
        (SELECT COUNT(*) FROM dbo.day_close_reports d
          WHERE d.branch_id = b.id AND d.[date] = @targetDate) AS reportOnTarget,
        (SELECT COUNT(*) FROM dbo.day_close_reports d
          WHERE d.branch_id = b.id AND d.[date] < @targetDate AND d.status = 'CLOSED') AS closedBeforeTarget,
        (SELECT COUNT(*) FROM dbo.orders o
          WHERE o.branch_id = b.id AND o.business_date = @targetText) AS ordersOnTarget
      FROM dbo.branches b
      WHERE b.is_active = 1
      ORDER BY b.name, b.id
    `);
  return result.recordset.map(row => ({
    id: row.id,
    name: row.name,
    businessDate: row.businessDate,
    reportOnTarget: Number(row.reportOnTarget || 0),
    closedBeforeTarget: Number(row.closedBeforeTarget || 0),
    ordersOnTarget: Number(row.ordersOnTarget || 0),
    eligible: row.businessDate !== targetDate
      && (!onlyBranchId || row.id === onlyBranchId),
  }));
}

async function main() {
  if (!validDate(targetDate)) throw new Error('INVALID_TARGET_DATE');
  if (!inspectOnly && readArg('confirm') !== 'ADVANCE') throw new Error('Confirmation ADVANCE is required.');

  const env = readEnv(path.join(root, '.env'));
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is missing.');
  const pool = await new sql.ConnectionPool({ connectionString: env.DATABASE_URL, requestTimeout: 600000 }).connect();

  try {
    if (inspectOnly) {
      const candidates = await inspect(pool);
      process.stdout.write(JSON.stringify({ ok: true, targetDate, candidates }));
      return;
    }

    const pre = await inspect(pool);
    const targets = pre.filter(r => r.eligible);
    if (targets.length === 0) throw new Error('NO_ELIGIBLE_BRANCHES: all branches already on target date or branch filter mismatch.');
    const skipped = pre.filter(r => !r.eligible).map(r => r.id);

    const transaction = new sql.Transaction(pool);
    let committed = false;
    const applied = [];
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const request = () => new sql.Request(transaction);
      for (const t of targets) {
        const branchId = t.id;
        const branchRows = await request()
          .input('branchId', sql.NVarChar(255), branchId)
          .query(`SELECT id, business_date FROM dbo.branches WITH (UPDLOCK, HOLDLOCK) WHERE id = @branchId AND is_active = 1`);
        if (branchRows.recordset.length !== 1) throw new Error(`ACTIVE_BRANCH_NOT_FOUND: ${branchId}`);
        const from = branchRows.recordset[0].business_date;

        // 1. Delete any day_close_reports for target date (blocking reports).
        const del = await request()
          .input('branchId', sql.NVarChar(255), branchId)
          .input('targetDate', sql.Date, targetDate)
          .query(`DELETE FROM dbo.day_close_reports WITH (UPDLOCK, HOLDLOCK)
            WHERE branch_id = @branchId AND [date] = @targetDate`);
        const removedReports = Number(del.rowsAffected[0] || 0);

        // 2. Advance business date.
        await request()
          .input('branchId', sql.NVarChar(255), branchId)
          .input('targetText', sql.NVarChar(10), targetDate)
          .query(`UPDATE dbo.branches SET business_date = @targetText, updated_at = GETDATE()
            WHERE id = @branchId`);

        // 3. Audit.
        const createdAt = new Date();
        const reason = `Advance business date ${from} -> ${targetDate} (deleted ${removedReports} blocking report(s))`;
        const payload = { branchId, from, to: targetDate, removedReports, ordersOnTarget: t.ordersOnTarget };
        const toSign = stableStringify({
          eventType: 'BUSINESS_DATE_ADVANCED_BY_FIX', userId: null, branchId, deviceId: null,
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
              ('BUSINESS_DATE_ADVANCED_BY_FIX', 'RestoFlow Offline Fix', 'SYSTEM', @branchId, @payload, @reason, @signature, 1, @createdAt)
          `);

        applied.push({ branchId, branchName: t.name, from, to: targetDate, removedReports });
      }
      await transaction.commit();
      committed = true;

      // Verification.
      const verify = await pool.request()
        .input('targetDate', sql.Date, targetDate)
        .input('targetText', sql.NVarChar(10), targetDate)
        .query(`
          SELECT
            (SELECT COUNT(*) FROM dbo.branches WHERE is_active = 1 AND business_date = @targetText) AS onTarget,
            (SELECT COUNT(*) FROM dbo.day_close_reports WHERE [date] = @targetDate) AS reportsOnTarget
        `);
      const v = verify.recordset[0];
      if (Number(v.reportsOnTarget) !== 0) throw new Error(`POST_VERIFY_FAILED: ${v.reportsOnTarget} reports still on target date`);
      process.stdout.write(JSON.stringify({ ok: true, targetDate, applied, skipped, verification: v }));
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
