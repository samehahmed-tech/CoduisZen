const fs = require('fs');
const path = require('path');
const sql = require('mssql/msnodesqlv8');

const root = path.resolve(__dirname, '..');
const envFile = path.join(root, '.env');

const readEnv = file => Object.fromEntries(fs.readFileSync(file, 'utf8')
  .split(/\r?\n/)
  .filter(line => line && !line.startsWith('#') && line.includes('='))
  .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));

async function main() {
  if (!fs.existsSync(envFile)) throw new Error(`Missing environment file: ${envFile}`);
  const connectionString = readEnv(envFile).DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is missing');

  const pool = await new sql.ConnectionPool({ connectionString }).connect();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const request = new sql.Request(transaction);
    const result = await request.batch(`
      DECLARE @today date = CONVERT(date, GETDATE());
      DECLARE @todayText nvarchar(10) = CONVERT(nvarchar(10), @today, 23);

      UPDATE dbo.branches
         SET business_date = @todayText,
             updated_at = GETDATE()
       WHERE business_date IS NULL OR business_date <> @todayText;
      DECLARE @branchesUpdated int = @@ROWCOUNT;

      UPDATE dbo.orders
         SET business_date = @todayText,
             updated_at = GETDATE()
       WHERE created_at >= @today
         AND created_at < DATEADD(day, 1, @today)
         AND (business_date IS NULL OR business_date <> @todayText);
      DECLARE @ordersUpdated int = @@ROWCOUNT;

      SELECT @todayText AS businessDate,
             @branchesUpdated AS branchesUpdated,
             @ordersUpdated AS ordersUpdated;
    `);
    await transaction.commit();
    process.stdout.write(JSON.stringify({ ok: true, ...result.recordset[0] }));
  } catch (error) {
    await transaction.rollback();
    throw error;
  } finally {
    await pool.close();
  }
}

main().catch(error => {
  process.stderr.write(JSON.stringify({ ok: false, error: String(error?.message || error) }));
  process.exitCode = 1;
});
