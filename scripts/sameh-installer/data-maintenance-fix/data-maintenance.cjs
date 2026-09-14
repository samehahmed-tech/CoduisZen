'use strict';

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const installArg = process.argv.find(arg => arg.startsWith('--install-dir='));
const root = installArg ? path.resolve(installArg.slice('--install-dir='.length)) : path.resolve(__dirname, '..');
const sql = createRequire(path.join(root, 'runtime', 'database-backup.cjs'))('mssql/msnodesqlv8');

const VALID_ACTIONS = new Set(['stock', 'counts', 'menu', 'sales', 'inventory-items', 'inventory-cycle']);
const MENU_TABLES = [
  'recipe_ingredients', 'recipe_versions', 'recipes', 'menu_item_modifiers',
  'modifier_options', 'modifier_groups', 'item_daily_snapshots', 'menu_items', 'menu_categories'
];
const SALES_TABLES = [
  'kds_ticket_items', 'kds_tickets', 'customer_complaints', 'delivery_assignments',
  'refund_records', 'ledger_entries', 'fiscal_logs', 'order_payments', 'payment_sessions',
  'order_status_history', 'payments', 'order_items', 'orders', 'shifts',
  'day_close_reports', 'daily_branch_summaries', 'item_daily_snapshots'
];
const INVENTORY_ITEM_TABLES = [
  'batch_transactions', 'stock_count_lines', 'stock_counts', 'recipe_ingredients',
  'grn_items', 'supplier_invoice_items', 'production_order_items', 'production_orders',
  'purchase_request_items', 'purchase_order_items', 'inventory_ledger', 'inventory_stock',
  'inventory_batches', 'stock_movements', 'inventory_items'
];

const readEnv = file => Object.fromEntries(fs.readFileSync(file, 'utf8')
  .split(/\r?\n/)
  .filter(line => line && !line.startsWith('#') && line.includes('='))
  .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));

const quote = name => `[${String(name).replace(/]/g, ']]')}]`;

function selectedActions() {
  const raw = process.argv.find(arg => arg.startsWith('--actions='))?.slice('--actions='.length) || '';
  const actions = [...new Set(raw.split(',').map(value => value.trim().toLowerCase()).filter(Boolean))];
  if (!actions.length || actions.some(action => !VALID_ACTIONS.has(action))) {
    throw new Error('ACTIONS_REQUIRED: stock,counts,menu,sales,inventory-items,inventory-cycle');
  }
  return actions;
}

async function existingTables(pool) {
  const result = await pool.request().query(`SELECT LOWER(name) AS name FROM sys.tables WHERE schema_id = SCHEMA_ID('dbo')`);
  return new Set(result.recordset.map(row => String(row.name)));
}

async function tableSummary(pool, existing, table, amountColumn) {
  if (!existing.has(table)) return { rows: 0, amount: 0 };
  const amountSql = amountColumn ? `, COALESCE(SUM(${quote(amountColumn)}), 0) AS amount` : ', 0 AS amount';
  const result = await pool.request().query(`SELECT COUNT_BIG(*) AS rows ${amountSql} FROM dbo.${quote(table)}`);
  return { rows: Number(result.recordset[0].rows || 0), amount: Number(result.recordset[0].amount || 0) };
}

