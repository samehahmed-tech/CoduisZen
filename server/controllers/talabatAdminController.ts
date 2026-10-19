import type { Request, Response } from 'express';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../db';
import { orders, webhookDeliveries } from '../../src/db/schema';
import { getTalabatConfig, getTalabatConfigRaw, saveTalabatConfig } from '../modules/talabat/talabatConfig';
import { ingestTalabatWebhook } from '../modules/talabat/talabatIngestService';
import { syncTalabatStatus } from '../modules/talabat/talabatSyncService';
import { talabatGetOrder, getTalabatToken } from '../modules/talabat/talabatClient';
import { getMenuCatalogSnapshot, getCatalogJob, getVendorCatalog, getVendorCategories, pushCatalogUpdates } from '../modules/talabat/talabatCatalogService';
import { busyMinutesToClosedUntil, getOutletStatus, setOutletStatus } from '../modules/talabat/talabatOutletService';
import { buildStrikethroughBody, getPromotionJob, pushPromotion } from '../modules/talabat/talabatPromotionService';
import logger from '../utils/logger';

const log = logger.child({ controller: 'talabat-admin' });

export const getConfig = async (_req: Request, res: Response) => {
    res.json(await getTalabatConfig());
};

export const updateConfig = async (req: Request, res: Response) => {
    try {
        await saveTalabatConfig(req.body || {}, (req as any).user?.id || 'system');
        res.json(await getTalabatConfig());
    } catch (err: any) {
        log.error({ err: err?.message }, 'Talabat config save failed');
        res.status(500).json({ error: 'TALABAT_CONFIG_SAVE_FAILED' });
    }
};

/** Manual back-sync: push current internal status to Talabat. */
export const syncOrder = async (req: Request, res: Response) => {
    const orderId = String(req.params.orderId || '').trim();
    if (!orderId) return res.status(400).json({ error: 'ORDER_ID_REQUIRED' });
    try {
        const [order] = await db.select({ status: orders.status, cancelReason: orders.cancelReason }).from(orders).where(eq(orders.id, orderId));
        if (!order) return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
        const result = await syncTalabatStatus(orderId, String(order.status), { cancellationReason: String((order as any).cancelReason || req.body?.cancellationReason || 'TOO_BUSY') });
        res.json({ ok: result.synced, ...result });
    } catch (err: any) {
        res.status(500).json({ error: 'TALABAT_SYNC_FAILED', details: String(err?.message || err) });
    }
};

/** Reconciliation: Talabat-sourced orders in range + inbound log. */
export const getHistory = async (req: Request, res: Response) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const start = req.query.start ? new Date(String(req.query.start)) : new Date(Date.now() - 7 * 86400000);
        const end = req.query.end ? new Date(String(req.query.end)) : new Date();
        const rows = await db.select({
            id: orders.id, platformOrderId: orders.platformOrderId, status: orders.status,
            total: orders.total, branchId: orders.branchId, createdAt: orders.createdAt, notes: orders.notes,
        }).from(orders)
            .where(and(eq(orders.deliverySource, 'talabat'), gte(orders.createdAt, start), lte(orders.createdAt, end)))
            .orderBy(desc(orders.createdAt)).limit(limit);
        const inbound = await db.select().from(webhookDeliveries)
            .where(eq(webhookDeliveries.endpointId, 'talabat-inbound'))
            .orderBy(desc(webhookDeliveries.createdAt)).limit(limit);
        res.json({ orders: rows, inbound });
    } catch (err: any) {
        res.status(500).json({ error: 'TALABAT_HISTORY_FAILED' });
    }
};

