'use strict';

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const installArg = process.argv.find(arg => arg.startsWith('--install-dir='));
const root = installArg ? path.resolve(installArg.slice('--install-dir='.length)) : path.resolve(__dirname, '..');
const sql = createRequire(path.join(root, 'package.json'))('mssql/msnodesqlv8');

const readEnv = file => Object.fromEntries(fs.readFileSync(file, 'utf8')
  .split(/\r?\n/)
  .filter(line => line && !line.startsWith('#') && line.includes('='))
  .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));

const tablesToClear = [
  'order_payments', 'payment_sessions', 'order_status_history', 'order_items', 'payments',
  'delivery_assignments', 'refund_records', 'idempotency_keys', 'kds_ticket_items', 'kds_tickets',
  'print_jobs', 'orders', 'shifts', 'day_close_reports', 'daily_branch_summaries',
  'item_daily_snapshots', 'stock_count_lines', 'stock_counts', 'batch_transactions',
  'inventory_batches', 'stock_movements', 'inventory_ledger', 'supplier_payments',
  'supplier_invoice_items', 'supplier_invoices', 'grn_items', 'goods_receipt_notes',
  'purchase_request_items', 'purchase_requests', 'purchase_order_items', 'purchase_orders',
  'production_order_items', 'production_orders', 'customer_addresses', 'customer_complaints',
  'customer_rfm_metrics', 'customer_wallets', 'wallet_transactions', 'loyalty_ledger',
  'waitlists', 'reservations', 'customers', 'journal_lines', 'journal_entries', 'ledger_entries',
  'finance_exceptions', 'fiscal_logs', 'audit_logs', 'domain_events', 'notifications',
  'internal_messages', 'webhook_deliveries', 'eta_dead_letters', 'campaign_logs', 'campaigns',
  'whatsapp_messages', 'driver_telemetry_latest', 'driver_telemetry', 'manager_approvals',
  'payroll_payouts', 'payslips', 'loan_installments', 'employee_loans', 'bonus_penalty_records',
  'payroll_run_lines', 'payroll_runs', 'payroll_locks', 'payroll_cycles', 'payroll',
  'leave_requests', 'leave_balances', 'overtime_entries', 'attendance', 'attendance_corrections',
  'attendance_exceptions', 'attendance_sessions', 'attendance_raw_logs', 'attendance_sync_runs',
  'shift_task_runs', 'shift_tasks', 'employee_shift_assignments', 'shift_plan_entries',
  'shift_plans', 'onboarding_records', 'user_daily_performance', 'user_sessions'
];

const protectedMasterTables = [
  'branches', 'users', 'roles', 'permission_definitions', 'menu_categories', 'menu_items',
  'modifier_groups', 'modifier_options', 'menu_item_modifiers', 'recipes', 'recipe_versions',
  'recipe_ingredients', 'inventory_items', 'warehouses', 'suppliers', 'floor_zones', 'tables',
  'printers', 'drivers', 'employees', 'chart_of_accounts'
];

const quote = name => `[${String(name).replace(/]/g, ']]')}]`;

