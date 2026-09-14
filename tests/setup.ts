import { afterEach, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import mssql from 'mssql';

dotenv.config();

type GlobalTestDbState = {
    readyPromise?: Promise<void>;
    ready?: boolean;
    db?: typeof import('../server/db')['db'];
};

const TEST_ID_PREFIXES = ['test-', 'debug-', 'hist-'];
const TEST_EMAIL_PATTERN = '%@restoflow.local';
const globalState = globalThis as typeof globalThis & {
    __restoflowTestDbState?: GlobalTestDbState;
};

const state = (globalState.__restoflowTestDbState ??= {});

const ensureTestDatabaseReady = async () => {
    if (state.ready) {
        const serverDb = await import('../server/db');
        await serverDb.waitForDatabase();
        state.db = serverDb.db;
        return;
    }
    if (!state.readyPromise) {
        state.readyPromise = (async () => {
            const serverDb = await import('../server/db');
            await serverDb.waitForDatabase();
            state.db = serverDb.db;
            await state.db.execute(sql.raw(`
                IF COL_LENGTH('dbo.purchase_orders', 'target_warehouse_id') IS NULL
                    ALTER TABLE purchase_orders ADD target_warehouse_id nvarchar(255) NULL;
            `));
            await state.db.execute(sql.raw(`
                IF COL_LENGTH('dbo.orders', 'scheduled_for') IS NULL
                    ALTER TABLE orders ADD scheduled_for datetime2(3) NULL;
            `));
            state.ready = true;
        })();
    }
    await state.readyPromise;
};

const deleteByPrefixes = async (table: string, column: string) => {
    const db = state.db;
    if (!db) return;

    const conditions = TEST_ID_PREFIXES
        .map((prefix) => `${column} LIKE '${prefix}%'`)
        .join(' OR ');
    if (!conditions) return;
    await db.execute(sql.raw(`DELETE FROM ${table} WHERE ${conditions};`));
};

const deleteByTestBranches = async (table: string) => {
    await deleteByPrefixes(table, 'branch_id');
};

const targetedCleanup = async () => {
    const db = state.db;
    if (!db) return;

    const TABLES_WITH_ORDER_REF = [
        'payment_sessions', 'payments', 'order_payments', 'order_items', 'order_status_history',
        'kds_tickets', 'print_jobs', 'journal_entries', 'ledger_entries', 'stock_movements',
        'delivery_assignments', 'customer_complaints', 'refund_records', 'whatsapp_messages',
    ];

    for (const table of TABLES_WITH_ORDER_REF) {
        await db.execute(sql.raw(`
            DELETE FROM ${table}
            WHERE order_id IN (
                SELECT id FROM orders
                WHERE branch_id LIKE 'test-%' OR branch_id LIKE 'debug-%' OR branch_id LIKE 'hist-%'
            );
        `)).catch(() => undefined);
    }

    await db.execute(sql.raw(`
        UPDATE orders SET parent_order_id = NULL
        WHERE parent_order_id IN (
            SELECT id FROM orders
            WHERE branch_id LIKE 'test-%' OR branch_id LIKE 'debug-%' OR branch_id LIKE 'hist-%'
        );
    `)).catch(() => undefined);

    await db.execute(sql.raw(`
        DELETE FROM orders
        WHERE branch_id LIKE 'test-%' OR branch_id LIKE 'debug-%' OR branch_id LIKE 'hist-%';
    `)).catch(() => undefined);

    await db.execute(sql.raw(`
        DELETE FROM user_sessions
        WHERE user_id IN (
            SELECT id FROM users
            WHERE email LIKE '${TEST_EMAIL_PATTERN}'
        );
    `)).catch(() => undefined);

    for (const table of [
        'attendance_exceptions',
        'attendance_corrections',
        'attendance_sessions',
        'attendance_raw_logs',
        'employee_documents',
        'employee_shift_assignments',
        'employee_payroll_assignments',
        'bonus_penalty_records',
        'employee_loans',
        'employees',
        'attendance_policies',
        'attendance_devices',
    ]) {
        await deleteByTestBranches(table).catch(() => undefined);
    }

    await deleteByPrefixes('idempotency_keys', 'key').catch(() => undefined);
    await deleteByPrefixes('recipe_ingredients', 'recipe_id').catch(() => undefined);
    await deleteByPrefixes('inventory_stock', 'item_id').catch(() => undefined);
    await deleteByPrefixes('inventory_batches', 'id').catch(() => undefined);
    await deleteByPrefixes('recipes', 'id').catch(() => undefined);
    await deleteByPrefixes('menu_items', 'id').catch(() => undefined);
    await deleteByPrefixes('menu_categories', 'id').catch(() => undefined);
    await deleteByPrefixes('inventory_items', 'id').catch(() => undefined);
    await deleteByPrefixes('shifts', 'id').catch(() => undefined);
    await deleteByPrefixes('warehouses', 'id').catch(() => undefined);
    await deleteByPrefixes('cost_centers', 'id').catch(() => undefined);
    await deleteByPrefixes('fiscal_periods', 'id').catch(() => undefined);
    await deleteByTestBranches('tables').catch(() => undefined);
    await deleteByTestBranches('floor_zones').catch(() => undefined);

    await db.execute(sql.raw(`
        DELETE FROM users
        WHERE email LIKE '${TEST_EMAIL_PATTERN}'
           OR id LIKE 'test-%'
           OR id LIKE 'debug-%'
           OR id LIKE 'hist-%';
    `)).catch(() => undefined);

    await deleteByPrefixes('branches', 'id').catch(() => undefined);
};

beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await ensureTestDatabaseReady();

    if (!state.db) {
        console.error('Failed to initialize test database.');
        process.exit(1);
    }

    try {
        await state.db.execute(sql`SELECT 1`);
        await targetedCleanup();
    } catch (error) {
        console.error('Failed to connect to test database:', error);
        process.exit(1);
    }
});

afterEach(async () => {
    await targetedCleanup();
});
