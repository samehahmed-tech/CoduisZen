import { pool } from '../db';
import logger from '../utils/logger';

/**
 * Performance indexes (Phase-8). Idempotent IF NOT EXISTS batches run once
 * per process at startup — they heal fresh installs, dev DBs and customer
 * systems that never ran a migration for these. Additive only, fully
 * reversible via DROP INDEX, zero impact on writes that matter
 * (two narrow indexes on read-hot paths).
 *
 * - IX_orders_branch_status_created: pager + dashboard legs always scope
 *   branch, often status, and sort by created_at. (business_date itself is
 *   nvarchar(max) and cannot be a key column — the range stays a residual
 *   filter over index-narrowed rows.)
 * - IX_audit_logs_createdAt: audit trail orders/filters by created_at DESC
 *   with only a PK present.
 */

let ensured = false;
let inflight: Promise<void> | null = null;

export const ensurePerfIndexes = async () => {
    if (ensured) return;
    if (!inflight) {
        inflight = (async () => {
            await pool.query(`
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_orders_branch_status_created' AND object_id = OBJECT_ID('dbo.orders'))
                    CREATE INDEX IX_orders_branch_status_created ON dbo.orders(branch_id, status, created_at) INCLUDE (total);
            `);
            // Covering index for dashboard/report range scans: branch + created
            // range with all aggregated money columns included, so the 15-leg
            // fan-out never does key lookups. Supersedes idx_orders_branch_date
            // (same key prefix without INCLUDEs) which is dropped to avoid a
            // redundant twin.
            await pool.query(`
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_orders_branch_created_cover' AND object_id = OBJECT_ID('dbo.orders'))
                    CREATE INDEX IX_orders_branch_created_cover ON dbo.orders(branch_id, created_at) INCLUDE (status, total, subtotal, discount, tax, business_date);
            `);
            await pool.query(`
                IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_orders_branch_date' AND object_id = OBJECT_ID('dbo.orders'))
                AND EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_orders_branch_created_cover' AND object_id = OBJECT_ID('dbo.orders'))
                    DROP INDEX idx_orders_branch_date ON dbo.orders;
            `);
            await pool.query(`
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_audit_logs_createdAt' AND object_id = OBJECT_ID('dbo.audit_logs'))
                    CREATE INDEX IX_audit_logs_createdAt ON dbo.audit_logs(created_at DESC);
            `);
            ensured = true;
        })().catch((err: any) => {
            inflight = null;
            logger.warn({ err: err?.message }, 'Perf index ensure failed — will retry on next call');
            throw err;
        });
    }
    await inflight;
};
