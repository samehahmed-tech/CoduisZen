/**
 * Talabat Partner API HTTP client.
 * OAuth client_credentials + PUT/GET orders + 60/min rate guard.
 */

export const TALABAT_TOKEN_URL = 'https://talabat.partner.deliveryhero.io/v2/oauth/token';
export const TALABAT_ME_BASE = 'https://talabat.partner.deliveryhero.io/v2';

type FetchFn = typeof fetch;

let cachedToken: { token: string; expiresAt: number; key: string } | null = null;

export const __clearTalabatTokenCache = () => { cachedToken = null; };

export const getTalabatToken = async (
    config: { clientId: string; clientSecret: string; tokenUrl?: string },
    fetchFn: FetchFn = fetch,
): Promise<string> => {
    const key = `${config.clientId}:${config.tokenUrl || TALABAT_TOKEN_URL}`;
    if (cachedToken && cachedToken.key === key && cachedToken.expiresAt > Date.now() + 5 * 60_000) {
        return cachedToken.token;
    }
    const res = await fetchFn(config.tokenUrl || TALABAT_TOKEN_URL, {
        method: 'POST',
        // Spec: application/x-www-form-urlencoded (50 req/min per client ID)
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: config.clientId,
            client_secret: config.clientSecret,
        }).toString(),
    });
    if (!res.ok) throw new Error(`TALABAT_TOKEN_FAILED_${res.status}`);
    const data: any = await res.json();
    const token = String(data?.access_token || '').trim();
    if (!token) throw new Error('TALABAT_TOKEN_EMPTY');
    const ttlSec = Number(data?.expires_in || 7200);
    cachedToken = { token, key, expiresAt: Date.now() + ttlSec * 1000 };
    return token;
};

export interface PutItemInput {
    sku: string;
    pricingType: 'UNIT' | 'KG';
    quantity?: number;
    weight?: number;
    unitPrice?: number;
    totalPrice?: number;
    status: 'IN_CART' | 'NOT_FOUND' | 'REPLACED' | 'ADDITION';
    replacedId?: string;
}

export const VALID_CANCEL_REASONS = new Set(['CLOSED', 'ITEM_UNAVAILABLE', 'TOO_BUSY']);

export const buildPutOrderBody = (input: {
    orderId: string;
    status: 'READY_FOR_PICKUP' | 'DISPATCHED' | 'CANCELLED' | 'UPDATE_CART';
    items?: PutItemInput[];
    cancellationReason?: string;
}): Record<string, any> => {
    const body: Record<string, any> = { order_id: input.orderId, status: input.status };
    if (Array.isArray(input.items) && input.items.length > 0) {
        body.items = input.items.map((it) => {
            const row: Record<string, any> = { sku: it.sku, status: it.status };
            const pricing: Record<string, any> = { pricing_type: it.pricingType };
            if (it.pricingType === 'KG') {
                if (it.weight !== undefined) pricing.weight = it.weight;
            } else {
                if (it.quantity !== undefined) pricing.quantity = it.quantity;
                if (it.unitPrice !== undefined) pricing.unit_price = it.unitPrice;
                else if (it.totalPrice !== undefined) pricing.total_price = it.totalPrice;
            }
            row.pricing = pricing;
            if (it.replacedId) row.replaced_id = it.replacedId;
            return row;
        });
    }
    if (input.status === 'CANCELLED') {
        const reason = String(input.cancellationReason || 'TOO_BUSY').toUpperCase();
        body.cancellation = { reason: VALID_CANCEL_REASONS.has(reason) ? reason : 'TOO_BUSY' };
    }
    return body;
};

/** Sliding-window 60/min guard shared by all outbound Talabat calls. */
export class TalabatRateLimiter {
    private hits: number[] = [];
    constructor(private maxPerMinute = 60) {}
    tryAcquire(now = Date.now()): boolean {
        this.hits = this.hits.filter((t) => now - t < 60_000);
        if (this.hits.length >= this.maxPerMinute) return false;
        this.hits.push(now);
        return true;
    }
}

export const talabatPutOrder = async (
    args: { baseUrl?: string; chainId: string; orderId: string; token: string; body: Record<string, any> },
    fetchFn: FetchFn = fetch,
): Promise<{ ok: boolean; status: number; data: any }> => {
    const base = (args.baseUrl || TALABAT_ME_BASE).replace(/\/+$/, '');
    const res = await fetchFn(`${base}/chains/${args.chainId}/orders/${args.orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${args.token}` },
        body: JSON.stringify(args.body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
};

export const talabatGetOrder = async (
    args: { baseUrl?: string; chainId: string; orderId: string; token: string },
    fetchFn: FetchFn = fetch,
): Promise<{ ok: boolean; status: number; data: any }> => {
    const base = (args.baseUrl || TALABAT_ME_BASE).replace(/\/+$/, '');
    const res = await fetchFn(`${base}/chains/${args.chainId}/orders/${args.orderId}`, {
        headers: { Authorization: `Bearer ${args.token}` },
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
};
