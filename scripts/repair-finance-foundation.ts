import pg from 'pg';
import * as dotenv from 'dotenv';
import { COASeedService } from '../server/services/coaSeedService';
import { closeDatabase } from '../server/db';

dotenv.config();

const CREATE_POSTING_RULES_TABLE_SQL = `
create table if not exists "posting_rules" (
    "id" text primary key not null,
    "document_type" text not null,
    "amount_source" text not null,
    "direction" text not null,
    "account_code" text not null,
    "condition_field" text,
    "condition_value" text,
    "is_active" boolean default true,
    "is_system" boolean default false,
    "version" integer default 1,
    "created_at" timestamp default now(),
    "updated_at" timestamp default now()
);
`;

async function ensurePostingRulesTable() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('DATABASE_URL is required.');
    }

    const client = new pg.Client({ connectionString });
    await client.connect();

    try {
        await client.query(CREATE_POSTING_RULES_TABLE_SQL);
    } finally {
        await client.end();
    }
}

async function main() {
    console.log('[finance-foundation] Ensuring posting_rules table exists...');
    try {
        await ensurePostingRulesTable();

        console.log('[finance-foundation] Running idempotent COA backfill...');
        await COASeedService.seed();

        console.log('[finance-foundation] Finance foundation is ready.');
    } finally {
        await closeDatabase();
    }
}

main().catch((error) => {
    console.error('[finance-foundation] Failed:', error);
    process.exit(1);
});