async function inspect(pool, existing, actions) {
  const preview = {};
  if (actions.includes('stock')) {
    preview.stock = {
      inventoryStock: await tableSummary(pool, existing, 'inventory_stock', 'quantity'),
      inventoryBatches: await tableSummary(pool, existing, 'inventory_batches', 'current_qty')
    };
  }
  if (actions.includes('counts')) {
    preview.counts = {
      sessions: await tableSummary(pool, existing, 'stock_counts'),
      lines: await tableSummary(pool, existing, 'stock_count_lines')
    };
  }
  if (actions.includes('menu')) {
    preview.menu = {
      categories: await tableSummary(pool, existing, 'menu_categories'),
      items: await tableSummary(pool, existing, 'menu_items'),
      recipes: await tableSummary(pool, existing, 'recipes'),
      modifierGroups: await tableSummary(pool, existing, 'modifier_groups')
    };
  }
  if (actions.includes('sales')) {
    preview.sales = {
      orders: await tableSummary(pool, existing, 'orders', 'total'),
      payments: await tableSummary(pool, existing, 'payments', 'amount'),
      shifts: await tableSummary(pool, existing, 'shifts'),
      dayCloses: await tableSummary(pool, existing, 'day_close_reports')
    };
  }
  if (actions.includes('inventory-items')) {
    preview.inventoryItems = {
      items: await tableSummary(pool, existing, 'inventory_items'),
      stockRows: await tableSummary(pool, existing, 'inventory_stock', 'quantity'),
      countSessions: await tableSummary(pool, existing, 'stock_counts'),
      recipeIngredients: await tableSummary(pool, existing, 'recipe_ingredients'),
      purchaseOrderLines: await tableSummary(pool, existing, 'purchase_order_items')
    };
  }
  if (actions.includes('inventory-cycle')) {
    preview.inventoryCycle = {
      stockMovements: await tableSummary(pool, existing, 'stock_movements', 'quantity'),
      inventoryLedger: await tableSummary(pool, existing, 'inventory_ledger', 'change'),
      batchTransactions: await tableSummary(pool, existing, 'batch_transactions', 'quantity_used'),
      inventoryBatches: await tableSummary(pool, existing, 'inventory_batches', 'current_qty'),
      stockRows: await tableSummary(pool, existing, 'inventory_stock', 'quantity')
    };
  }
  return preview;
}

async function deleteTables(request, existing, tableNames, deleted) {
  for (const table of tableNames) {
    if (!existing.has(table) || deleted[table] !== undefined) continue;
    const result = await request.query(`DELETE FROM dbo.${quote(table)}`);
    deleted[table] = Number(result.rowsAffected[0] || 0);
  }
}

async function resetStock(request, existing, changed) {
  if (existing.has('inventory_stock')) {
    const result = await request.query(`UPDATE dbo.inventory_stock SET quantity = 0, last_updated = GETDATE() WHERE COALESCE(quantity, 0) <> 0`);
    changed.inventoryStockRows = Number(result.rowsAffected[0] || 0);
  }
  if (existing.has('inventory_batches')) {
    const result = await request.query(`UPDATE dbo.inventory_batches SET current_qty = 0, status = 'DEPLETED' WHERE COALESCE(current_qty, 0) <> 0 OR status <> 'DEPLETED'`);
    changed.inventoryBatchRows = Number(result.rowsAffected[0] || 0);
  }
}

async function resetInventoryCycle(request, existing, deleted, changed) {
  await deleteTables(request, existing, ['batch_transactions', 'stock_movements', 'inventory_ledger', 'inventory_batches'], deleted);
  if (existing.has('inventory_stock')) {
    const result = await request.query(`UPDATE dbo.inventory_stock SET quantity = 0, last_updated = GETDATE() WHERE COALESCE(quantity, 0) <> 0`);
    changed.inventoryCycleStockRows = Number(result.rowsAffected[0] || 0);
  }
}

async function detachMenuHistory(request, existing, changed) {
  if (existing.has('order_items')) {
    const result = await request.query(`UPDATE dbo.order_items SET menu_item_id = NULL WHERE menu_item_id IS NOT NULL`);
    changed.detachedOrderItems = Number(result.rowsAffected[0] || 0);
  }
  if (existing.has('kds_ticket_items')) {
    // kds_ticket_items.menu_item_id is intentionally NOT NULL. A full menu reset
    // clears the operational KDS queue instead of writing an invalid NULL FK.
    const result = await request.query(`DELETE FROM dbo.kds_ticket_items`);
    changed.deletedKdsItems = Number(result.rowsAffected[0] || 0);
  }
  if (existing.has('kds_tickets')) {
    const result = await request.query(`DELETE FROM dbo.kds_tickets`);
    changed.deletedKdsTickets = Number(result.rowsAffected[0] || 0);
  }
}

