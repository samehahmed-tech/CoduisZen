-- RestoFlow ERP client handover reset
-- Purpose:
--   Clear all trial/operational activity before delivering a configured client DB.
--
-- Keeps master/setup data:
--   users, roles, permissions, branches, tables/floor zones, menus/menu items,
--   recipes, inventory item definitions, warehouses, suppliers, printers,
--   delivery platforms/zones, drivers, settings, employees, HR setup,
--   chart of accounts, cost centers, tax/payment/posting rules.
--
-- Clears operational data:
--   orders, payments, expenses/journals, approvals, shifts, day close,
--   KDS tickets, delivery assignments, purchases/receiving, stock movements,
--   payroll/attendance operations, WhatsApp/campaign history, notifications,
--   runtime events, reports snapshots, and test customers unless preserved.
--
-- Usage from PowerShell:
--   psql "$env:DATABASE_URL" -v confirm_client_reset=YES -f scripts/reset-client-operational-data.sql
--
-- Optional:
--   Preserve customers:
--     psql "$env:DATABASE_URL" -v confirm_client_reset=YES -v preserve_customers=YES -f scripts/reset-client-operational-data.sql
--
--   Preserve current stock balances/batches:
--     psql "$env:DATABASE_URL" -v confirm_client_reset=YES -v preserve_inventory_stock=YES -f scripts/reset-client-operational-data.sql
--
-- Recommended before running:
--   pg_dump "$env:DATABASE_URL" -Fc -f ".\backups\before-client-reset.backup"

\if :{?confirm_client_reset}
\else
  \echo 'ERROR: pass -v confirm_client_reset=YES to run this reset script.'
  \quit 1
\endif

\if :{?preserve_customers}
\else
  \set preserve_customers NO
\endif

\if :{?preserve_inventory_stock}
\else
  \set preserve_inventory_stock NO
\endif

BEGIN;

SET LOCAL restoflow.confirm_client_reset = :'confirm_client_reset';
SET LOCAL restoflow.preserve_customers = :'preserve_customers';
SET LOCAL restoflow.preserve_inventory_stock = :'preserve_inventory_stock';

DO $$
DECLARE
  confirm_value text := upper(current_setting('restoflow.confirm_client_reset', true));
BEGIN
  IF confirm_value <> 'YES' THEN
    RAISE EXCEPTION 'confirm_client_reset must be YES.';
  END IF;
END $$;

DO $$
DECLARE
  table_name text;
  existing_table_count int := 0;
  preserve_customers boolean := upper(current_setting('restoflow.preserve_customers', true)) = 'YES';
  preserve_inventory_stock boolean := upper(current_setting('restoflow.preserve_inventory_stock', true)) = 'YES';
  truncate_tables text[] := ARRAY[
    -- Runtime/events/integration
    'webhook_deliveries',
    'notifications',
    'internal_messages',
    'domain_events',
    'idempotency_keys',
    'user_sessions',

    -- POS / orders / payments
    'refund_records',
    'payment_sessions',
    'payments',
    'order_status_history',
    'order_items',
    'orders',

    -- Delivery live operations
    'delivery_assignments',
    'driver_telemetry',
    'driver_telemetry_latest',

    -- Kitchen / KDS runtime
    'kds_ticket_items',
    'kds_tickets',

    -- Finance transactions, expenses, approvals, closing
    'manager_approvals',
    'finance_exceptions',
    'journal_lines',
    'journal_entries',
    'recurring_journals',
    'ledger_entries',
    'day_close_reports',
    'daily_branch_summaries',
    'item_daily_snapshots',
    'fiscal_logs',
    'eta_dead_letters',

    -- Procurement operations, keep supplier master data
    'supplier_payments',
    'supplier_invoice_items',
    'supplier_invoices',
    'grn_items',
    'goods_receipt_notes',
    'purchase_request_items',
    'purchase_requests',
    'purchase_order_items',
    'purchase_orders',

    -- Production and wastage-like operational records
    'production_order_items',
    'production_orders',

    -- Inventory operation history. Stock balances are handled separately below.
    'stock_count_lines',
    'stock_counts',
    'stock_movements',
    'inventory_ledger',

    -- Shift / operational logs
    'shifts',
    'audit_logs',

    -- CRM / WhatsApp / campaigns runtime
    'customer_complaints',
    'customer_rfm_metrics',
    'wallet_transactions',
    'loyalty_ledger',
    'campaign_logs',
    'campaigns',
    'whatsapp_messages',
    'reservations',
    'waitlists',
    'coupons',

    -- HR/payroll operations, keep employee and setup master data
    'attendance_raw_logs',
    'attendance_sessions',
    'attendance_sync_runs',
    'attendance_corrections',
    'attendance_exceptions',
    'attendance',
    'leave_requests',
    'leave_balances',
    'overtime_entries',
    'bonus_penalty_records',
    'employee_loans',
    'loan_installments',
    'payroll_run_lines',
    'payroll_runs',
    'payroll_locks',
    'payslips',
    'payroll_payouts',
    'payroll_cycles',
    'payroll',
    'user_daily_performance'
  ];
