const fs = require('node:fs');
const dotenv = require('dotenv');
const sql = require('mssql/msnodesqlv8');
async function main() {
  const env = dotenv.parse(fs.readFileSync('C:/Program Files/Sameh/RestoFlow ERP/.env'));
  if (!env.DATABASE_URL) throw new Error('Installed database target missing');
  const pool = await new sql.ConnectionPool({ connectionString: env.DATABASE_URL }).connect();
  try {
    for (const [label, query] of Object.entries({
      target: 'SELECT DB_NAME() AS databaseName, @@SERVERNAME AS serverName',
      columns: "SELECT TABLE_NAME,COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME IN ('inventory_ledger','inventory_batches','stock_movements','recipes','recipe_ingredients','menu_items') ORDER BY TABLE_NAME,ORDINAL_POSITION",
      branches: 'SELECT id,name FROM branches WHERE is_active=1',
      warehouses: 'SELECT id,name,branch_id,type FROM warehouses WHERE is_active=1',
      platforms: 'SELECT id,name FROM delivery_platforms',
      settings: "SELECT [key],value FROM settings WHERE [key] IN ('menus','activeMenuId','branchId')",
    })) {
      try { console.log(label, JSON.stringify((await pool.request().query(query)).recordset)); }
      catch (error) { console.log(label, error.message); }
    }
  } finally { await pool.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
