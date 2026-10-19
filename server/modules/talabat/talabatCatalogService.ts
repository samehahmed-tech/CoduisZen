/**
 * Talabat Catalog API (spec v2.0.2).
 * - PUT /v2/chains/{chain}/vendors/{vendor}/catalog {products:[{sku, price?, active?, quantity?}]} → 202 {job_id}
 * - GET .../catalog/jobs/{job} → job status (QUEUED/IN_PROGRESS/COMPLETED/FAILED)
 * - GET .../vendors/{vendor}/catalog → paginated retrieve (sandbox OK)
 * - POST .../catalog/export → 202 export job
 * - GET .../vendors/{vendor}/categories
 * Add Products is BETA — not used in production.
 */
import { db } from '../../db';
import { menuItems } from '../../../src/db/schema';
import { and, isNull, sql } from 'drizzle-orm';
import { getTalabatConfigRaw } from './talabatConfig';
import { getTalabatToken, TalabatRateLimiter } from './talabatClient';
import { resolvePlatformOverride } from '../../services/pricingService';
import logger from '../../utils/logger';

const log = logger.child({ service: 'talabat-catalog' });
const limiter = new TalabatRateLimiter(60);

export const TALABAT_SANDBOX_BASE = 'https://sandbox.partner.deliveryhero.io/v2';
export const TALABAT_PROD_BASE = 'https://talabat.partner.deliveryhero.io/v2';

export interface CatalogUpdate {
    sku: string;
    price?: number;
    active?: boolean;
    quantity?: number;
}

export const buildCatalogUpdates = (products: CatalogUpdate[]): { ok: true; products: CatalogUpdate[] } | { ok: false; code: string } => {
    if (!Array.isArray(products) || products.length === 0) return { ok: false, code: 'CATALOG_EMPTY' };
    const out: CatalogUpdate[] = [];
    for (const p of products) {
        const sku = String((p as any)?.sku || '').trim();
        if (!sku) return { ok: false, code: 'CATALOG_SKU_REQUIRED' };
        const hasPrice = (p as any)?.price !== undefined;
        const hasActive = (p as any)?.active !== undefined;
        const hasQty = (p as any)?.quantity !== undefined;
        if (!hasPrice && !hasActive && !hasQty) return { ok: false, code: 'CATALOG_FIELD_REQUIRED' };
        const row: CatalogUpdate = { sku };
        if (hasPrice) {
            const price = Number((p as any).price);
            if (!Number.isFinite(price) || price <= 0) return { ok: false, code: 'CATALOG_PRICE_INVALID' };
            row.price = price;
        }
        if (hasActive) row.active = Boolean((p as any).active);
        if (hasQty) {
            const qty = Number((p as any).quantity);
            if (!Number.isFinite(qty) || qty < 0) return { ok: false, code: 'CATALOG_QTY_INVALID' };
            row.quantity = qty;
        }
        out.push(row);
    }
    return { ok: true, products: out };
};

/** Menu rows → Talabat updates. Platform override wins; unavailable/deleted → active:false. */
export const buildVendorUpdatesFromMenu = (rows: Array<{
    sku?: string | null; price: number; isAvailable?: boolean | null; deletedAt?: any; platformPricing?: unknown;
}>): CatalogUpdate[] => {
    const out: CatalogUpdate[] = [];
    for (const r of rows) {
        const sku = String((r as any)?.sku || '').trim();
        if (!sku) continue;
        const override = resolvePlatformOverride((r as any)?.platformPricing, 'talabat');
        const price = override > 0 ? override : Number((r as any)?.price || 0);
        if (!(price > 0)) continue;
        out.push({ sku, price, active: (r as any)?.isAvailable !== false && !(r as any)?.deletedAt });
    }
    return out;
};

export const isCatalogJobTerminal = (status: unknown): boolean => {
    const s = String(status || '').toUpperCase();
    return s === 'COMPLETED' || s === 'FAILED';
};

const resolveBase = (config: { sandbox?: boolean; baseUrl?: string }): string => {
    if (config.baseUrl) return String(config.baseUrl).replace(/\/+$/, '');
    return config.sandbox ? TALABAT_SANDBOX_BASE : TALABAT_PROD_BASE;
};

const requireConfig = async () => {
    const config = await getTalabatConfigRaw();
    if (!config.chainId || !config.clientId || !config.clientSecret) {
        const err: any = new Error('TALABAT_NOT_CONFIGURED');
        err.status = 400;
        throw err;
    }
    const token = await getTalabatToken({ clientId: config.clientId, clientSecret: String(config.clientSecret), tokenUrl: config.tokenUrl });
    return { config, token, base: resolveBase(config) };
};

