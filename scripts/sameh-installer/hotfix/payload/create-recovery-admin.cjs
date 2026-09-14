const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const sql = require('mssql/msnodesqlv8');

const root = path.resolve(__dirname, '..');
const accounts = [
  { email: 'recovery.admin@restoflow.local', name: 'Recovery Admin', role: 'SUPER_ADMIN', pin: '202626' },
  { email: 'recovery.cashier@restoflow.local', name: 'Recovery Cashier', role: 'CASHIER', pin: '111111' },
];
const readEnv = file => Object.fromEntries((fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '')
  .split(/\r?\n/).filter(line => line && !line.startsWith('#') && line.includes('='))
  .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));

async function upsertPinUser(transaction, account, branchId) {
  const pinHash = await bcrypt.hash(account.pin, 12);
  const existing = await new sql.Request(transaction)
    .input('email', sql.NVarChar, account.email)
    .query('SELECT TOP (1) id FROM users WHERE LOWER(email) = LOWER(@email)');
  const userId = existing.recordset[0]?.id || `user-recovery-${crypto.randomUUID()}`;

  const activePinUsers = await new sql.Request(transaction)
    .input('id', sql.NVarChar, userId)
    .query('SELECT id, pin_code_hash FROM users WHERE id <> @id AND is_active = 1 AND pin_login_enabled = 1 AND pin_code_hash IS NOT NULL');
  for (const user of activePinUsers.recordset) {
    if (await bcrypt.compare(account.pin, user.pin_code_hash)) {
      throw new Error(`PIN ${account.pin} is already assigned to another active user. Change that PIN first.`);
    }
  }

  await new sql.Request(transaction)
    .input('id', sql.NVarChar, userId)
    .input('name', sql.NVarChar, account.name)
    .input('email', sql.NVarChar, account.email)
    .input('role', sql.NVarChar, account.role)
    .input('pinHash', sql.NVarChar, pinHash)
    .input('branchId', sql.NVarChar, branchId)
    .input('allowedBranches', sql.NVarChar, JSON.stringify([branchId]))
    .query(`
      IF EXISTS (SELECT 1 FROM users WHERE id = @id)
        UPDATE users SET name=@name, email=@email, role=@role, pin_code=NULL,
          pin_code_hash=@pinHash, pin_login_enabled=1, assigned_branch_id=@branchId,
          allowed_branches=@allowedBranches, permissions=N'[]', is_active=1, updated_at=GETDATE()
        WHERE id=@id;
      ELSE
        INSERT INTO users (id, name, email, role, pin_code, pin_code_hash, pin_login_enabled,
          assigned_branch_id, allowed_branches, permissions, is_active, created_at, updated_at)
        VALUES (@id, @name, @email, @role, NULL, @pinHash, 1,
          @branchId, @allowedBranches, N'[]', 1, GETDATE(), GETDATE());
    `);
  return { userId, email: account.email, role: account.role };
}

async function main() {
  const connectionString = readEnv(path.join(root, '.env')).DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is missing from the installed .env file.');

  const pool = await new sql.ConnectionPool({ connectionString }).connect();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const branch = await new sql.Request(transaction).query('SELECT TOP (1) id FROM branches WHERE is_active = 1 ORDER BY created_at, id');
    let branchId = branch.recordset[0]?.id;
    if (!branchId) {
      branchId = `branch-recovery-${crypto.randomUUID()}`;
      await new sql.Request(transaction)
        .input('id', sql.NVarChar, branchId)
        .query("INSERT INTO branches (id, name, name_ar, is_active, timezone, currency, tax_rate, service_charge, created_at, updated_at) VALUES (@id, N'Main Branch', N'الفرع الرئيسي', 1, N'Africa/Cairo', N'EGP', 14, 0, GETDATE(), GETDATE())");
    }

    const users = [];
    for (const account of accounts) users.push(await upsertPinUser(transaction, account, branchId));
    await transaction.commit();
    process.stdout.write(JSON.stringify({ ok: true, users, branchId }));
  } catch (error) {
    try { await transaction.rollback(); } catch {}
    throw error;
  } finally {
    await pool.close();
  }
}

main().catch(error => {
  process.stderr.write(JSON.stringify({ ok: false, error: String(error?.message || error) }));
  process.exitCode = 1;
});
