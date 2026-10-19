import type { Request, Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../db';
import { orders, webhookDeliveries } from '../../src/db/schema';
import { KNOWN_PROVIDERS } from '../modules/aggregators/aggregatorTypes';
import { getAggregatorsConfig, saveProviderConfig } from '../modules/aggregators/aggregatorConfig';
import { ingestAggregatorOrder } from '../modules/aggregators/aggregatorIngestService';
import { normalizeAggregatorPayload } from '../modules/aggregators/aggregatorTypes';
import logger from '../utils/logger';

const log = logger.child({ controller: 'aggregator-admin' });

export const listProviders = async (_req: Request, res: Response) => {
    const config = await getAggregatorsConfig();
    res.json(KNOWN_PROVIDERS.map((p) => ({ ...p, config: config[p.id] })));
};

export const updateProvider = async (req: Request, res: Response) => {
    try {
        await saveProviderConfig(String(req.params.providerId || ''), req.body || {}, (req as any).user?.id || 'system');
        const config = await getAggregatorsConfig();
        res.json(config[String(req.params.providerId || '').toLowerCase()]);
    } catch (err: any) {
        res.status(Number((err as any)?.status) || 500).json({ error: String(err?.message || 'AGGREGATOR_SAVE_FAILED') });
    }
};

/** Provider order history (local) + inbound log. */
export const providerHistory = async (req: Request, res: Response) => {
    try {
        const providerId = String(req.params.providerId || '').toLowerCase();
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const rows = await db.select({
            id: orders.id, platformOrderId: orders.platformOrderId, status: orders.status,
            total: orders.total, branchId: orders.branchId, createdAt: orders.createdAt, notes: orders.notes,
        }).from(orders)
            .where(eq(orders.deliverySource, providerId))
            .orderBy(desc(orders.createdAt)).limit(limit);
        const inbound = await db.select().from(webhookDeliveries)
            .where(and(eq(webhookDeliveries.endpointId, 'aggregator-inbound'), eq(webhookDeliveries.event, 'aggregator.inbound')))
            .orderBy(desc(webhookDeliveries.createdAt)).limit(limit);
        res.json({ orders: rows, inbound: inbound.filter((d: any) => String((d as any)?.payload?.provider || '') === providerId) });
    } catch {
        res.status(500).json({ error: 'AGGREGATOR_HISTORY_FAILED' });
    }
};

/** Local E2E without the provider: inject a synthetic payload through the real ingest path. */
export const injectTestOrder = async (req: Request, res: Response) => {
    try {
        const providerId = String(req.params.providerId || '').toLowerCase();
        const payload = {
            order_id: `TEST-${randomUUID()}`,
            store_id: String(req.body?.store_id || ''),
            status: String(req.body?.status || 'NEW'),
            order_type: 'DELIVERY',
            items: Array.isArray(req.body?.items) && req.body.items.length > 0 ? req.body.items : [
                { sku: String(req.body?.sku || 'TEST-SKU'), quantity: 1, unit_price: Number(req.body?.price || 50) },
            ],
            total: Number(req.body?.total || 50),
        };
        const normalized = normalizeAggregatorPayload(providerId, payload);
        if (!normalized.ok) return res.status(400).json({ ok: false, error: (normalized as any).code });
        const result = await ingestAggregatorOrder(providerId, (normalized as any).order, payload);
        res.status(201).json({ ok: true, ...result, payload });
    } catch (err: any) {
        const status = Number(err?.status) || 400;
        res.status(status).json({ ok: false, error: String(err?.code || err?.message || 'TEST_ORDER_FAILED') });
    }
};
