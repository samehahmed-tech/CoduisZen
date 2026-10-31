import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { db } from '../db';
import { domainEvents } from '../../src/db/schema';
import { eventBusService } from './eventBusService';
import { getRetryPolicy, PAYMENT_WEBHOOK_LEASE_MS, PAYMENT_WEBHOOK_MAX_ATTEMPTS } from '../utils/retryPolicy';
import logger from '../utils/logger';
import { summarizePaymentWebhookDeadLetter } from '../utils/paymentWebhookDeadLetter';

const log = logger.child({ service: 'paymentWebhookRetry' });
const EVENT_TYPE = 'payment.webhook.failed';

export const paymentWebhookRetryService = {
    async recordFailure(input: {
        provider: string;
        payload: Record<string, any>;
        reason: string;
        entityId?: string;
        branchId?: string;
    }) {
        return eventBusService.emitEvent({
            type: EVENT_TYPE,
            entityType: 'payment_webhook',
            entityId: input.entityId,
            branchId: input.branchId,
            payload: {
                provider: input.provider,
                callback: input.payload,
                retryCount: 0,
                lastError: input.reason,
                lastAttemptAt: new Date().toISOString(),
            },
        });
    },

    async getQueueStatus() {
        const [pending] = await db.select({ count: sql<number>`count(*)` }).from(domainEvents).where(and(
            eq(domainEvents.type, EVENT_TYPE),
            eq(domainEvents.status, 'PENDING'),
        ));
        const [deadLetter] = await db.select({ count: sql<number>`count(*)` }).from(domainEvents).where(and(
            eq(domainEvents.type, EVENT_TYPE),
            eq(domainEvents.status, 'DEAD_LETTER'),
        ));
        const [processed] = await db.select({ count: sql<number>`count(*)` }).from(domainEvents).where(and(
            eq(domainEvents.type, EVENT_TYPE),
            eq(domainEvents.status, 'PROCESSED'),
        ));
        return {
            pending: Number(pending?.count || 0),
            deadLetter: Number(deadLetter?.count || 0),
            processed: Number(processed?.count || 0),
        };
    },

    async listDeadLetters(branchId?: string, limit = 50) {
        const rows = await db.select().from(domainEvents).where(and(
            eq(domainEvents.type, EVENT_TYPE),
            eq(domainEvents.status, 'DEAD_LETTER'),
            branchId ? eq(domainEvents.branchId, branchId) : undefined,
        )).orderBy(desc(domainEvents.createdAt)).top(Math.min(Math.max(Number(limit) || 50, 1), 100));
        return rows.map(summarizePaymentWebhookDeadLetter);
    },

    /** Requeue only a dead-letter record; the normal signed processor remains authoritative. */
    async replayDeadLetter(id: string, branchId?: string) {
        const [event] = await db.select().from(domainEvents).where(and(
            eq(domainEvents.id, String(id || '')),
            eq(domainEvents.type, EVENT_TYPE),
            eq(domainEvents.status, 'DEAD_LETTER'),
            branchId ? eq(domainEvents.branchId, branchId) : undefined,
        )).top(1);
        if (!event) throw Object.assign(new Error('PAYMENT_WEBHOOK_DEAD_LETTER_NOT_FOUND'), { status: 404 });

        const payload = (event.payload || {}) as Record<string, any>;
        const [claimed] = await db.update(domainEvents).set({
            status: 'PENDING',
            processedAt: null,
            payload: {
                ...payload,
                retryCount: 0,
                lastError: 'MANUAL_REPLAY_REQUESTED',
                lastAttemptAt: null,
                replayRequestedAt: new Date().toISOString(),
            },
        }).output().where(and(
            eq(domainEvents.id, event.id),
            eq(domainEvents.status, 'DEAD_LETTER'),
        ));
        if (!claimed) throw Object.assign(new Error('PAYMENT_WEBHOOK_DEAD_LETTER_ALREADY_REPLAYED'), { status: 409 });
        return { id: event.id, status: 'PENDING' as const };
    },

    /**
     * Retry queue records with a caller-provided provider processor. The
     * processor must re-verify the provider signature before applying state.
     */
    async retryPending(processor: (provider: string, payload: Record<string, any>) => Promise<void>) {
        const result = { processed: 0, succeeded: 0, failed: 0, skipped: 0, deadLettered: 0 };
        const staleLeaseCutoff = new Date(Date.now() - PAYMENT_WEBHOOK_LEASE_MS);
        // Recover events left in PROCESSING by a crashed worker. processedAt is
        // the lease timestamp while PROCESSING and the completion timestamp
        // after a successful attempt.
        await db.update(domainEvents).set({ status: 'PENDING', processedAt: null }).where(and(
            eq(domainEvents.type, EVENT_TYPE),
            eq(domainEvents.status, 'PROCESSING'),
            lt(domainEvents.processedAt, staleLeaseCutoff),
        ));
        const pending = await db.select().from(domainEvents).where(and(
            eq(domainEvents.type, EVENT_TYPE),
            eq(domainEvents.status, 'PENDING'),
        )).orderBy(desc(domainEvents.createdAt)).top(50);

        for (const event of pending) {
            const payload = (event.payload || {}) as Record<string, any>;
            const policy = getRetryPolicy(payload.retryCount, payload.lastAttemptAt);
            if (!policy.eligible) {
                result.skipped++;
                continue;
            }

            // Claim atomically so two schedulers cannot process the same event.
            const claimed = await db.transaction(async (tx) => {
                await tx.execute(sql`
                    SELECT ${domainEvents.id}
                    FROM ${domainEvents} WITH (UPDLOCK, ROWLOCK)
                    WHERE ${domainEvents.id} = ${event.id}
                      AND ${domainEvents.status} = 'PENDING'
                `);
                const [stillPending] = await tx.select({ id: domainEvents.id }).from(domainEvents).where(and(
                    eq(domainEvents.id, event.id),
                    eq(domainEvents.status, 'PENDING'),
                )).top(1);
                if (!stillPending) return false;
                await tx.update(domainEvents).set({
                    status: 'PROCESSING',
                    processedAt: new Date(),
                }).where(eq(domainEvents.id, event.id));
                return true;
            });
            if (!claimed) {
                result.skipped++;
                continue;
            }

            result.processed++;
            try {
                await processor(String(payload.provider || ''), (payload.callback || {}) as Record<string, any>);
                await db.update(domainEvents).set({ status: 'PROCESSED', processedAt: new Date() }).where(eq(domainEvents.id, event.id));
                result.succeeded++;
            } catch (error: any) {
                const nextCount = policy.nextAttempt;
                const exhausted = nextCount >= PAYMENT_WEBHOOK_MAX_ATTEMPTS;
                await db.update(domainEvents).set({
                    status: exhausted ? 'DEAD_LETTER' : 'PENDING',
                    processedAt: exhausted ? new Date() : null,
                    payload: {
                        ...payload,
                        retryCount: nextCount,
                        lastError: String(error?.message || error),
                        lastAttemptAt: new Date().toISOString(),
                    },
                }).where(eq(domainEvents.id, event.id));
                result.failed++;
                if (exhausted) result.deadLettered++;
                log.warn({ eventId: event.id, attempt: nextCount, error: error?.message }, 'Payment webhook retry failed');
            }
        }
        return result;
    },

    async retryAllPending() {
        const { settlePaymobCallback } = await import('./paymobSettlementService');
        const processors: Record<string, (payload: Record<string, any>) => Promise<void>> = {
            paymob: async (payload) => { await settlePaymobCallback(payload); },
        };
        return this.retryPending(async (provider, payload) => {
            const processor = processors[String(provider || '').trim().toLowerCase()];
            if (!processor) throw new Error(`UNSUPPORTED_PAYMENT_WEBHOOK_PROVIDER:${provider}`);
            await processor(payload);
        });
    },

    /** Backward-compatible alias for older scheduler/manual callers. */
    async retryPaymobPending() {
        return this.retryAllPending();
    },
};
