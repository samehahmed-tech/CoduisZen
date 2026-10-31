import crypto from 'crypto';
import type {
    InternalOrderStatus,
    InternalOrderType,
    NormalizedTalabatItem,
    TalabatOrderItem,
    TalabatWebhookPayload,
} from './talabatTypes';

/** Talabat -> internal status. UPDATE_CART is cart-only, no status change. */
export const mapTalabatStatus = (status: unknown): InternalOrderStatus | null => {
    switch (String(status || '').toUpperCase()) {
        case 'RECEIVED': return 'PENDING';
        case 'READY_FOR_PICKUP': return 'READY';
        case 'DISPATCHED': return 'OUT_FOR_DELIVERY';
        case 'CANCELLED': return 'CANCELLED';
        case 'UPDATE_CART': return null;
        default: return null;
    }
};

export const mapTalabatOrderType = (orderType: unknown): InternalOrderType => {
    return String(orderType || '').toUpperCase() === 'PICKUP' ? 'TAKEAWAY' : 'DELIVERY';
};

export const TALABAT_IDEMPOTENCY_SCOPE = 'TALABAT_ORDER';

export const buildTalabatIdempotencyKey = (orderId: string, status: string): string => {
    return `${TALABAT_IDEMPOTENCY_SCOPE}:${String(orderId || '').trim()}:${String(status || '').trim().toUpperCase()}`;
};

export const validateTalabatPayload = (payload: TalabatWebhookPayload): { ok: true } | { ok: false; code: string } => {
    if (!payload || typeof payload !== 'object') return { ok: false, code: 'INVALID_PAYLOAD' };
    if (!String((payload as any).order_id || '').trim()) return { ok: false, code: 'ORDER_ID_REQUIRED' };
    if (!String((payload as any).status || '').trim()) return { ok: false, code: 'STATUS_REQUIRED' };
    if (!getStoreId(payload) && !getExternalConfigId(payload)) {
        return { ok: false, code: 'STORE_ID_REQUIRED' };
    }
    return { ok: true };
};

/** Real shape nests store under client; flat shape kept for compat. */
export const getStoreId = (payload: TalabatWebhookPayload): string => {
    return String((payload as any)?.client?.store_id || (payload as any)?.store_id || '').trim();
};

export const getExternalConfigId = (payload: TalabatWebhookPayload): string => {
    return String((payload as any)?.client?.external_partner_config_id || (payload as any)?.external_partner_config_id || '').trim();
};

export const getTotals = (payload: TalabatWebhookPayload): { subTotal: number; orderTotal: number; deliveryFee: number } => {
    const pay = (payload as any)?.payment || {};
    const subTotal = Number(pay.sub_total ?? (payload as any)?.sub_total ?? 0);
    const orderTotal = Number(pay.order_total ?? (payload as any)?.order_total ?? subTotal);
    const deliveryFee = Number(pay.delivery_fee ?? (payload as any)?.delivery_fee ?? 0);
    return {
        subTotal: Number.isFinite(subTotal) ? subTotal : 0,
        orderTotal: Number.isFinite(orderTotal) ? orderTotal : subTotal,
        deliveryFee: Number.isFinite(deliveryFee) ? deliveryFee : 0,
    };
};

export const getCustomer = (payload: TalabatWebhookPayload): { name?: string; phone?: string; address?: string; lat?: number; lng?: number; notes?: string } => {
    const c = (payload as any)?.customer || {};
    const addr = c?.delivery_address || {};
    const fullName = [c?.first_name, c?.last_name].map((x) => String(x || '').trim()).filter(Boolean).join(' ');
    const address = String(c?.address || addr?.formattedAddress || [addr?.street, addr?.building, addr?.apartment, addr?.city].map((x: any) => String(x || '').trim()).filter(Boolean).join(', ') || '').trim() || undefined;
    return {
        name: String(c?.name || fullName || '').trim() || undefined,
        phone: String(c?.phone_number || c?.phone || '').trim() || undefined,
        address,
        lat: addr?.latitude ?? c?.lat ?? undefined,
        lng: addr?.longitude ?? c?.lng ?? undefined,
        notes: String(c?.notes || addr?.instructions || '').trim() || undefined,
    };
};

export const normalizeTalabatItems = (items: TalabatOrderItem[] | undefined): NormalizedTalabatItem[] => {
    if (!Array.isArray(items)) return [];
    return items
        .map((item) => {
            const sku = String((item as any)?.sku || '').trim();
            if (!sku) return null;
            const pricing = (item as any)?.pricing || {};
            const pricingType = String(pricing.pricing_type || 'UNIT').toUpperCase() === 'KG' ? 'KG' as const : 'UNIT' as const;
            const quantity = Number(pricing.quantity ?? 1);
            return {
                sku,
                quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
                weight: pricing.weight !== undefined ? Number(pricing.weight) : undefined,
                unitPrice: pricing.unit_price !== undefined ? Number(pricing.unit_price) : undefined,
                totalPrice: pricing.total_price !== undefined ? Number(pricing.total_price) : undefined,
                pricingType,
                status: (item as any)?.status || 'IN_CART',
                replacedId: (item as any)?.replaced_id || undefined,
            } as NormalizedTalabatItem;
        })
        .filter((x): x is NormalizedTalabatItem => x !== null);
};

/** Stable business-data fingerprint; status transitions are intentionally excluded. */
export const buildTalabatPayloadFingerprint = (payload: TalabatWebhookPayload): string => {
    const totals = getTotals(payload);
    const customer = getCustomer(payload);
    const canonical = {
        orderId: String((payload as any)?.order_id || '').trim(),
        storeId: getStoreId(payload),
        externalConfigId: getExternalConfigId(payload),
        orderType: String((payload as any)?.order_type || '').trim().toUpperCase(),
        items: normalizeTalabatItems((payload as any)?.items).map((item) => ({
            sku: String(item.sku || '').trim(),
            quantity: Number(item.quantity || 0),
            unitPrice: Number(item.unitPrice || 0),
            totalPrice: Number(item.totalPrice || 0),
            status: String(item.status || '').trim().toUpperCase(),
        })),
        subtotal: totals.subTotal,
        total: totals.orderTotal,
        deliveryFee: totals.deliveryFee,
        customer: { name: customer.name || '', phone: customer.phone || '', address: customer.address || '' },
    };
    return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
};

const safeEqual = (a: string, b: string): boolean => {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

/**
 * Talabat webhook auth: secret is mandatory in Partner Portal.
 * Accepts exact secret match (Bearer or raw) or Basic username:password.
 */
export const verifyTalabatWebhookAuth = (
    headers: { authorization?: string; [k: string]: any },
    secret: string,
    basic?: { username: string; password: string },
): boolean => {
    const auth = String(headers?.authorization || headers?.Authorization || '').trim();
    if (!auth) return false;
    const expectedSecret = String(secret || '').trim();
    if (expectedSecret) {
        const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : auth;
        if (token && safeEqual(token, expectedSecret)) return true;
        if (safeEqual(auth, expectedSecret)) return true;
    }
    if (basic?.username && basic?.password) {
        const expected = `Basic ${Buffer.from(`${basic.username}:${basic.password}`).toString('base64')}`;
        if (safeEqual(auth, expected)) return true;
    }
    return false;
};
