import { pool } from '../server/db';
import * as dotenv from 'dotenv';
import { COASeedService } from '../server/services/coaSeedService';
import { closeDatabase } from '../server/db';

dotenv.config();

const CREATE_POSTING_RULES_TABLE_SQL = `
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='posting_rules' AND xtype='U')
CREATE TABLE posting_rules (
    id nvarchar(100) PRIMARY KEY,
    document_type nvarchar(50) NOT NULL,
    amount_source nvarchar(50) NOT NULL,
    direction nvarchar(20) NOT NULL,
    account_code nvarchar(50) NOT NULL,
    condition_field nvarchar(100),
    condition_value nvarchar(100),
    is_active bit DEFAULT 1,
    is_system bit DEFAULT 0,
    version int DEFAULT 1,
    created_at datetime2 DEFAULT GETDATE(),
    updated_at datetime2 DEFAULT GETDATE()
);
`;

async function main() {
    console.log('[finance-foundation] Ensuring posting_rules table exists...');
    try {
        await pool.query(CREATE_POSTING_RULES_TABLE_SQL);

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
