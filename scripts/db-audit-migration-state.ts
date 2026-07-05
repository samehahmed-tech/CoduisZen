import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const REQUIRED_PUBLIC_TABLES = [
    'branches',
    'orders',
    'order_items',
    'inventory_stock',
    'chart_of_accounts',
    'journal_entries',
    'posting_rules',
] as const;

async function main() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('DATABASE_URL is required.');
    }

    const client = new pg.Client({ connectionString });
    await client.connect();

    try {
        const publicTablesResult = await client.query<{ table_name: string }>(
            `
            select table_name
            from information_schema.tables
            where table_schema = 'public'
            order by table_name
            `,
        );

        const drizzleTablesResult = await client.query<{ table_name: string }>(
            `
            select table_name
            from information_schema.tables
            where table_schema = 'drizzle'
            order by table_name
            `,
        );

        const migrationRowsResult = await client.query<{ count: string }>(
            `
            select count(*)::text as count
            from information_schema.tables
            where table_schema = 'drizzle'
              and table_name = '__drizzle_migrations'
            `,
        );

        let migrationHistoryCount = 0;
        if (migrationRowsResult.rows[0]?.count !== '0') {
            const rows = await client.query<{ count: string }>(
                'select count(*)::text as count from drizzle.__drizzle_migrations',
            );
            migrationHistoryCount = Number(rows.rows[0]?.count || '0');
        }

        const publicTables = new Set(publicTablesResult.rows.map((row) => row.table_name));
        const missingCritical = REQUIRED_PUBLIC_TABLES.filter((tableName) => !publicTables.has(tableName));
        const drizzleTables = drizzleTablesResult.rows.map((row) => row.table_name);

        const summary = {
            publicTableCount: publicTablesResult.rowCount,
            drizzleTableCount: drizzleTablesResult.rowCount,
            migrationHistoryCount,
            missingCritical,
            ok: missingCritical.length === 0,
        };

        console.log(JSON.stringify(summary, null, 2));

        if (missingCritical.length > 0) {
            throw new Error(
                `Database schema is incomplete. Missing critical public tables: ${missingCritical.join(', ')}.`,
            );
        }

        if (migrationHistoryCount > 0 && publicTablesResult.rowCount === 0) {
            throw new Error(
                'Drizzle migration history exists, but public schema is empty. Migration journal is likely stale.',
            );
        }

        console.log(`Drizzle schema tables: ${drizzleTables.join(', ') || '(none)'}`);
        console.log('Migration state audit passed.');
    } finally {
        await client.end();
    }
}

main().catch((error) => {
    console.error('Migration state audit failed:', error);
    process.exit(1);
});
