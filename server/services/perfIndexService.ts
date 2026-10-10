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