/** Fetch one order from Talabat (60-day window) for dispute checks. */
export const fetchRemoteOrder = async (req: Request, res: Response) => {
    const talabatOrderId = String(req.params.talabatOrderId || '').trim();
    if (!talabatOrderId) return res.status(400).json({ error: 'TALABAT_ORDER_ID_REQUIRED' });
    try {
        const config = await getTalabatConfigRaw();
        if (!config.chainId || !config.clientId || !config.clientSecret) return res.status(400).json({ error: 'TALABAT_NOT_CONFIGURED' });
        const token = await getTalabatToken({ clientId: config.clientId, clientSecret: String(config.clientSecret), tokenUrl: config.tokenUrl });
        const res2 = await talabatGetOrder({ baseUrl: config.baseUrl, chainId: config.chainId, orderId: talabatOrderId, token });
        res.status(res2.status).json(res2.data);
    } catch (err: any) {
        res.status(500).json({ error: 'TALABAT_FETCH_FAILED', details: String(err?.message || err) });
    }
};

/** Local E2E without Talabat: inject a synthetic RECEIVED payload through the real ingest path. */export const injectTestOrder = async (req: Request, res: Response) => {
    try {
        const config = await getTalabatConfigRaw();
        const storeId = String(req.body?.store_id || Object.keys(config.storeBranchMap || {})[0] || config.defaultBranchId || '').trim();
        if (!storeId) return res.status(400).json({ error: 'STORE_ID_REQUIRED', message: 'Map a store in Talabat config first.' });
        const payload = {
            order_id: `TEST-${randomUUID()}`,
            order_code: String(Math.floor(Math.random() * 9000) + 1000),
            external_order_id: `TEST-EXT-${Date.now()}`,
            store_id: storeId,
            order_type: 'DELIVERY',
            transport_type: config.transport || 'LOGISTICS_DELIVERY',
            status: 'RECEIVED',
            items: Array.isArray(req.body?.items) && req.body.items.length > 0 ? req.body.items : [
                { sku: String(req.body?.sku || 'TEST-SKU'), pricing: { pricing_type: 'UNIT', quantity: 1, unit_price: Number(req.body?.price || 50) }, status: 'IN_CART' },
            ],
            sub_total: Number(req.body?.sub_total || 50),
            order_total: Number(req.body?.order_total || 50),
        };
        const result = await ingestTalabatWebhook(payload);
        res.status(201).json({ ok: true, ...result, payload });
    } catch (err: any) {
        const status = Number(err?.status) || 400;
        res.status(status).json({ ok: false, error: String(err?.code || err?.message || 'TEST_ORDER_FAILED') });
    }
};

/** Preview what a full-menu push would send (DB read only, no Talabat call). */
export const catalogPreview = async (_req: Request, res: Response) => {
    try {
        const products = await getMenuCatalogSnapshot();
        res.json({ count: products.length, products: products.slice(0, 100), truncated: products.length > 100 });
    } catch (err: any) {
        res.status(500).json({ error: 'TALABAT_CATALOG_PREVIEW_FAILED' });
    }
};

/** Push price/active updates to one vendor → {job_id}. Body: {vendor_id, products?} (empty = full menu). */
export const catalogPush = async (req: Request, res: Response) => {
    const vendorId = String(req.body?.vendor_id || req.body?.vendorId || '').trim();
    if (!vendorId) return res.status(400).json({ error: 'VENDOR_ID_REQUIRED' });
    try {
        const products = Array.isArray(req.body?.products) && req.body.products.length > 0
            ? req.body.products
            : await getMenuCatalogSnapshot();
        const job = await pushCatalogUpdates(vendorId, products);
        res.status(202).json(job);
    } catch (err: any) {
        res.status(Number(err?.status) || 500).json({ error: String(err?.message || 'TALABAT_CATALOG_PUSH_FAILED'), details: (err as any)?.details });
    }
};

export const catalogJobStatus = async (req: Request, res: Response) => {
    try {
        res.json(await getCatalogJob(String(req.params.jobId || '')));
    } catch (err: any) {
        res.status(Number(err?.status) || 500).json({ error: String(err?.message || 'TALABAT_JOB_FAILED') });
    }
};

export const vendorCatalog = async (req: Request, res: Response) => {
    try {
        res.json(await getVendorCatalog(String(req.params.vendorId || ''), {
            query_term: req.query.query_term ? String(req.query.query_term) : undefined,
            page: req.query.page ? Number(req.query.page) : undefined,
            page_size: req.query.page_size ? Number(req.query.page_size) : undefined,
            is_active: req.query.is_active !== undefined ? String(req.query.is_active) === 'true' : undefined,
        }));
    } catch (err: any) {
        res.status(Number(err?.status) || 500).json({ error: String(err?.message || 'TALABAT_CATALOG_FAILED') });
    }
};