BEGIN
  IF NOT preserve_inventory_stock THEN
    truncate_tables := truncate_tables || ARRAY[
      'batch_transactions',
      'inventory_batches'
    ];
  END IF;

  IF NOT preserve_customers THEN
    truncate_tables := truncate_tables || ARRAY[
      'customer_wallets',
      'customer_addresses',
      'loyalty_rewards',
      'customers'
    ];
  END IF;

  FOREACH table_name IN ARRAY truncate_tables LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      existing_table_count := existing_table_count + 1;
      EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', table_name);
    END IF;
  END LOOP;

  -- Reset current stock quantities unless the client's real opening stock should be preserved.
  IF NOT preserve_inventory_stock AND to_regclass('public.inventory_stock') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns AS columns
      WHERE table_schema = 'public'
        AND columns.table_name = 'inventory_stock'
        AND column_name = 'last_updated'
    ) THEN
      UPDATE public.inventory_stock
         SET quantity = 0,
             last_updated = now();
    ELSE
      UPDATE public.inventory_stock
         SET quantity = 0;
    END IF;
  END IF;

  -- Clear active table occupancy while keeping floor/table design.
  IF to_regclass('public.tables') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns AS columns
      WHERE table_schema = 'public'
        AND columns.table_name = 'tables'
        AND column_name = 'status'
    ) THEN
      EXECUTE 'UPDATE public.tables SET status = ''AVAILABLE''';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns AS columns
      WHERE table_schema = 'public'
        AND columns.table_name = 'tables'
        AND column_name = 'current_order_id'
    ) THEN
      EXECUTE 'UPDATE public.tables SET current_order_id = NULL';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns AS columns
      WHERE table_schema = 'public'
        AND columns.table_name = 'tables'
        AND column_name = 'locked_by_user_id'
    ) THEN
      EXECUTE 'UPDATE public.tables SET locked_by_user_id = NULL';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns AS columns
      WHERE table_schema = 'public'
        AND columns.table_name = 'tables'
        AND column_name = 'updated_at'
    ) THEN
      EXECUTE 'UPDATE public.tables SET updated_at = now()';
    END IF;
  END IF;

  -- Reset branch operational day so the client starts clean.
  IF to_regclass('public.branches') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns AS columns
      WHERE table_schema = 'public'
        AND columns.table_name = 'branches'
        AND column_name = 'business_date'
    ) THEN
      EXECUTE 'UPDATE public.branches SET business_date = current_date::text';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns AS columns
      WHERE table_schema = 'public'
        AND columns.table_name = 'branches'
        AND column_name = 'updated_at'
    ) THEN
      EXECUTE 'UPDATE public.branches SET updated_at = now()';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns AS columns
      WHERE table_schema = 'public'
        AND columns.table_name = 'branches'
        AND column_name = 'is_day_open'
    ) THEN
      EXECUTE 'UPDATE public.branches SET is_day_open = false';
    END IF;
  END IF;

  -- Reset active driver runtime balance/status without deleting drivers.
  IF to_regclass('public.drivers') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns AS columns
      WHERE table_schema = 'public'
        AND columns.table_name = 'drivers'
        AND column_name = 'current_cash_balance'
    ) THEN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns AS columns
        WHERE table_schema = 'public'
          AND columns.table_name = 'drivers'
          AND column_name = 'is_active'
      ) THEN
        EXECUTE 'UPDATE public.drivers SET current_cash_balance = 0 WHERE coalesce(is_active, true) = true';
      ELSE
        EXECUTE 'UPDATE public.drivers SET current_cash_balance = 0';
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns AS columns
      WHERE table_schema = 'public'
        AND columns.table_name = 'drivers'
        AND column_name = 'updated_at'
    ) THEN
      EXECUTE 'UPDATE public.drivers SET updated_at = now()';
    END IF;
  END IF;

  RAISE NOTICE 'RestoFlow reset completed. Cleared existing operational tables: %, preserve_customers: %, preserve_inventory_stock: %',
    existing_table_count,
    preserve_customers,
    preserve_inventory_stock;
END $$;

COMMIT;

\echo ''
\echo 'RestoFlow client operational data reset completed.'
\echo ''
\echo 'Quick verification queries:'
\echo '  select count(*) from orders;'
\echo '  select count(*) from order_items;'
\echo '  select count(*) from payments;'
\echo '  select count(*) from journal_entries;'
\echo '  select count(*) from manager_approvals;'
\echo '  select count(*) from shifts;'