/** Push price/active updates for one vendor → {job_id}. 202 expected. */
export const pushCatalogUpdates = async (vendorId: string, products: CatalogUpdate[]): Promise<{ job_id: string; job_status: string }> => {
    const vendor = String(vendorId || '').trim();
    if (!vendor) throw Object.assign(new Error('VENDOR_ID_REQUIRED'), { status: 400 });
    const built = buildCatalogUpdates(products);
    if (!built.ok) throw Object.assign(new Error((built as any).code), { status: 400 });
    if (!limiter.tryAcquire(Date.now())) throw Object.assign(new Error('RATE_LIMITED'), { status: 429 });
    const { config, token, base } = await requireConfig();
    const res = await fetch(`${base}/chains/${config.chainId}/vendors/${vendor}/catalog`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ products: (built as any).products }),
    });
    const data: any = await res.json().catch(() => ({}));
    if (res.status !== 202) {
        log.warn({ vendor, status: res.status }, 'Talabat catalog push failed');
        throw Object.assign(new Error(`TALABAT_CATALOG_${res.status}`), { status: res.status, details: data });
    }
    return data;
};

export const getCatalogJob = async (jobId: string): Promise<any> => {
    const { config, token, base } = await requireConfig();
    const res = await fetch(`${base}/chains/${config.chainId}/catalog/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(`TALABAT_JOB_${res.status}`), { status: res.status });
    return data;
};

export const getVendorCatalog = async (vendorId: string, params?: { query_term?: string; page?: number; page_size?: number; is_active?: boolean }): Promise<any> => {
    const vendor = String(vendorId || '').trim();
    if (!vendor) throw Object.assign(new Error('VENDOR_ID_REQUIRED'), { status: 400 });
    const { config, token, base } = await requireConfig();
    const q = new URLSearchParams();
    if (params?.query_term) q.set('query_term', params.query_term);
    if (params?.page) q.set('page', String(params.page));
    if (params?.page_size) q.set('page_size', String(Math.min(params.page_size, 500)));
    if (params?.is_active !== undefined) q.set('is_active', String(params.is_active));
    const res = await fetch(`${base}/chains/${config.chainId}/vendors/${vendor}/catalog?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(`TALABAT_CATALOG_${res.status}`), { status: res.status });
    return data;
};

export const getVendorCategories = async (vendorId: string): Promise<any> => {
    const vendor = String(vendorId || '').trim();
    if (!vendor) throw Object.assign(new Error('VENDOR_ID_REQUIRED'), { status: 400 });
    const { config, token, base } = await requireConfig();
    const res = await fetch(`${base}/chains/${config.chainId}/vendors/${vendor}/categories?only_leaves=true`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(`TALABAT_CATEGORIES_${res.status}`), { status: res.status });
    return data;
};

/**
 * Fire-and-forget single-SKU sync to every mapped vendor.
 * Called from menu mutations — never throws, never blocks the response.
 */
export const queueTalabatCatalogSync = (update: CatalogUpdate): void => {
    const built = buildCatalogUpdates([update]);
    if (!built.ok) return;
    const products = (built as any).products as CatalogUpdate[];
    void (async () => {
        try {
            const config = await getTalabatConfigRaw();
            if (!config.chainId || !config.clientId || !config.clientSecret) return;
            const vendors = Object.keys(config.storeBranchMap || {});
            if (vendors.length === 0) return;
            for (const vendor of vendors) {
                try {
                    await pushCatalogUpdates(vendor, products);
                } catch (e: any) {
                    log.warn({ vendor, sku: products[0]?.sku, err: e?.message }, 'Talabat catalog auto-sync failed');
                }
            }
        } catch { /* best effort */ }
    })();
};

/** Full-menu snapshot for preview/push (DB read only). */
export const getMenuCatalogSnapshot = async (): Promise<CatalogUpdate[]> => {
    const rows = await db.select({
        sku: menuItems.sku, price: menuItems.price, isAvailable: menuItems.isAvailable,
        deletedAt: menuItems.deletedAt, platformPricing: menuItems.platformPricing,
    }).from(menuItems).where(and(isNull(menuItems.deletedAt), sql`${menuItems.sku} IS NOT NULL`));
    return buildVendorUpdatesFromMenu(rows as any);
};
