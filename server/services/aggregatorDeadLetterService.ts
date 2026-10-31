import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { webhookDeliveries } from '../../src/db/schema';
import { ingestAggregatorOrder } from '../modules/aggregators/aggregatorIngestService';
import { normalizeAggregatorPayload } from '../modules/aggregators/aggregatorTypes';
import { canReplayAggregatorDeadLetter, sanitizeAggregatorDeadLetter } from '../../src/services/aggregatorDeadLetterPolicy';

const INBOUND_ENDPOINT = 'aggregator-inbound';
const INBOUND_EVENT = 'aggregator.inbound';

const payloadEnvelope = (value: unknown): Record<string, any> => (
    value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
);

export const listAggregatorDeadLetters = async (providerId?: string, branchId?: string, limit = 50) => {
    const rows = await db.select().from(webhookDeliveries)
        .where(and(
            eq(webhookDeliveries.endpointId, INBOUND_ENDPOINT),
            eq(webhookDeliveries.event, INBOUND_EVENT),
            eq(webhookDeliveries.status, 'FAILED'),
        ))
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(Math.min(100, Math.max(1, Math.floor(Number(limit) || 50))));
    return rows
        .map(sanitizeAggregatorDeadLetter)
        .filter(row => (!providerId || row.providerId === providerId) && (!branchId || row.branchId === branchId));
};

export const replayAggregatorDeadLetter = async (id: number, branchId?: string) => {
    const [claimed] = await db.update(webhookDeliveries)
        .set({ status: 'PENDING', attempt: 1, lastError: null, nextRetryAt: null })
        .where(and(
            eq(webhookDeliveries.id, id),
            eq(webhookDeliveries.endpointId, INBOUND_ENDPOINT),
            eq(webhookDeliveries.event, INBOUND_EVENT),
            eq(webhookDeliveries.status, 'FAILED'),
        ))
        .returning();
    if (!claimed) return { ok: false as const, code: 'AGGREGATOR_DEAD_LETTER_NOT_FOUND' };

    const envelope = payloadEnvelope(claimed.payload);
    const providerId = String(envelope.provider || '').trim().toLowerCase();
    const rawPayload = payloadEnvelope(envelope.payload);
    if (!canReplayAggregatorDeadLetter({ branchId: envelope.branchId ? String(envelope.branchId) : null }, branchId)) {
        await db.update(webhookDeliveries).set({ status: 'FAILED', lastError: 'BRANCH_SCOPE_FORBIDDEN' }).where(eq(webhookDeliveries.id, id));
        return { ok: false as const, code: 'BRANCH_SCOPE_FORBIDDEN' };
    }
    const normalized = normalizeAggregatorPayload(providerId, rawPayload);
    if (!normalized.ok) {
        const code = 'code' in normalized ? normalized.code : 'INVALID_PAYLOAD';
        await db.update(webhookDeliveries).set({ status: 'FAILED', lastError: code }).where(eq(webhookDeliveries.id, id));
        return { ok: false as const, code };
    }

    try {
        const result = await ingestAggregatorOrder(providerId, normalized.order, rawPayload);
        await db.update(webhookDeliveries).set({ status: 'SUCCESS', httpStatus: 200, deliveredAt: new Date(), lastError: null }).where(eq(webhookDeliveries.id, id));
        return { ok: true as const, result };
    } catch (error: any) {
        const code = String(error?.code || error?.message || 'AGGREGATOR_REPLAY_FAILED');
        await db.update(webhookDeliveries).set({ status: 'FAILED', httpStatus: Number(error?.status) || 400, lastError: code.slice(0, 2000), deliveredAt: new Date() }).where(eq(webhookDeliveries.id, id));
        return { ok: false as const, code };
    }
};

export const safeAggregatorDeadLetter = sanitizeAggregatorDeadLetter;
