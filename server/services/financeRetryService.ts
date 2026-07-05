/**
 * Finance Retry Service
 * Implements: P0 Item 6 — No silent failures on finance posting.
 * 
 * Scans for PENDING finance exceptions and retries them with exponential backoff.
 * Called by the cleanup scheduler or manually via ops routes.
 */

import { db } from '../db';
import { financeExceptions, orders } from '../../src/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { GLService } from './glService';
import logger from '../utils/logger';

const log = logger.child({ service: 'financeRetry' });

const MAX_RETRY_ATTEMPTS = 5;
const BACKOFF_MINUTES = [1, 5, 15, 60, 240]; // Exponential backoff schedule

export const financeRetryService = {

    /**
     * Retry all pending finance exceptions that are eligible.
     * Returns summary of retry results.
     */
    async retryPendingExceptions(): Promise<{
        processed: number;
        succeeded: number;
        failed: number;
        skipped: number;
        errors: Array<{ id: string; reason: string }>;
    }> {
        const result = { processed: 0, succeeded: 0, failed: 0, skipped: 0, errors: [] as Array<{ id: string; reason: string }> };

        // Fetch pending exceptions that haven't exceeded max retries
        const pendingExceptions = await db.select()
            .from(financeExceptions)
            .where(
                and(
                    eq(financeExceptions.status, 'PENDING'),
                    sql`coalesce((${financeExceptions.payload}->>'retryCount')::int, 0) < ${MAX_RETRY_ATTEMPTS}`
                )
            )
            .limit(50);

        for (const exception of pendingExceptions) {
            result.processed++;

            const retryCount = Number((exception.payload as any)?.retryCount || 0);

            // Check backoff: skip if not enough time has passed
            const backoffMinutes = BACKOFF_MINUTES[Math.min(retryCount, BACKOFF_MINUTES.length - 1)];
            const lastAttempt = exception.updatedAt ? new Date(exception.updatedAt).getTime() : 0;
            const nextEligible = lastAttempt + (backoffMinutes * 60 * 1000);

            if (Date.now() < nextEligible) {
                result.skipped++;
                continue;
            }

            try {
                const payload = exception.payload as any;
                const orderId = exception.reference;

                if (!orderId) {
                    result.skipped++;
                    continue;
                }

                // Fetch the order
                const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
                if (!order) {
                    // Order no longer exists — mark as resolved
                    await db.update(financeExceptions)
                        .set({ status: 'RESOLVED', updatedAt: new Date() })
                        .where(eq(financeExceptions.id, exception.id));
                    result.skipped++;
                    continue;
                }

                // Retry the GL posting
                const glResult = await GLService.postSalesOrder(
                    order.id,
                    order.subtotal || 0,
                    order.tax || 0,
                    order.paymentMethod || 'CASH',
                    order.total || 0,
                    order.branchId || '',
                    order.type || 'DINE_IN'
                );

                if (glResult && typeof glResult !== 'string' && glResult.entryId) {
                    // Success — mark resolved
                    await db.update(financeExceptions)
                        .set({
                            status: 'RESOLVED',
                            updatedAt: new Date(),
                            payload: { ...payload, retryCount: retryCount + 1, resolvedAt: new Date().toISOString(), resolvedBy: 'financeRetryService' },
                        })
                        .where(eq(financeExceptions.id, exception.id));
                    result.succeeded++;
                    log.info({ exceptionId: exception.id, orderId }, 'Finance exception resolved on retry');
                } else {
                    // GL returned exception string — update retry count
                    await db.update(financeExceptions)
                        .set({
                            updatedAt: new Date(),
                            payload: { ...payload, retryCount: retryCount + 1, lastRetryError: 'GL returned exception' },
                        })
                        .where(eq(financeExceptions.id, exception.id));
                    result.failed++;
                    result.errors.push({ id: exception.id, reason: 'GL returned exception' });
                }
            } catch (err: any) {
                const payload = exception.payload as any;
                const retryCount = Number(payload?.retryCount || 0);

                // Update retry count and record error
                await db.update(financeExceptions)
                    .set({
                        updatedAt: new Date(),
                        payload: { ...payload, retryCount: retryCount + 1, lastRetryError: err.message },
                        status: retryCount + 1 >= MAX_RETRY_ATTEMPTS ? 'DEAD_LETTER' : 'PENDING',
                    })
                    .where(eq(financeExceptions.id, exception.id));

                result.failed++;
                result.errors.push({ id: exception.id, reason: err.message });
                log.warn({ exceptionId: exception.id, attempt: retryCount + 1, err: err.message }, 'Finance retry failed');
            }
        }

        log.info(result, 'Finance retry cycle complete');
        return result;
    },

    /**
     * Get summary of pending finance exceptions.
     */
    async getRetryQueueStatus() {
        const pending = await db.select({ count: sql<number>`count(*)` })
            .from(financeExceptions)
            .where(eq(financeExceptions.status, 'PENDING'));

        const deadLetter = await db.select({ count: sql<number>`count(*)` })
            .from(financeExceptions)
            .where(eq(financeExceptions.status, 'DEAD_LETTER'));

        const resolved = await db.select({ count: sql<number>`count(*)` })
            .from(financeExceptions)
            .where(eq(financeExceptions.status, 'RESOLVED'));

        return {
            pending: Number(pending[0]?.count || 0),
            pendingCount: Number(pending[0]?.count || 0),
            deadLetter: Number(deadLetter[0]?.count || 0),
            deadLetterCount: Number(deadLetter[0]?.count || 0),
            resolved: Number(resolved[0]?.count || 0),
        };
    }
};
