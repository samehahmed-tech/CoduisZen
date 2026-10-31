import { afterEach, beforeAll } from 'vitest';
import { eq, or, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { validateTestDatabaseTarget } from '../server/db/testDatabaseGuard';
import { users } from '../src/db/schema';

process.env.NODE_ENV = 'test';

// Integration/unit runs must never inherit production credentials. Provide deterministic
// throwaway trust-domain keys only inside the test process when the caller did not supply one.
// CI can still override these values explicitly when it needs rotation/compatibility coverage.
const TEST_SECRET_DEFAULTS: Record<string, string> = {
    JWT_SECRET: 'restoflow-test-jwt-secret-v1-32-chars-minimum',
    AUDIT_HMAC_SECRET: 'restoflow-test-audit-hmac-secret-v1-32-chars',
    PIN_LOOKUP_SECRET: 'restoflow-test-pin-lookup-secret-v1-32-chars',
    TRACK_TOKEN_SECRET: 'restoflow-test-track-token-secret-v1-32-chars',
};
for (const [name, value] of Object.entries(TEST_SECRET_DEFAULTS)) {
    if (!process.env[name]) process.env[name] = value;
}

const testDatabaseVerdict = validateTestDatabaseTarget({
    nodeEnv: process.env.NODE_ENV,
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    runtimeDatabaseUrl: process.env.DATABASE_URL,
    allowExplicit: process.env.ALLOW_TEST_DATABASE,
});
if ('reason' in testDatabaseVerdict) {
    throw new Error(`UNSAFE_TEST_DATABASE|${testDatabaseVerdict.reason}`);
}

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
            const recoveryHash = await bcrypt.hash('202626', 10);
            const [recoveryUser] = await state.db.select({ id: users.id })
                .from(users)
                .where(or(
                    eq(users.email, 'recovery.admin@restoflow.local'),
                    eq(users.id, 'test-recovery-admin'),
                ));
            if (!recoveryUser) {
                try {
                    await state.db.insert(users).values({
                        id: 'test-recovery-admin',
                        name: 'Test Recovery Admin',
                        email: 'recovery.admin@restoflow.local',
                        role: 'SUPER_ADMIN',
                        pinCodeHash: recoveryHash,
                        pinLoginEnabled: true,
                        assignedBranchId: 'b1',
                        allowedBranches: ['b1'],
                        permissions: ['*'],
                        isActive: true,
                    });
                } catch (error) {
                    // Multiple isolated Vitest workers may initialize the shared
                    // SQL database concurrently. A duplicate recovery-user key
                    // means another worker won the race; other DB errors remain
                    // actionable and must still fail setup.
                    const message = error instanceof Error ? error.message : String(error);
                    if (!message.includes('pk_users') || !message.includes('test-recovery-admin')) {
                        throw error;
                    }
                }
            }
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
        WHERE (
            (email LIKE '${TEST_EMAIL_PATTERN}'
                AND email NOT IN ('recovery.admin@restoflow.local', 'recovery.cashier@restoflow.local'))
            OR id LIKE 'test-%'
            OR id LIKE 'debug-%'
            OR id LIKE 'hist-%'
        )
        AND email NOT IN ('recovery.admin@restoflow.local', 'recovery.cashier@restoflow.local');
    `)).catch(() => undefined);

    await deleteByPrefixes('branches', 'id').catch(() => undefined);
};

beforeAll(async () => {
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
