/**
 * Generic aggregator framework (Elmenus / Mrsool / Fast / any webhook sender).
 *
 * Reality: only Talabat exposes a documented self-serve Partner API.
 * Other platforms integrate via account manager or aggregator middleware,
 * so this module accepts their webhooks in tolerant shapes and maps them
 * to the same internal order flow. Any official spec received later plugs
 * into normalizeAggregatorPayload + mapProviderStatus only.
 */
import { verifyTalabatWebhookAuth as verifySharedSecret } from '../talabat/talabatMapper';

export interface AggregatorProvider {
    id: string;
    name: string;
    nameAr: string;
    /** Raw statuses we understand. Unknown statuses ack + log, never crash. */
    statuses: Record<string, string | null>;
}

export const KNOWN_PROVIDERS: AggregatorProvider[] = [
    {
        id: 'elmenus', name: 'Elmenus', nameAr: 'المنيوز',
        statuses: {
            NEW: 'PENDING', RECEIVED: 'PENDING', CONFIRMED: 'PREPARING', PREPARING: 'PREPARING',
            READY: 'READY', DISPATCHED: 'OUT_FOR_DELIVERY', ON_THE_WAY: 'OUT_FOR_DELIVERY',
            DELIVERED: 'DELIVERED', CANCELLED: 'CANCELLED', REJECTED: 'CANCELLED', UPDATE_CART: null,
        },
    },
    {
        id: 'mrsool', name: 'Mrsool', nameAr: 'مرسول',
        statuses: {
            NEW: 'PENDING', PLACED: 'PENDING', ACCEPTED: 'PREPARING', PREPARING: 'PREPARING',
            READY: 'READY', PICKED_UP: 'OUT_FOR_DELIVERY', DELIVERING: 'OUT_FOR_DELIVERY',
            DELIVERED: 'DELIVERED', CANCELLED: 'CANCELLED',
        },
    },
    {
        id: 'fast', name: 'Fast', nameAr: 'فاست',
        statuses: {
            RECEIVED: 'PENDING', NEW: 'PENDING', PREPARING: 'PREPARING', READY: 'READY',
            DISPATCHED: 'OUT_FOR_DELIVERY', DELIVERED: 'DELIVERED', COMPLETED: 'DELIVERED', CANCELLED: 'CANCELLED',
        },
    },
    {
        id: 'generic', name: 'Generic', nameAr: 'عام',
        statuses: {
            RECEIVED: 'PENDING', NEW: 'PENDING', PREPARING: 'PREPARING', READY: 'READY',
            DISPATCHED: 'OUT_FOR_DELIVERY', DELIVERED: 'DELIVERED', COMPLETED: 'DELIVERED', CANCELLED: 'CANCELLED',
        },
    },
];

export const isKnownProvider = (id: unknown): boolean =>
    KNOWN_PROVIDERS.some((p) => p.id === String(id || '').trim().toLowerCase());

/** Raw provider status → internal status. Null/unknown = ack-only. */
export const mapProviderStatus = (providerId: string, status: unknown): string | null => {
    const provider = KNOWN_PROVIDERS.find((p) => p.id === String(providerId || '').trim().toLowerCase());
    if (!provider) return null;
    const hit = provider.statuses[String(status || '').trim().toUpperCase()];
    return hit === undefined ? null : hit;
};

export interface NormalizedItem {
    sku?: string;
    name?: string;
    quantity: number;
    unitPrice?: number;
    totalPrice?: number;
}

export interface NormalizedOrder {
    externalId: string;
    storeId: string;
    rawStatus: string;
    orderType: string;
    items: NormalizedItem[];
    subtotal: number;
    total: number;
    deliveryFee: number;
    customer: { name?: string; phone?: string; address?: string; notes?: string };
    notes?: string;
}

const str = (v: unknown): string => String(v ?? '').trim();
const num = (v: unknown, fallback = 0): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
};