async function detachInventoryRecipes(request, existing, changed) {
  if (!existing.has('recipes')) return;
  const result = await request.query(`UPDATE dbo.recipes SET inventory_item_id = NULL WHERE inventory_item_id IS NOT NULL`);
  changed.detachedInventoryRecipes = Number(result.rowsAffected[0] || 0);
}

async function clearSalesJournals(request, existing, deleted) {
  if (!existing.has('journal_entries')) return;
  if (existing.has('journal_lines')) {
    const lines = await request.query(`DELETE jl FROM dbo.journal_lines jl INNER JOIN dbo.journal_entries je ON je.id = jl.journal_entry_id WHERE je.reference_type IN ('ORDER', 'COGS')`);
    deleted.journal_lines = Number(lines.rowsAffected[0] || 0);
  }
  const entries = await request.query(`DELETE FROM dbo.journal_entries WHERE reference_type IN ('ORDER', 'COGS')`);
  deleted.journal_entries = Number(entries.rowsAffected[0] || 0);
}

async function resetTables(request, existing, changed) {
  if (!existing.has('tables')) return;
  const columns = await request.query(`SELECT LOWER(name) AS name FROM sys.columns WHERE object_id = OBJECT_ID('dbo.tables')`);
  const available = new Set(columns.recordset.map(row => String(row.name)));
  const assignments = ["status = 'AVAILABLE'"];
  if (available.has('current_order_id')) assignments.push('current_order_id = NULL');
  if (available.has('locked_by_user_id')) assignments.push('locked_by_user_id = NULL');
  if (available.has('updated_at')) assignments.push('updated_at = GETDATE()');
  const result = await request.query(`UPDATE dbo.tables SET ${assignments.join(', ')}`);
  changed.tablesReset = Number(result.rowsAffected[0] || 0);
}

async function apply(pool, existing, actions) {
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  const request = new sql.Request(transaction);
  const deleted = {};
  const changed = {};
  try {
    if (actions.includes('stock')) await resetStock(request, existing, changed);
    if (actions.includes('inventory-cycle')) await resetInventoryCycle(request, existing, deleted, changed);
    if (actions.includes('counts')) await deleteTables(request, existing, ['stock_count_lines', 'stock_counts'], deleted);
    if (actions.includes('sales')) {
      if (existing.has('orders')) await request.query(`UPDATE dbo.orders SET parent_order_id = NULL WHERE parent_order_id IS NOT NULL`);
      await clearSalesJournals(request, existing, deleted);
      await deleteTables(request, existing, SALES_TABLES, deleted);
      await resetTables(request, existing, changed);
    }
    if (actions.includes('inventory-items')) {
      await detachInventoryRecipes(request, existing, changed);
      await deleteTables(request, existing, INVENTORY_ITEM_TABLES, deleted);
    }
    if (actions.includes('menu')) {
      await detachMenuHistory(request, existing, changed);
      await deleteTables(request, existing, MENU_TABLES, deleted);
    }
    await transaction.commit();
    return { deleted, changed };
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
}

async function main() {
  const actions = selectedActions();
  const env = readEnv(path.join(root, '.env'));
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is missing.');
  const pool = await new sql.ConnectionPool({ connectionString: env.DATABASE_URL, requestTimeout: 600000 }).connect();
  try {
    const existing = await existingTables(pool);
    const preview = await inspect(pool, existing, actions);
    if (process.argv.includes('--inspect')) {
      process.stdout.write(JSON.stringify({ ok: true, actions, preview }));
      return;
    }
    const confirmation = actions.includes('inventory-cycle') ? '--confirm=RESET_INVENTORY_CYCLE' : '--confirm=DELETE';
    if (!process.argv.includes(confirmation)) throw new Error(`Confirmation ${confirmation.slice(10)} is required.`);
    const changes = await apply(pool, existing, actions);
    process.stdout.write(JSON.stringify({ ok: true, mode: 'SELECTIVE_DATA_MAINTENANCE', actions, preview, ...changes }));
  } finally {
    await pool.close();
  }
}

main().catch(error => {
  process.stderr.write(JSON.stringify({ ok: false, error: String(error?.message || error) }));
  process.exitCode = 1;
});
