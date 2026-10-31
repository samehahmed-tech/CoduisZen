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
import { createSignedAuditLog } from '../services/auditService';

const log = logger.child({ controller: 'talabat-admin' });

const auditTalabatMutation = (req: Request, eventType: string, payload: Record<string, unknown>, after?: Record<string, unknown>) => createSignedAuditLog({
    eventType,
    userId: req.user?.id || 'system',
    userRole: req.user?.role,
    branchId: req.effectiveBranchId || req.user?.branchId || null,
    requestId: req.requestId,
    sourceDevice: req.headers['user-agent'],
    payload,
    after,
    reason: `Talabat mutation: ${eventType}`,
});

const assertVendorBranchScope = async (req: Request, vendorId: string) => {
    const vendor = String(vendorId || '').trim();
    if (!vendor || !req.effectiveBranchId) return;
    const config = await getTalabatConfigRaw();
    const mappedBranchId = String(config.storeBranchMap?.[vendor] || '').trim();
    if (!mappedBranchId) {
        throw Object.assign(new Error('VENDOR_BRANCH_MAPPING_REQUIRED'), { status: 403 });
    }
    if (mappedBranchId !== String(req.effectiveBranchId)) {
        throw Object.assign(new Error('BRANCH_MISMATCH'), { status: 403 });
    }
};

export const getConfig = async (_req: Request, res: Response) => {
    res.json(await getTalabatConfig());
};

export const updateConfig = async (req: Request, res: Response) => {
    try {
        await saveTalabatConfig(req.body || {}, (req as any).user?.id || 'system');
        const config = await getTalabatConfig();
        await auditTalabatMutation(req, 'TALABAT_CONFIG_UPDATED', { changedKeys: Object.keys(req.body || {}).sort() }, { updated: true });
        res.json(config);
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
        const [order] = await db.select({ status: orders.status, cancelReason: orders.cancelReason }).from(orders).where(and(
            eq(orders.id, orderId),
            req.effectiveBranchId ? eq(orders.branchId, req.effectiveBranchId) : undefined,
        ));
        if (!order) return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
        const result = await syncTalabatStatus(orderId, String(order.status), { cancellationReason: String((order as any).cancelReason || req.body?.cancellationReason || 'TOO_BUSY') });
        await auditTalabatMutation(req, 'TALABAT_ORDER_SYNCED', { orderId, status: order.status }, { synced: result.synced });
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
            .where(and(
                eq(orders.deliverySource, 'talabat'),
                gte(orders.createdAt, start),
                lte(orders.createdAt, end),
                req.effectiveBranchId ? eq(orders.branchId, req.effectiveBranchId) : undefined,
            ))
            .orderBy(desc(orders.createdAt)).limit(limit);
        const inboundRows = await db.select().from(webhookDeliveries)
            .where(eq(webhookDeliveries.endpointId, 'talabat-inbound'))
            .orderBy(desc(webhookDeliveries.createdAt)).limit(limit);
        const talabatConfig = req.effectiveBranchId ? await getTalabatConfigRaw() : null;
        const inbound = req.effectiveBranchId
            ? inboundRows.filter((row: any) => {
                let payload: any = row.payload;
                if (typeof payload === 'string') {
                    try { payload = JSON.parse(payload); } catch { payload = null; }
                }
                const storeId = String(payload?.store_id || payload?.storeId || '').trim();
                const payloadBranchId = String(payload?.branchId || payload?.branch_id || '').trim();
                return payloadBranchId === String(req.effectiveBranchId)
                    || Boolean(storeId && talabatConfig?.storeBranchMap?.[storeId] === req.effectiveBranchId);
            })
            : inboundRows;
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
        if (res2.ok && req.effectiveBranchId) {
            const remote: any = res2.data || {};
            const remoteBranchId = String(remote.branchId || remote.branch_id || '').trim();
            const remoteStoreId = String(remote.store_id || remote.storeId || remote.vendor_id || remote.vendorId || '').trim();
            if (remoteBranchId && remoteBranchId !== String(req.effectiveBranchId)) {
                return res.status(403).json({ error: 'BRANCH_MISMATCH' });
            }
            if (remoteStoreId) await assertVendorBranchScope(req, remoteStoreId);
            if (!remoteBranchId && !remoteStoreId) {
                return res.status(403).json({ error: 'REMOTE_ORDER_BRANCH_UNKNOWN' });
            }
        }
        res.status(res2.status).json(res2.data);
    } catch (err: any) {
        res.status(500).json({ error: 'TALABAT_FETCH_FAILED', details: String(err?.message || err) });
    }
};

