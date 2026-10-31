import { db } from '../db';
import { sql } from 'drizzle-orm';

let schemaReady: Promise<void> | null = null;

/** Additive migration for order-level campaign attribution. */
export const ensureCampaignAttributionSchema = () => {
    if (!schemaReady) {
        schemaReady = db.execute(sql`
            IF COL_LENGTH('orders', 'campaign_id') IS NULL
                ALTER TABLE orders ADD campaign_id nvarchar(255) NULL;
            -- Older installs were created from a schema where an unbounded
            -- nvarchar/text campaign column could exist. SQL Server refuses
            -- to index those types (error 1919), which used to abort every
            -- order create because this additive repair runs in that path.
            IF EXISTS (
                SELECT 1
                FROM sys.columns c
                WHERE c.object_id = OBJECT_ID(N'orders')
                  AND c.name = N'campaign_id'
                  AND (c.max_length = -1 OR c.max_length > 510 OR c.system_type_id IN (35, 99))
            )
            BEGIN
                UPDATE orders
                SET campaign_id = LEFT(CONVERT(nvarchar(max), campaign_id), 255)
                WHERE campaign_id IS NOT NULL;
                ALTER TABLE orders ALTER COLUMN campaign_id nvarchar(255) NULL;
            END;
            IF NOT EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE name = N'orders_campaign_id_idx'
                  AND object_id = OBJECT_ID(N'orders')
            )
                CREATE INDEX orders_campaign_id_idx ON orders(campaign_id);
            IF COL_LENGTH('coupons', 'campaign_id') IS NULL
                ALTER TABLE coupons ADD campaign_id nvarchar(255) NULL;
            IF EXISTS (
                SELECT 1
                FROM sys.columns c
                WHERE c.object_id = OBJECT_ID(N'coupons')
                  AND c.name = N'campaign_id'
                  AND (c.max_length = -1 OR c.max_length > 510 OR c.system_type_id IN (35, 99))
            )
            BEGIN
                UPDATE coupons
                SET campaign_id = LEFT(CONVERT(nvarchar(max), campaign_id), 255)
                WHERE campaign_id IS NOT NULL;
                ALTER TABLE coupons ALTER COLUMN campaign_id nvarchar(255) NULL;
            END;
            IF NOT EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE name = N'coupons_campaign_id_idx'
                  AND object_id = OBJECT_ID(N'coupons')
            )
                CREATE INDEX coupons_campaign_id_idx ON coupons(campaign_id);
        `).then(() => undefined).catch((error) => {
            schemaReady = null;
            throw error;
        });
    }
    return schemaReady;
};
