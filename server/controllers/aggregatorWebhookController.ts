import type { Request, Response } from 'express';
import { isKnownProvider, normalizeAggregatorPayload } from '../modules/aggregators/aggregatorTypes';
import { ingestAggregatorOrder } from '../modules/aggregators/aggregatorIngestService';
import logger from '../utils/logger';

const log = logger.child({ controller: 'aggregator-webhook' });

/**
 * POST /api/integrations/:providerId/webhook (public, shared-secret auth).
 * Same ack contract as Talabat: 2xx fast, duplicates collapse idempotently.
 */
export const receiveAggregatorWebhook = async (req: Request, res: Response) => {
    const providerId = String((req as any).aggregatorProviderId || req.params.providerId || '').trim().toLowerCase();
    if (!isKnownProvider(providerId)) return res.status(404).json({ ok: false, error: 'UNKNOWN_PROVIDER' });
    try {
        const normalized = normalizeAggregatorPayload(providerId, req.body);
        if (!normalized.ok) return res.status(400).json({ ok: false, error: (normalized as any).code });
        const result = await ingestAggregatorOrder(providerId, (normalized as any).order, req.body);
        return res.status(200).json({ ok: true, orderId: result.orderId, created: result.created, status: result.internalStatus });
    } catch (err: any) {
        const status = Number(err?.status) || 400;
        const code = String(err?.code || err?.message || 'AGGREGATOR_INGEST_FAILED');
        if (code.endsWith('_DISABLED')) return res.status(200).json({ ok: true, ignored: true, code });
        log.warn({ providerId, code, status }, 'Aggregator webhook ingest failed');
        return res.status(status).json({ ok: false, error: code });
    }
};