export const vendorCategories = async (req: Request, res: Response) => {
    try {
        res.json(await getVendorCategories(String(req.params.vendorId || '')));
    } catch (err: any) {
        res.status(Number(err?.status) || 500).json({ error: String(err?.message || 'TALABAT_CATEGORIES_FAILED') });
    }
};

export const outletStatus = async (req: Request, res: Response) => {
    try {
        res.json(await getOutletStatus(String(req.params.vendorId || '')));
    } catch (err: any) {
        res.status(Number(err?.status) || 500).json({ error: String(err?.message || 'TALABAT_OUTLET_FAILED') });
    }
};

/** Body: {status, closed_reason?, closed_until?} or {busyMinutes} shortcut for TOO_BUSY_KITCHEN. */
export const outletUpdate = async (req: Request, res: Response) => {
    try {
        const body = req.body || {};
        const input: any = { status: body.status };
        if (body.closed_reason) input.closed_reason = body.closed_reason;
        if (body.closed_until) input.closed_until = body.closed_until;
        if (body.busyMinutes && !input.closed_until) {
            input.status = 'CLOSED_UNTIL';
            input.closed_reason = input.closed_reason || 'TOO_BUSY_KITCHEN';
            input.closed_until = busyMinutesToClosedUntil(Number(body.busyMinutes));
        }
        res.json(await setOutletStatus(String(req.params.vendorId || ''), input));
    } catch (err: any) {
        res.status(Number(err?.status) || 500).json({ error: String(err?.message || 'TALABAT_OUTLET_UPDATE_FAILED') });
    }
};

/** Push strikethrough promo (upsert by name+vendors+dates). Body: {vendors, name, skus, discountValue, ...}. */
export const promotionPush = async (req: Request, res: Response) => {
    try {
        const b = req.body || {};
        const skus = Array.isArray(b.skus) ? b.skus : String(b.skus || '').split(',').map((s: string) => s.trim()).filter(Boolean);
        const vendors = Array.isArray(b.vendors) ? b.vendors : String(b.vendors || '').split(',').map((s: string) => s.trim()).filter(Boolean);
        const job = await pushPromotion({
            vendors,
            name: String(b.name || ''),
            skus,
            discountSubtype: b.discountSubtype || b.discount_subtype,
            discountValue: Number(b.discountValue ?? b.discount_value),
            startTime: String(b.startTime || b.start_time || ''),
            endTime: String(b.endTime || b.end_time || ''),
            reason: b.reason,
            active: b.active !== false,
            locale: b.locale,
        });
        res.status(202).json(job);
    } catch (err: any) {
        res.status(Number(err?.status) || 500).json({ error: String(err?.message || 'TALABAT_PROMO_FAILED'), details: (err as any)?.details });
    }
};

export const promotionJobStatus = async (req: Request, res: Response) => {
    try {
        res.json(await getPromotionJob(String(req.params.jobId || '')));
    } catch (err: any) {
        res.status(Number(err?.status) || 500).json({ error: String(err?.message || 'TALABAT_PROMO_JOB_FAILED') });
    }
};

/** Validate promo body without pushing (preview). */
export const promotionPreview = async (req: Request, res: Response) => {
    const b = req.body || {};
    const skus = Array.isArray(b.skus) ? b.skus : String(b.skus || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    const vendors = Array.isArray(b.vendors) ? b.vendors : String(b.vendors || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    const built = buildStrikethroughBody({
        vendors, name: String(b.name || ''), skus,
        discountSubtype: b.discountSubtype, discountValue: Number(b.discountValue),
        startTime: String(b.startTime || ''), endTime: String(b.endTime || ''),
        reason: b.reason, active: b.active !== false, locale: b.locale,
    });
    if (!built.ok) return res.status(400).json({ error: (built as any).code });
    res.json((built as any).body);
};
