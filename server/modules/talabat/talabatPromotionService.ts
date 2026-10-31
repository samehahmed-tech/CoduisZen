/**
 * Talabat Promotion API (spec v2.0.2, production only — no sandbox).
 * - PUT /v2/chains/{chain}/promotion (upsert; identity = name+vendors+start+end) → 202 {job_id}
 * - GET .../promotion/jobs/{job} → QUEUED/COMPLETED/FAILED/DUPLICATE + result details
 * Types: STRIKETHROUGH (stable) | SAME_ITEM_BUNDLE (WIP — contract stable per spec).
 * Reasons: OVERSTOCK|DELISTING|COMPETITIVENESS|EXPIRING_SOON|NMR|TRADING.
 */
import { getTalabatConfigRaw } from './talabatConfig';
import { getTalabatToken, TalabatRateLimiter, talabatRequest } from './talabatClient';
import { TALABAT_PROD_BASE } from './talabatCatalogService';
import logger from '../../utils/logger';

const log = logger.child({ service: 'talabat-promotion' });
const limiter = new TalabatRateLimiter(60);

const REASONS = ['OVERSTOCK', 'DELISTING', 'COMPETITIVENESS', 'EXPIRING_SOON', 'NMR', 'TRADING'] as const;

export interface StrikethroughInput {
    vendors: string[];
    name: string;
    skus: string[];
    discountSubtype?: string;
    discountValue: number;
    startTime: string;
    endTime: string;
    reason?: string;
    active?: boolean;
    locale?: string;
}

export const buildStrikethroughBody = (input: StrikethroughInput):
    { ok: true; body: Record<string, any> } | { ok: false; code: string } => {
    const vendors = Array.from(new Set((input.vendors || []).map((v) => String(v || '').trim()).filter(Boolean)));
    if (vendors.length === 0) return { ok: false, code: 'PROMO_VENDORS_REQUIRED' };
    const name = String(input.name || '').trim();
    if (!name) return { ok: false, code: 'PROMO_NAME_REQUIRED' };
    const skus = Array.from(new Set((input.skus || []).map((s) => String(s || '').trim()).filter(Boolean)));
    if (skus.length === 0) return { ok: false, code: 'PROMO_SKUS_REQUIRED' };
    const value = Number(input.discountValue);
    const subtype = String(input.discountSubtype || 'PERCENTAGE').toUpperCase();
    if (!Number.isFinite(value) || value <= 0) return { ok: false, code: 'PROMO_VALUE_INVALID' };
    if (subtype === 'PERCENTAGE' && value > 100) return { ok: false, code: 'PROMO_VALUE_INVALID' };
    const start = new Date(input.startTime);
    const end = new Date(input.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getTime() >= end.getTime()) {
        return { ok: false, code: 'PROMO_DATES_INVALID' };
    }
    const reason = String(input.reason || 'COMPETITIVENESS').toUpperCase();
    if (!(REASONS as readonly string[]).includes(reason)) return { ok: false, code: 'PROMO_REASON_INVALID' };
    const locale = String(input.locale || 'en_GB').trim() || 'en_GB';
    return {
        ok: true,
        body: {
            vendors,
            type: 'STRIKETHROUGH',
            active: input.active !== false,
            reason,
            display_name: { [locale]: name },
            conditions: { start_time: start.toISOString(), end_time: end.toISOString() },
            discount: [{ discount_subtype: subtype, discount_value: value, active: true, sku: skus }],
        },
    };
};

const requireConfig = async () => {
    const config = await getTalabatConfigRaw();
    if (!config.chainId || !config.clientId || !config.clientSecret) {
        throw Object.assign(new Error('TALABAT_NOT_CONFIGURED'), { status: 400 });
    }
    const token = await getTalabatToken({ clientId: config.clientId, clientSecret: String(config.clientSecret), tokenUrl: config.tokenUrl });
    const base = config.baseUrl ? String(config.baseUrl).replace(/\/+$/, '') : TALABAT_PROD_BASE;
    return { config, token, base };
};

export const pushPromotion = async (input: StrikethroughInput): Promise<{ job_id: string; job_status: string }> => {
    const built = buildStrikethroughBody(input);
    if (!built.ok) throw Object.assign(new Error((built as any).code), { status: 400 });
    if (!limiter.tryAcquire(Date.now())) throw Object.assign(new Error('RATE_LIMITED'), { status: 429 });
    const { config, token, base } = await requireConfig();
    const res = await talabatRequest(`${base}/chains/${config.chainId}/promotion`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify((built as any).body),
    });
    const data: any = await res.json().catch(() => ({}));
    if (res.status !== 202) {
        log.warn({ status: res.status }, 'Talabat promotion push failed');
        throw Object.assign(new Error(`TALABAT_PROMO_${res.status}`), { status: res.status, details: data });
    }
    return data;
};

export const getPromotionJob = async (jobId: string): Promise<any> => {
    const id = String(jobId || '').trim();
    if (!id) throw Object.assign(new Error('JOB_ID_REQUIRED'), { status: 400 });
    const { config, token, base } = await requireConfig();
    const res = await talabatRequest(`${base}/chains/${config.chainId}/promotion/jobs/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(`TALABAT_PROMO_JOB_${res.status}`), { status: res.status });
    return data;
};
