/**
 * Talabat Outlet Management (spec v2.0.2, production only — no sandbox).
 * - GET /v2/chains/{chain}/vendors/{vendor}/status → {vendor_id, status, closed_reason?, closed_until?}
 * - PUT .../status {status: OPEN|CLOSED_TODAY|CLOSED_UNTIL|CHECKIN, closed_reason?, closed_until?} → same shape
 * Reasons: TOO_BUSY_NO_DRIVERS|TOO_BUSY_KITCHEN|UPDATES_IN_MENU|TECHNICAL_PROBLEM|CLOSED|OTHER|BAD_WEATHER|HOLIDAY_SPECIAL_DAY
 */
import { getTalabatConfigRaw } from './talabatConfig';
import { getTalabatToken, TalabatRateLimiter } from './talabatClient';
import { TALABAT_PROD_BASE } from './talabatCatalogService';
import logger from '../../utils/logger';

const log = logger.child({ service: 'talabat-outlet' });
const limiter = new TalabatRateLimiter(60);

export type OutletStatus = 'OPEN' | 'CLOSED_TODAY' | 'CLOSED_UNTIL' | 'CHECKIN';
export type OutletReason =
    | 'TOO_BUSY_NO_DRIVERS' | 'TOO_BUSY_KITCHEN' | 'UPDATES_IN_MENU'
    | 'TECHNICAL_PROBLEM' | 'CLOSED' | 'OTHER' | 'BAD_WEATHER' | 'HOLIDAY_SPECIAL_DAY';

const STATUSES: OutletStatus[] = ['OPEN', 'CLOSED_TODAY', 'CLOSED_UNTIL', 'CHECKIN'];
const REASONS: OutletReason[] = [
    'TOO_BUSY_NO_DRIVERS', 'TOO_BUSY_KITCHEN', 'UPDATES_IN_MENU',
    'TECHNICAL_PROBLEM', 'CLOSED', 'OTHER', 'BAD_WEATHER', 'HOLIDAY_SPECIAL_DAY',
];

export const busyMinutesToClosedUntil = (minutes: number, now = new Date()): string => {
    return new Date(now.getTime() + Number(minutes) * 60_000).toISOString();
};

export const buildOutletBody = (input: { status: OutletStatus; closed_reason?: OutletReason; closed_until?: string }):
    { ok: true; body: Record<string, any> } | { ok: false; code: string } => {
    const status = String((input as any)?.status || '').toUpperCase() as OutletStatus;
    if (!STATUSES.includes(status)) return { ok: false, code: 'OUTLET_STATUS_INVALID' };
    const body: Record<string, any> = { status };
    if (status === 'OPEN' || status === 'CHECKIN') return { ok: true, body };
    const reason = String((input as any)?.closed_reason || 'OTHER').toUpperCase() as OutletReason;
    if ((input as any)?.closed_reason && !REASONS.includes(reason)) return { ok: false, code: 'OUTLET_REASON_INVALID' };
    body.closed_reason = reason;
    if (status === 'CLOSED_UNTIL') {
        const until = String((input as any)?.closed_until || '').trim();
        if (!until || Number.isNaN(new Date(until).getTime())) return { ok: false, code: 'OUTLET_UNTIL_REQUIRED' };
        body.closed_until = new Date(until).toISOString();
    }
    return { ok: true, body };
};

const requireConfig = async () => {
    const config = await getTalabatConfigRaw();
    if (!config.chainId || !config.clientId || !config.clientSecret) {
        throw Object.assign(new Error('TALABAT_NOT_CONFIGURED'), { status: 400 });
    }
    const token = await getTalabatToken({ clientId: config.clientId, clientSecret: String(config.clientSecret), tokenUrl: config.tokenUrl });
    // Outlet is production-only per spec; honor explicit baseUrl override if set.
    const base = config.baseUrl ? String(config.baseUrl).replace(/\/+$/, '') : TALABAT_PROD_BASE;
    return { config, token, base };
};

export const getOutletStatus = async (vendorId: string): Promise<any> => {
    const vendor = String(vendorId || '').trim();
    if (!vendor) throw Object.assign(new Error('VENDOR_ID_REQUIRED'), { status: 400 });
    const { config, token, base } = await requireConfig();
    const res = await fetch(`${base}/chains/${config.chainId}/vendors/${vendor}/status`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(`TALABAT_OUTLET_${res.status}`), { status: res.status });
    return data;
};

export const setOutletStatus = async (vendorId: string, input: { status: OutletStatus; closed_reason?: OutletReason; closed_until?: string }): Promise<any> => {
    const vendor = String(vendorId || '').trim();
    if (!vendor) throw Object.assign(new Error('VENDOR_ID_REQUIRED'), { status: 400 });
    const built = buildOutletBody(input);
    if (!built.ok) throw Object.assign(new Error((built as any).code), { status: 400 });
    if (!limiter.tryAcquire(Date.now())) throw Object.assign(new Error('RATE_LIMITED'), { status: 429 });
    const { config, token, base } = await requireConfig();
    const res = await fetch(`${base}/chains/${config.chainId}/vendors/${vendor}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify((built as any).body),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
        log.warn({ vendor, status: res.status }, 'Talabat outlet update failed');
        throw Object.assign(new Error(`TALABAT_OUTLET_${res.status}`), { status: res.status, details: data });
    }
    return data;
};