/** Local E2E without Talabat: inject a synthetic RECEIVED payload through the real ingest path. */export const injectTestOrder = async (req: Request, res: Response) => {
    try {
        const config = await getTalabatConfigRaw();
        const mappedStoreIds = Object.entries(config.storeBranchMap || {})
            .filter(([, branchId]) => !req.effectiveBranchId || String(branchId) === String(req.effectiveBranchId))
            .map(([storeId]) => storeId);
        const storeId = String(req.body?.store_id || mappedStoreIds[0] || (!req.effectiveBranchId ? config.defaultBranchId : '') || '').trim();
        if (!storeId) return res.status(400).json({ error: 'STORE_ID_REQUIRED', message: 'Map a store in Talabat config first.' });
        await assertVendorBranchScope(req, storeId);
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
        await auditTalabatMutation(req, 'TALABAT_TEST_ORDER_INJECTED', { storeId, orderId: payload.order_id, itemCount: payload.items.length, total: payload.order_total }, { ingested: true });
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
        await assertVendorBranchScope(req, vendorId);
        const products = Array.isArray(req.body?.products) && req.body.products.length > 0
            ? req.body.products
            : await getMenuCatalogSnapshot();
        const job = await pushCatalogUpdates(vendorId, products);
        await auditTalabatMutation(req, 'TALABAT_CATALOG_PUSH_REQUESTED', { vendorId, productCount: products.length }, { queued: true });
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
        const vendorId = String(req.params.vendorId || '');
        await assertVendorBranchScope(req, vendorId);
        res.json(await getVendorCatalog(vendorId, {
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
        const vendorId = String(req.params.vendorId || '');
        await assertVendorBranchScope(req, vendorId);
        res.json(await getVendorCategories(vendorId));
    } catch (err: any) {
        res.status(Number(err?.status) || 500).json({ error: String(err?.message || 'TALABAT_CATEGORIES_FAILED') });
    }
};

export const outletStatus = async (req: Request, res: Response) => {
    try {
        const vendorId = String(req.params.vendorId || '');
        await assertVendorBranchScope(req, vendorId);
        res.json(await getOutletStatus(vendorId));
    } catch (err: any) {
        res.status(Number(err?.status) || 500).json({ error: String(err?.message || 'TALABAT_OUTLET_FAILED') });
    }
};

/** Body: {status, closed_reason?, closed_until?} or {busyMinutes} shortcut for TOO_BUSY_KITCHEN. */
export const outletUpdate = async (req: Request, res: Response) => {
    try {
        await assertVendorBranchScope(req, String(req.params.vendorId || ''));
        const body = req.body || {};
        const input: any = { status: body.status };
        if (body.closed_reason) input.closed_reason = body.closed_reason;
        if (body.closed_until) input.closed_until = body.closed_until;
        if (body.busyMinutes && !input.closed_until) {
            input.status = 'CLOSED_UNTIL';
            input.closed_reason = input.closed_reason || 'TOO_BUSY_KITCHEN';
            input.closed_until = busyMinutesToClosedUntil(Number(body.busyMinutes));
        }
        const result = await setOutletStatus(String(req.params.vendorId || ''), input);
        await auditTalabatMutation(req, 'TALABAT_OUTLET_STATUS_UPDATED', { vendorId: String(req.params.vendorId || ''), status: input.status }, { updated: true });
        res.json(result);
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
        for (const vendor of vendors) await assertVendorBranchScope(req, String(vendor));
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
        await auditTalabatMutation(req, 'TALABAT_PROMOTION_PUSH_REQUESTED', { vendorCount: vendors.length, skuCount: skus.length, active: b.active !== false }, { queued: true });
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
