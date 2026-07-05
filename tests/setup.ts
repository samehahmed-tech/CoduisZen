import { afterEach, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

dotenv.config();

type CleanupMode = 'truncate' | 'targeted';

type GlobalTestDbState = {
    readyPromise?: Promise<void>;
    ready?: boolean;
    db?: typeof import('../server/db')['db'];
};

const TEST_ID_PREFIXES = ['test-', 'debug-', 'hist-'];
const TEST_EMAIL_PATTERN = '%@restoflow.local';
const TEST_DB_SUFFIX = '_test';
const globalState = globalThis as typeof globalThis & {
    __restoflowTestDbState?: GlobalTestDbState;
};

const state = (globalState.__restoflowTestDbState ??= {});

const buildTestDatabaseUrl = (rawUrl: string) => {
    const parsed = new URL(rawUrl);
    const baseName = parsed.pathname.replace(/^\//, '') || 'restoflow_erp';
    parsed.pathname = `/${baseName.endsWith(TEST_DB_SUFFIX) ? baseName : `${baseName}${TEST_DB_SUFFIX}`}`;
    return parsed.toString();
};

const getDatabaseName = (rawUrl: string) => {
    try {
        return new URL(rawUrl).pathname.replace(/^\//, '');
    } catch {
        return '';
    }
};

const baseDatabaseUrl = process.env.TEST_DATABASE_URL || buildTestDatabaseUrl(process.env.DATABASE_URL || '');
const databaseName = getDatabaseName(baseDatabaseUrl);
const hasDedicatedTestDb = /(^|[-_])(test|e2e)([-_]|$)/i.test(databaseName);

if (hasDedicatedTestDb && baseDatabaseUrl) {
    process.env.DATABASE_URL = baseDatabaseUrl;
    process.env.DB_NAME = databaseName;
}

const ensureDatabaseExists = async (databaseUrl: string) => {
    const target = new URL(databaseUrl);
    const dbName = target.pathname.replace(/^\//, '');
    const adminUrl = new URL(databaseUrl);
    adminUrl.pathname = '/postgres';

    const adminPool = new pg.Pool({
        connectionString: adminUrl.toString(),
        max: 1,
    });

    try {
        const existing = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
        if (existing.rowCount === 0) {
            await adminPool.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
        }
    } finally {
        await adminPool.end();
    }
};

const pushSchemaToTestDatabase = async (databaseUrl: string) => {
    const migrationsDir = path.join(process.cwd(), 'drizzle');
    const journalPath = path.join(migrationsDir, 'meta', '_journal.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as {
        entries?: Array<{ idx: number; tag: string }>;
    };
    const migrationFiles = (journal.entries || [])
        .sort((a, b) => a.idx - b.idx)
        .map((entry) => path.join(migrationsDir, `${entry.tag}.sql`));

    const client = new pg.Client({ connectionString: databaseUrl });

    try {
        console.log(`[tests/setup] Applying schema to test database: ${getDatabaseName(databaseUrl)}`);
        await client.connect();

        for (const migrationFile of migrationFiles) {
            const migrationSql = fs.readFileSync(migrationFile, 'utf8');
            const statements = migrationSql
                .split('--> statement-breakpoint')
                .map((statement) => statement.trim())
                .filter(Boolean);

            console.log(`[tests/setup] Applying migration: ${path.basename(migrationFile)}`);
            for (const statement of statements) {
                await client.query(statement);
            }
        }

        console.log('[tests/setup] Schema applied successfully.');
    } finally {
        await client.end();
    }
};

const dropAllTables = async (databaseUrl: string) => {
    const client = new pg.Client({ connectionString: databaseUrl });
    try {
        await client.connect();
        console.log('[tests/setup] Dropping all tables in test database...');
        await client.query(`
            DROP SCHEMA public CASCADE;
            CREATE SCHEMA public;
            GRANT ALL ON SCHEMA public TO public;
            COMMENT ON SCHEMA public IS 'standard public schema';
        `);
        console.log('[tests/setup] Test database wiped.');
    } finally {
        await client.end();
    }
};

const ensureTestDatabaseReady = async () => {
    if (state.ready) return;
    if (!state.readyPromise) {
        state.readyPromise = (async () => {
            if (!baseDatabaseUrl || !hasDedicatedTestDb) {
                throw new Error(
                    `Dedicated test database URL could not be prepared. Current value: "${baseDatabaseUrl || 'missing'}".`,
                );
            }

            await ensureDatabaseExists(baseDatabaseUrl);
            await dropAllTables(baseDatabaseUrl);
            await pushSchemaToTestDatabase(baseDatabaseUrl);

            const serverDb = await import('../server/db');
            state.db = serverDb.db;
            state.ready = true;
        })();
    }

    await state.readyPromise;
};

const cleanupMode: CleanupMode = hasDedicatedTestDb ? 'truncate' : 'targeted';

const truncateTables = async () => {
    const db = state.db;
    if (!db) return;

    const tables = [
        'audit_logs',
        'order_payments',
        'order_items',
        'order_status_history',
        'orders',
        'stock_movements',
        'inventory_stock',
        'inventory_batches',
        'batch_transactions',
        'idempotency_keys',
        'user_sessions',
        'menu_items',
        'menu_categories',
        'recipes',
        'recipe_ingredients',
        'journal_lines',
        'journal_entries',
        'finance_exceptions',
        'warehouses',
        'shifts',
        'users',
        'branches',
        'chart_of_accounts',
        'posting_rules',
        'payment_method_accounts',
        'tax_accounts',
        'daily_branch_summaries',
        'customer_rfm_metrics',
        'item_daily_snapshots',
    ];

    for (const table of tables) {
        try {
            await db.execute(sql.raw(`TRUNCATE TABLE ${table} CASCADE;`));
        } catch {
            // Ignore missing tables in partially-migrated environments.
        }
    }
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

const targetedCleanup = async () => {
    const db = state.db;
    if (!db) return;

    const TABLES_WITH_ORDER_REF = [
        'order_payments', 'order_items', 'order_status_history', 
        'journal_entries', 'stock_movements', 'delivery_assignments'
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

    await deleteByPrefixes('idempotency_keys', 'key').catch(() => undefined);
    await deleteByPrefixes('menu_items', 'id').catch(() => undefined);
    await deleteByPrefixes('menu_categories', 'id').catch(() => undefined);
    await deleteByPrefixes('warehouses', 'id').catch(() => undefined);
    await deleteByPrefixes('shifts', 'id').catch(() => undefined);
    await deleteByPrefixes('branches', 'id').catch(() => undefined);
    await deleteByPrefixes('recipes', 'id').catch(() => undefined);
    await deleteByPrefixes('inventory_items', 'id').catch(() => undefined);
    await deleteByPrefixes('inventory_batches', 'id').catch(() => undefined);

    await db.execute(sql.raw(`
        DELETE FROM users
        WHERE email LIKE '${TEST_EMAIL_PATTERN}'
           OR id LIKE 'test-%'
           OR id LIKE 'debug-%'
           OR id LIKE 'hist-%';
    `)).catch(() => undefined);
};

beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await ensureTestDatabaseReady();

    if (!state.db) {
        console.error('Failed to initialize dedicated test database.');
        process.exit(1);
    }

    try {
        await state.db.execute(sql`SELECT 1`);
    } catch (error) {
        console.error('Failed to connect to test database:', error);
        process.exit(1);
    }

    if (cleanupMode === 'targeted') {
        console.warn(
            `[tests/setup] Running in targeted cleanup mode for database "${databaseName || 'unknown'}". ` +
            'Set TEST_ALLOW_DB_TRUNCATE=true or use a dedicated test DB name containing "test" or "e2e" for full truncation.',
        );
    }
});

afterEach(async () => {
    if (cleanupMode === 'truncate') {
        await truncateTables();
        return;
    }

    await targetedCleanup();
});