async function main() {
  if (!process.argv.includes('--confirm=RESET')) throw new Error('Confirmation RESET is required.');
  const env = readEnv(path.join(root, '.env'));
  const connectionString = env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is missing.');

  const pool = await new sql.ConnectionPool({ connectionString, requestTimeout: 600000 }).connect();
  try {
    const tableResult = await pool.request().query(`SELECT LOWER(name) AS name FROM sys.tables WHERE schema_id = SCHEMA_ID('dbo')`);
    const existing = new Set(tableResult.recordset.map(row => String(row.name)));
    const targets = tablesToClear.filter(table => existing.has(table));
    const skipped = tablesToClear.filter(table => !existing.has(table));
    const targetSet = new Set(targets);

    const fkResult = await pool.request().query(`
      SELECT LOWER(OBJECT_NAME(parent_object_id)) AS child_table,
             LOWER(OBJECT_NAME(referenced_object_id)) AS parent_table
      FROM sys.foreign_keys
    `);
    const edges = new Map(targets.map(table => [table, new Set()]));
    const incoming = new Map(targets.map(table => [table, 0]));
    for (const row of fkResult.recordset) {
      const child = String(row.child_table || '');
      const parent = String(row.parent_table || '');
      if (!targetSet.has(child) || !targetSet.has(parent) || child === parent || edges.get(child).has(parent)) continue;
      edges.get(child).add(parent);
      incoming.set(parent, incoming.get(parent) + 1);
    }
    const queue = targets.filter(table => incoming.get(table) === 0);
    const deleteOrder = [];
    while (queue.length) {
      const table = queue.shift();
      deleteOrder.push(table);
      for (const parent of edges.get(table)) {
        const next = incoming.get(parent) - 1;
        incoming.set(parent, next);
        if (next === 0) queue.push(parent);
      }
    }
    if (deleteOrder.length !== targets.length) {
      throw new Error(`RESET_FOREIGN_KEY_CYCLE: ${targets.filter(table => !deleteOrder.includes(table)).join(', ')}`);
    }

    const masters = protectedMasterTables.filter(table => existing.has(table));
    const masterBefore = {};
    for (const table of masters) {
      const result = await pool.request().query(`SELECT COUNT_BIG(*) AS count FROM ${quote(table)}`);
      masterBefore[table] = Number(result.recordset[0].count);
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const deleted = {};
    try {
      if (existing.has('tables')) {
        const columns = await new sql.Request(transaction).query(`
          SELECT LOWER(name) AS name FROM sys.columns WHERE object_id = OBJECT_ID('dbo.tables')
        `);
        const available = new Set(columns.recordset.map(row => String(row.name)));
        const assignments = ["status = 'AVAILABLE'"];
        if (available.has('current_order_id')) assignments.push('current_order_id = NULL');
        if (available.has('locked_by_user_id')) assignments.push('locked_by_user_id = NULL');
        if (available.has('updated_at')) assignments.push('updated_at = GETDATE()');
        await new sql.Request(transaction).query(`UPDATE dbo.tables SET ${assignments.join(', ')}`);
      }

      for (const table of deleteOrder) {
        const result = await new sql.Request(transaction).query(`DELETE FROM dbo.${quote(table)}`);
        deleted[table] = Number(result.rowsAffected[0] || 0);
      }

      const identityResult = await new sql.Request(transaction).query(`
        SELECT LOWER(t.name) AS name
        FROM sys.tables t
        WHERE t.schema_id = SCHEMA_ID('dbo')
          AND EXISTS (SELECT 1 FROM sys.identity_columns c WHERE c.object_id = t.object_id)
      `);
      const identityTables = new Set(identityResult.recordset.map(row => String(row.name)));
      for (const table of deleteOrder.filter(table => identityTables.has(table))) {
        await new sql.Request(transaction).query(`DBCC CHECKIDENT ('dbo.${quote(table)}', RESEED, 0) WITH NO_INFOMSGS`);
      }

      if (existing.has('inventory_stock')) {
        const stockColumns = await new sql.Request(transaction).query(`
          SELECT LOWER(name) AS name FROM sys.columns WHERE object_id = OBJECT_ID('dbo.inventory_stock')
        `);
        const available = new Set(stockColumns.recordset.map(row => String(row.name)));
        const assignments = ['quantity = 0'];
        if (available.has('reserved_quantity')) assignments.push('reserved_quantity = 0');
        if (available.has('last_updated')) assignments.push('last_updated = GETDATE()');
        await new sql.Request(transaction).query(`UPDATE dbo.inventory_stock SET ${assignments.join(', ')}`);
      }

      if (existing.has('branches')) {
        const branchColumns = await new sql.Request(transaction).query(`
          SELECT LOWER(name) AS name FROM sys.columns WHERE object_id = OBJECT_ID('dbo.branches')
        `);
        const available = new Set(branchColumns.recordset.map(row => String(row.name)));
        const assignments = [];
        if (available.has('business_date')) assignments.push("business_date = CONVERT(varchar(10), GETDATE(), 23)");
        if (available.has('is_day_open')) assignments.push('is_day_open = 0');
        if (available.has('updated_at')) assignments.push('updated_at = GETDATE()');
        if (assignments.length) await new sql.Request(transaction).query(`UPDATE dbo.branches SET ${assignments.join(', ')}`);
      }

      if (existing.has('settings')) {
        await new sql.Request(transaction).query(`
          DELETE FROM dbo.settings WHERE [key] IN (
            'driverTelemetry', 'deliverySlaEscalations', 'whatsapp_inbox_v1',
            'whatsapp_escalations_v1', 'whatsapp_last_webhook_event'
          )
        `);
      }

      for (const table of masters) {
        const result = await new sql.Request(transaction).query(`SELECT COUNT_BIG(*) AS count FROM ${quote(table)}`);
        const after = Number(result.recordset[0].count);
        if (after !== masterBefore[table]) throw new Error(`MASTER_DATA_CHANGED: ${table} ${masterBefore[table]} -> ${after}`);
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback().catch(() => {});
      throw error;
    }

    const businessDate = existing.has('branches')
      ? (await pool.request().query(`SELECT TOP (1) business_date FROM dbo.branches ORDER BY id`)).recordset[0]?.business_date
      : null;
    process.stdout.write(JSON.stringify({
      ok: true,
      mode: 'CLEAN_OPERATIONAL_START',
      businessDate,
      clearedTables: deleteOrder.length,
      deletedRows: Object.values(deleted).reduce((sum, value) => sum + value, 0),
      deleted,
      skipped,
      preserved: masterBefore
    }));
  } finally {
    await pool.close();
  }
}

main().catch(error => {
  process.stderr.write(JSON.stringify({ ok: false, error: String(error?.message || error) }));
  process.exitCode = 1;
});