const pick = (obj: any, keys: string[]): any => {
    for (const k of keys) {
        const v = obj?.[k];
        if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return undefined;
};

/** Tolerant normalizer: accepts snake_case, camelCase and nested client/payment/customer shapes. */
export const normalizeAggregatorPayload = (
    _providerId: string,
    payload: Record<string, any>,
): { ok: true; order: NormalizedOrder } | { ok: false; code: string } => {
    if (!payload || typeof payload !== 'object') return { ok: false, code: 'INVALID_PAYLOAD' };
    const externalId = str(pick(payload, ['order_id', 'orderId', 'external_order_id', 'externalOrderId', 'id']));
    if (!externalId) return { ok: false, code: 'ORDER_ID_REQUIRED' };
    const storeId = str(payload?.client?.store_id ?? pick(payload, ['store_id', 'storeId', 'vendor_id', 'vendorId', 'branch_code', 'branchCode']));
    const rawStatus = str(pick(payload, ['status', 'order_status', 'orderStatus'])).toUpperCase() || 'RECEIVED';
    const orderType = /pickup|takeaway|take_away/i.test(str(pick(payload, ['order_type', 'orderType']))) ? 'TAKEAWAY' : 'DELIVERY';
    const rawItems = pick(payload, ['items', 'order_items', 'orderItems', 'lines']) || [];
    const items: NormalizedItem[] = (Array.isArray(rawItems) ? rawItems : []).map((it: any) => {
        const quantity = Math.max(1, Math.floor(num(pick(it, ['quantity', 'qty', 'count']), 1)));
        return {
            sku: str(pick(it, ['sku', 'item_code', 'itemCode', 'code'])) || undefined,
            name: str(pick(it, ['name', 'title', 'item_name', 'itemName'])) || undefined,
            quantity,
            unitPrice: pick(it, ['unit_price', 'unitPrice', 'price']) !== undefined ? num(pick(it, ['unit_price', 'unitPrice', 'price'])) : undefined,
            totalPrice: pick(it, ['total_price', 'totalPrice', 'line_total', 'lineTotal']) !== undefined ? num(pick(it, ['total_price', 'totalPrice', 'line_total', 'lineTotal'])) : undefined,
        };
    }).filter((it) => it.sku || it.name);
    const pay = payload?.payment || {};
    const subtotal = num(pay.sub_total ?? payload?.sub_total ?? payload?.subtotal);
    const total = num(pay.order_total ?? payload?.order_total ?? payload?.total, subtotal);
    const deliveryFee = num(pay.delivery_fee ?? payload?.delivery_fee ?? payload?.deliveryFee);
    const c = payload?.customer || {};
    const addr = c?.delivery_address || {};
    const customer = {
        name: str(c?.name ?? [c?.first_name, c?.last_name].filter(Boolean).join(' ')) || undefined,
        phone: str(c?.phone ?? c?.phone_number ?? c?.mobile) || undefined,
        address: str(c?.address ?? addr?.formattedAddress ?? addr?.formatted_address) || undefined,
        notes: str(c?.notes ?? addr?.instructions) || undefined,
    };
    return {
        ok: true,
        order: {
            externalId, storeId, rawStatus, orderType, items,
            subtotal, total: total || subtotal, deliveryFee, customer,
            notes: str(payload?.comment ?? payload?.notes) || undefined,
        },
    };
};

export interface ProviderBranchConfig {
    storeBranchMap?: Record<string, string>;
    defaultBranchId?: string;
}

export const resolveAggregatorBranch = (config: ProviderBranchConfig, storeId: string): string | null => {
    const key = str(storeId);
    if (key && config?.storeBranchMap?.[key]) return config.storeBranchMap[key];
    return str(config?.defaultBranchId) || null;
};

export const buildAggregatorIdempotencyKey = (providerId: string, externalId: string, status: string): string =>
    `AGG:${str(providerId).toUpperCase()}:${str(externalId)}:${str(status).toUpperCase()}`;

export const AGGREGATOR_IDEMPOTENCY_SCOPE = 'AGGREGATOR_ORDER';

export const verifyProviderAuth = (
    headers: { authorization?: string; [k: string]: any },
    secret: string,
    basic?: { username: string; password: string },
): boolean => verifySharedSecret(headers, secret, basic);
