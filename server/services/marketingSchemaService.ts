import { sql } from 'drizzle-orm';
import { db } from '../db';

let schemaReady: Promise<void> | null = null;

/** Additive branch provenance for customer complaints on existing databases. */
export const ensureMarketingSchema = () => {
    if (!schemaReady) {
        schemaReady = db.execute(sql`
            IF COL_LENGTH('dbo.customer_complaints', 'branch_id') IS NULL
                ALTER TABLE dbo.customer_complaints ADD branch_id nvarchar(255) NULL;
            IF COL_LENGTH('dbo.coupons', 'branch_id') IS NULL
                ALTER TABLE dbo.coupons ADD branch_id nvarchar(255) NULL;
            IF COL_LENGTH('dbo.campaigns', 'branch_id') IS NULL
                ALTER TABLE dbo.campaigns ADD branch_id nvarchar(255) NULL;
            IF COL_LENGTH('dbo.customers', 'birth_date') IS NULL
                ALTER TABLE dbo.customers ADD birth_date datetime2 NULL;
            -- Legacy installers created status as nvarchar(max), which cannot
            -- participate in an index. Campaign status is a bounded enum, so
            -- normalize the legacy column before creating the branch index.
            IF EXISTS (
                SELECT 1
                FROM sys.columns
                WHERE object_id = OBJECT_ID(N'dbo.campaigns')
                  AND name = N'status'
                  AND max_length = -1
            )
            BEGIN
                DECLARE @campaignStatusDefault sysname;
                SELECT @campaignStatusDefault = dc.name
                FROM sys.default_constraints dc
                JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
                WHERE dc.parent_object_id = OBJECT_ID(N'dbo.campaigns') AND c.name = N'status';
                IF @campaignStatusDefault IS NOT NULL
                BEGIN
                    DECLARE @dropCampaignStatusDefault nvarchar(1000);
                    SET @dropCampaignStatusDefault = N'ALTER TABLE dbo.campaigns DROP CONSTRAINT [' + @campaignStatusDefault + N']';
                    EXEC sp_executesql @dropCampaignStatusDefault;
                END;
                UPDATE dbo.campaigns SET status = N'DRAFT' WHERE status IS NULL OR LTRIM(RTRIM(status)) = N'';
                ALTER TABLE dbo.campaigns ALTER COLUMN status nvarchar(50) NOT NULL;
                ALTER TABLE dbo.campaigns ADD CONSTRAINT DF_campaigns_status DEFAULT N'DRAFT' FOR status;
            END;
            IF NOT EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE name = N'customer_complaints_branch_idx'
                  AND object_id = OBJECT_ID(N'dbo.customer_complaints')
            )
                CREATE INDEX customer_complaints_branch_idx ON dbo.customer_complaints(branch_id);
            IF NOT EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE name = N'coupons_branch_idx'
                  AND object_id = OBJECT_ID(N'dbo.coupons')
            )
                CREATE INDEX coupons_branch_idx ON dbo.coupons(branch_id);
            IF NOT EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE name = N'campaigns_branch_status_idx'
                  AND object_id = OBJECT_ID(N'dbo.campaigns')
            )
                CREATE INDEX campaigns_branch_status_idx ON dbo.campaigns(branch_id, status, scheduled_at);
        `).then(() => undefined).catch((error) => {
            schemaReady = null;
            throw error;
        });
    }
    return schemaReady;
};
