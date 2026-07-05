/**
 * Data Cleanup Service (Sprint 4 - Item 52)
 * 
 * Automated retention policies for transient data:
 * - Idempotency keys: delete after expiresAt
 * - Webhook deliveries (completed): delete after 30 days
 * - Domain events (processed): delete after 14 days
 * - Session records (expired): delete after 30 days
 * - Audit logs: NEVER delete (regulatory) — archive only
 * 
 * Run manually via API or schedule with setInterval / cron.
 */

import { db } from '../db';
import { idempotencyKeys, webhookDeliveries, domainEvents, userSessions } from '../../src/db/schema';
import { lt, eq, and, sql } from 'drizzle-orm';
import logger from '../utils/logger';

const log = logger.child({ service: 'data-cleanup' });

interface CleanupResult {
    table: string;
    deletedCount: number;
    error?: string;
}

export const dataCleanupService = {
    /**
     * Run all cleanup tasks and return a summary.
     */
    async runAll(): Promise<CleanupResult[]> {
        const results: CleanupResult[] = [];

        results.push(await this.cleanIdempotencyKeys());
        results.push(await this.cleanWebhookDeliveries());
        results.push(await this.cleanDomainEvents());
        results.push(await this.cleanExpiredSessions());

        // Item 27: Mark expired inventory batches
        try {
            const { inventoryService } = await import('./inventoryService');
            await inventoryService.markExpiredBatches();
        } catch (err: any) {
            log.warn({ err: err.message }, 'Failed to mark expired batches');
        }

        const totalDeleted = results.reduce((sum, r) => sum + r.deletedCount, 0);
        log.info({ results, totalDeleted }, 'Data cleanup completed');

        return results;
    },

    /**
     * Delete idempotency keys past their expiresAt timestamp.
     */
    async cleanIdempotencyKeys(): Promise<CleanupResult> {
        try {
            const deleted = await db.delete(idempotencyKeys)
                .where(lt(idempotencyKeys.expiresAt, new Date()))
                .returning({ id: idempotencyKeys.id });

            return { table: 'idempotency_keys', deletedCount: deleted.length };
        } catch (err: any) {
            log.error({ err: err.message }, 'Failed to clean idempotency_keys');
            return { table: 'idempotency_keys', deletedCount: 0, error: err.message };
        }
    },

    /**
     * Delete webhook deliveries older than 30 days that are not PENDING.
     */
    async cleanWebhookDeliveries(retentionDays = 30): Promise<CleanupResult> {
        try {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - retentionDays);

            const deleted = await db.delete(webhookDeliveries)
                .where(and(
                    lt(webhookDeliveries.createdAt, cutoff),
                    sql`${webhookDeliveries.status} != 'PENDING'`,
                ))
                .returning({ id: webhookDeliveries.id });

            return { table: 'webhook_deliveries', deletedCount: deleted.length };
        } catch (err: any) {
            log.error({ err: err.message }, 'Failed to clean webhook_deliveries');
            return { table: 'webhook_deliveries', deletedCount: 0, error: err.message };
        }
    },

    /**
     * Delete processed domain events older than 14 days.
     */
    async cleanDomainEvents(retentionDays = 14): Promise<CleanupResult> {
        try {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - retentionDays);

            const deleted = await db.delete(domainEvents)
                .where(and(
                    lt(domainEvents.createdAt, cutoff),
                    eq(domainEvents.status, 'PROCESSED'),
                ))
                .returning({ id: domainEvents.id });

            return { table: 'domain_events', deletedCount: deleted.length };
        } catch (err: any) {
            log.error({ err: err.message }, 'Failed to clean domain_events');
            return { table: 'domain_events', deletedCount: 0, error: err.message };
        }
    },

    /**
     * Delete expired and inactive sessions older than 30 days.
     */
    async cleanExpiredSessions(retentionDays = 30): Promise<CleanupResult> {
        try {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - retentionDays);

            const deleted = await db.delete(userSessions)
                .where(and(
                    lt(userSessions.expiresAt, cutoff),
                    eq(userSessions.isActive, false),
                ))
                .returning({ id: userSessions.id });

            return { table: 'user_sessions', deletedCount: deleted.length };
        } catch (err: any) {
            log.error({ err: err.message }, 'Failed to clean user_sessions');
            return { table: 'user_sessions', deletedCount: 0, error: err.message };
        }
    },
};

// ============================================================================
// Scheduler — can be started from server bootstrap
// ============================================================================

let cleanupInterval: ReturnType<typeof setInterval> | null = null;
let retryInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the cleanup scheduler. Runs daily at the specified hour (default: 3 AM).
 */
export const startCleanupScheduler = (intervalHours = 24) => {
    if (cleanupInterval) return; // Already running

    const intervalMs = intervalHours * 60 * 60 * 1000;
    log.info(`Data cleanup scheduler started (every ${intervalHours}h)`);

    cleanupInterval = setInterval(async () => {
        try {
            await dataCleanupService.runAll();
        } catch (err: any) {
            log.error({ err: err.message }, 'Scheduled cleanup failed');
        }
    }, intervalMs);

    // Run once immediately on startup (after a short delay to let DB connect)
    setTimeout(() => {
        dataCleanupService.runAll().catch((err) => {
            log.error({ err: err.message }, 'Initial cleanup failed');
        });
    }, 30_000); // 30 seconds after startup

    // Finance & Fiscal retry — runs every 15 minutes
    retryInterval = setInterval(async () => {
        try {
            const { financeRetryService } = await import('./financeRetryService');
            await financeRetryService.retryPendingExceptions();
        } catch (err: any) {
            log.error({ err: err.message }, 'Scheduled finance retry failed');
        }
        try {
            const { fiscalRetryService } = await import('./fiscalRetryService');
            await fiscalRetryService.retryFailedSubmissions();
        } catch (err: any) {
            log.error({ err: err.message }, 'Scheduled fiscal retry failed');
        }
    }, 15 * 60 * 1000); // Every 15 minutes
};

export const stopCleanupScheduler = () => {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
        log.info('Data cleanup scheduler stopped');
    }
    if (retryInterval) {
        clearInterval(retryInterval);
        retryInterval = null;
        log.info('Retry scheduler stopped');
    }
};

export default dataCleanupService;

