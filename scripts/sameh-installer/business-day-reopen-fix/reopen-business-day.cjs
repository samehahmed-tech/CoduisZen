'use strict';

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
const nextDate = value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
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
  assert(validDate('2026-07-21'));
  assert(!validDate('2026-02-30'));
  assert.strictEqual(nextDate('2026-07-21'), '2026-07-22');
  assert.strictEqual(stableStringify({ b: 2, a: 1 }), '{"a":1,"b":2}');
  process.stdout.write('reopen business day self-test OK');
  process.exit(0);
}

const root = path.resolve(readArg('install-dir') || path.join(__dirname, '..'));
const targetDate = readArg('target-date');
const branchId = readArg('branch-id');
const inspectOnly = process.argv.includes('--inspect');
const sql = createRequire(path.join(root, 'package.json'))('mssql/msnodesqlv8');

async function inspect(pool, nextBusinessDate) {
  const result = await pool.request()
    .input('targetDate', sql.Date, targetDate)
    .input('nextDate', sql.Date, nextBusinessDate)
    .input('nextDateText', sql.NVarChar(10), nextBusinessDate)
    .query(`
      SELECT b.id, b.name, b.business_date AS businessDate,
        (SELECT COUNT_BIG(*) FROM dbo.day_close_reports d WHERE d.branch_id = b.id AND d.[date] = @targetDate) AS closeReports,
        (SELECT COUNT_BIG(*) FROM dbo.orders o WHERE o.branch_id = b.id AND o.business_date = @nextDateText) AS ordersOnNextDate,
        (SELECT COUNT_BIG(*) FROM dbo.shifts s WHERE s.branch_id = b.id AND CAST(s.opening_time AS date) = @nextDate) AS shiftsOnNextDate
      FROM dbo.branches b
      WHERE b.is_active = 1
        AND b.business_date = @nextDateText
        AND EXISTS (SELECT 1 FROM dbo.day_close_reports d WHERE d.branch_id = b.id AND d.[date] = @targetDate)
      ORDER BY b.name, b.id
    `);
  return result.recordset.map(row => ({
    ...row,
    closeReports: Number(row.closeReports),
    ordersOnNextDate: Number(row.ordersOnNextDate),
    shiftsOnNextDate: Number(row.shiftsOnNextDate),
  }));
}

