/**
 * Fiscal Retry Service
 * Implements: P0 Item 6 — No silent failures on fiscal submission.
 *
 * Scans for FAILED fiscal logs and retries ETA submission with exponential backoff.
 * Called by the cleanup scheduler or manually via ops routes.
 */

import { db } from '../db';
import { fiscalLogs } from '../../src/db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { etaService } from './etaService';
import logger from '../utils/logger';

const log = logger.child({ service: 'fiscalRetry' });

const MAX_RETRY_ATTEMPTS = 5;
const BACKOFF_MINUTES = [2, 10, 30, 120, 480]; // Backoff: 2m, 10m, 30m, 2h, 8h

export const fiscalRetryService = {

    /**
     * Retry all failed fiscal submissions that are eligible.
     */
    async retryFailedSubmissions(): Promise<{
        processed: number;
        succeeded: number;
        failed: number;
        skipped: number;
        deadLettered: number;
        errors: Array<{ logId: string; reason: string }>;
    }> {
        const result = { processed: 0, succeeded: 0, failed: 0, skipped: 0, deadLettered: 0, errors: [] as Array<{ logId: string; reason: string }> };

        // Fetch failed fiscal logs that haven't exceeded max retries
        const failedLogs = await db.select()
            .from(fiscalLogs)
            .where(
                and(
                    eq(fiscalLogs.status, 'FAILED'),
                    sql`${fiscalLogs.attempt} < ${MAX_RETRY_ATTEMPTS}`
                )
            )
            .orderBy(desc(fiscalLogs.createdAt))
            .limit(30);

        for (const fiscalLog of failedLogs) {
            result.processed++;

            const attempt = Number(fiscalLog.attempt || 0);

            // Backoff check
            const backoffMinutes = BACKOFF_MINUTES[Math.min(attempt, BACKOFF_MINUTES.length - 1)];
            const lastUpdate = fiscalLog.updatedAt ? new Date(fiscalLog.updatedAt).getTime() : 0;
            const nextEligible = lastUpdate + (backoffMinutes * 60 * 1000);

            if (Date.now() < nextEligible) {
                result.skipped++;
                continue;
            }

            try {
                // Use existing payload if available, otherwise skip
                const payload = fiscalLog.payload;
                if (!payload) {
                    result.skipped++;
                    continue;
                }

                // Retry the ETA submission
                const response = await etaService.submitWithRetry(payload, fiscalLog.orderId, fiscalLog.branchId);

                // Success — mark as submitted
                await db.update(fiscalLogs)
                    .set({
                        status: 'SUBMITTED',
                        response,
                        attempt: attempt + 1,
                        lastError: null,
                        updatedAt: new Date(),
                    })
                    .where(eq(fiscalLogs.id, fiscalLog.id));

                result.succeeded++;
                log.info({ logId: String(fiscalLog.id), orderId: fiscalLog.orderId }, 'Fiscal submission succeeded on retry');
            } catch (err: any) {
                const nextAttempt = attempt + 1;
                const isExhausted = nextAttempt >= MAX_RETRY_ATTEMPTS;

                await db.update(fiscalLogs)
                    .set({
                        status: isExhausted ? 'DEAD_LETTER' : 'FAILED',
                        attempt: nextAttempt,
                        lastError: err.message,
                        updatedAt: new Date(),
                    })
                    .where(eq(fiscalLogs.id, fiscalLog.id));

                if (isExhausted) {
                    result.deadLettered++;
                    log.error({ logId: String(fiscalLog.id), orderId: fiscalLog.orderId }, 'Fiscal submission moved to dead letter after max retries');
                } else {
                    result.failed++;
                }
                result.errors.push({ logId: String(fiscalLog.id), reason: err.message });
                log.warn({ logId: String(fiscalLog.id), attempt: nextAttempt, err: err.message }, 'Fiscal retry failed');
            }
        }

        log.info(result, 'Fiscal retry cycle complete');
        return result;
    },

    /**
     * Get summary of fiscal submission queue status.
     */
    async getRetryQueueStatus() {
        const pending = await db.select({ count: sql<number>`count(*)` })
            .from(fiscalLogs)
            .where(eq(fiscalLogs.status, 'PENDING'));

        const failed = await db.select({ count: sql<number>`count(*)` })
            .from(fiscalLogs)
            .where(eq(fiscalLogs.status, 'FAILED'));

        const deadLetter = await db.select({ count: sql<number>`count(*)` })
            .from(fiscalLogs)
            .where(eq(fiscalLogs.status, 'DEAD_LETTER'));

        const submitted = await db.select({ count: sql<number>`count(*)` })
            .from(fiscalLogs)
            .where(eq(fiscalLogs.status, 'SUBMITTED'));

        return {
            pending: Number(pending[0]?.count || 0),
            pendingCount: Number(pending[0]?.count || 0),
            failed: Number(failed[0]?.count || 0),
            failedCount: Number(failed[0]?.count || 0),
            deadLetter: Number(deadLetter[0]?.count || 0),
            submitted: Number(submitted[0]?.count || 0),
        };
    }
};