async function main() {
  if (!validDate(targetDate)) throw new Error('INVALID_TARGET_DATE');
  if (!inspectOnly && readArg('confirm') !== 'REOPEN') throw new Error('Confirmation REOPEN is required.');
  if (!inspectOnly && !branchId) throw new Error('BRANCH_ID_REQUIRED');

  const env = readEnv(path.join(root, '.env'));
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is missing.');
  const nextBusinessDate = nextDate(targetDate);
  const pool = await new sql.ConnectionPool({ connectionString: env.DATABASE_URL, requestTimeout: 600000 }).connect();

  try {
    if (inspectOnly) {
      const candidates = await inspect(pool, nextBusinessDate);
      process.stdout.write(JSON.stringify({ ok: true, targetDate, nextBusinessDate, candidates }));
      return;
    }

    const transaction = new sql.Transaction(pool);
    let committed = false;
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const request = () => new sql.Request(transaction);
      const branchResult = await request().input('branchId', sql.NVarChar(255), branchId).query(`
        SELECT TOP (1) id, name, business_date
        FROM dbo.branches WITH (UPDLOCK, HOLDLOCK)
        WHERE id = @branchId AND is_active = 1
      `);
      const branch = branchResult.recordset[0];
      if (!branch) throw new Error('ACTIVE_BRANCH_NOT_FOUND');
      if (branch.business_date !== nextBusinessDate) throw new Error(`BUSINESS_DATE_MISMATCH: expected ${nextBusinessDate}, found ${branch.business_date}`);

      const closeResult = await request()
        .input('branchId', sql.NVarChar(255), branchId)
        .input('targetDate', sql.Date, targetDate)
        .query(`SELECT id FROM dbo.day_close_reports WITH (UPDLOCK, HOLDLOCK) WHERE branch_id = @branchId AND [date] = @targetDate`);
      if (closeResult.recordset.length !== 1) throw new Error(`EXPECTED_ONE_DAY_CLOSE_REPORT: found ${closeResult.recordset.length}`);

      const activity = await request()
        .input('branchId', sql.NVarChar(255), branchId)
        .input('nextDate', sql.Date, nextBusinessDate)
        .input('nextDateText', sql.NVarChar(10), nextBusinessDate)
        .query(`
          SELECT
            (SELECT COUNT_BIG(*) FROM dbo.orders WITH (UPDLOCK, HOLDLOCK) WHERE branch_id = @branchId AND business_date = @nextDateText) AS ordersOnNextDate,
            (SELECT COUNT_BIG(*) FROM dbo.shifts WITH (UPDLOCK, HOLDLOCK) WHERE branch_id = @branchId AND CAST(opening_time AS date) = @nextDate) AS shiftsOnNextDate
        `);
      const ordersOnNextDate = Number(activity.recordset[0]?.ordersOnNextDate || 0);
      const shiftsOnNextDate = Number(activity.recordset[0]?.shiftsOnNextDate || 0);
      if (ordersOnNextDate || shiftsOnNextDate) {
        throw new Error(`NEXT_DAY_ACTIVITY_EXISTS: orders=${ordersOnNextDate}, shifts=${shiftsOnNextDate}`);
      }

      const removedReportId = closeResult.recordset[0].id;
      await request()
        .input('branchId', sql.NVarChar(255), branchId)
        .input('targetDate', sql.Date, targetDate)
        .query('DELETE FROM dbo.day_close_reports WHERE branch_id = @branchId AND [date] = @targetDate');
      await request()
        .input('branchId', sql.NVarChar(255), branchId)
        .input('targetDateText', sql.NVarChar(10), targetDate)
        .query('UPDATE dbo.branches SET business_date = @targetDateText, updated_at = GETDATE() WHERE id = @branchId');

      const createdAt = new Date();
      const reason = 'Accidental day close repaired by offline fix';
      const payload = { date: targetDate, from: nextBusinessDate, to: targetDate, reason, removedDayCloseReportId: removedReportId };
      const toSign = stableStringify({
        eventType: 'DAY_REOPENED_BY_FIX', userId: null, branchId, deviceId: null,
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
            ('DAY_REOPENED_BY_FIX', 'RestoFlow Offline Fix', 'SYSTEM', @branchId, @payload, @reason, @signature, 1, @createdAt)
        `);

      await transaction.commit();
      committed = true;

      const verification = await pool.request()
        .input('branchId', sql.NVarChar(255), branchId)
        .input('targetDate', sql.Date, targetDate)
        .input('createdAt', sql.DateTime2, createdAt)
        .query(`
          SELECT
            (SELECT business_date FROM dbo.branches WHERE id = @branchId) AS businessDate,
            (SELECT COUNT_BIG(*) FROM dbo.day_close_reports WHERE branch_id = @branchId AND [date] = @targetDate) AS remainingCloseReports,
            (SELECT COUNT_BIG(*) FROM dbo.audit_logs WHERE branch_id = @branchId AND event_type = 'DAY_REOPENED_BY_FIX' AND created_at = @createdAt) AS auditRows
        `);
      const row = verification.recordset[0];
      if (row.businessDate !== targetDate || Number(row.remainingCloseReports) !== 0 || Number(row.auditRows) !== 1) {
        throw new Error('POST_REOPEN_VERIFICATION_FAILED');
      }
      process.stdout.write(JSON.stringify({ ok: true, branchId, branchName: branch.name, businessDate: targetDate, removedReportId, auditRecorded: true }));
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
