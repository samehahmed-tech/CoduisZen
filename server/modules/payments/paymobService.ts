/**
 * Paymob Accept (standard redirect) integration.
 *
 * Flow: auth token → ecommerce order → payment key → hosted iframe →
 * Transaction Processed Callback (HMAC-SHA512 verified).
 * InstaPay acceptance runs through this same account: configure the
 * InstaPay integration id and checkouts use it instead of the card one.
 */
import crypto from 'crypto';
import { db } from '../../db';
import { settings } from '../../../src/db/schema';
import { eq } from 'drizzle-orm';
import { parseSettingJson, upsertSetting } from '../../utils/settingsStore';
import logger from '../../utils/logger';

const log = logger.child({ service: 'paymob' });

export const PAYMOB_BASE = 'https://accept.paymob.com/api';

export interface PaymobConfig {
    enabled: boolean;
    apiKey?: string;
    /** Card/online integration id (Accept dashboard → Developers → Payment Integrations). */
    cardIntegrationId?: string;
    /** InstaPay integration id on the same Paymob account (optional). */
    instapayIntegrationId?: string;
    iframeId?: string;
    /** Transaction Processed Callback HMAC secret. */
    hmacSecret?: string;
    baseUrl?: string;
    /** Branch allowlist. Empty = all branches. */
    branchIds?: string[];
}

const KEY = 'paymob_config';

export const getPaymobConfigRaw = async (): Promise<PaymobConfig> => {
    try {
        const [row] = await db.select().from(settings).where(eq(settings.key, KEY));
        return { enabled: false, ...(parseSettingJson<Partial<PaymobConfig>>(row?.value, {}) || {}) } as PaymobConfig;
    } catch {
        return { enabled: false };
    }
};

export const getPaymobConfig = async (): Promise<Record<string, any>> => {
    const raw = await getPaymobConfigRaw();
    const { apiKey, hmacSecret, ...rest } = raw as any;
    return { ...rest, apiKeySet: Boolean(apiKey), hmacSecretSet: Boolean(hmacSecret) };
};

export const savePaymobConfig = async (input: Partial<PaymobConfig>, updatedBy?: string): Promise<void> => {
    const current = await getPaymobConfigRaw();
    const next: PaymobConfig = { ...current };
    if (input.enabled !== undefined) next.enabled = Boolean(input.enabled);
    for (const k of ['apiKey', 'cardIntegrationId', 'instapayIntegrationId', 'iframeId', 'hmacSecret', 'baseUrl'] as const) {
        if ((input as any)[k] !== undefined) (next as any)[k] = String((input as any)[k] || '').trim() || undefined;
    }
    if ((input as any).branchIds !== undefined) {
        next.branchIds = Array.isArray((input as any).branchIds)
            ? (input as any).branchIds.map((b: any) => String(b || '').trim()).filter(Boolean)
            : [];
    }
    await upsertSetting({ key: KEY, value: next, category: 'payments', updatedBy: updatedBy || 'system' });
};

export const toCents = (amount: number): number => Math.round(Number(amount || 0) * 100);

export const buildIframeUrl = (base: string, iframeId: string, paymentKey: string): string =>
    `${String(base).replace(/\/+$/, '')}/acceptance/iframes/${iframeId}?payment_token=${paymentKey}`;

/** Documented concatenation order for the Transaction Processed Callback HMAC. */
const HMAC_ORDER = [
    'amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction', 'id',
    'integration_id', 'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded', 'is_standalone_payment',
    'is_voided', 'order.id', 'owner', 'pending', 'source_data.pan', 'source_data.sub_type',
    'source_data.type', 'success',
];

const hmacField = (obj: any, path: string): string => {
    if (path === 'order.id') return String(obj?.order?.id ?? '');
    if (path.startsWith('source_data.')) return String(obj?.source_data?.[path.slice('source_data.'.length)] ?? '');
    return String(obj?.[path] ?? '');
};

const safeEqual = (a: string, b: string): boolean => {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

/** True only when the callback signature matches. Fail closed on any doubt. */
export const verifyPaymobHmac = (obj: any, secret: string): boolean => {
    try {
        const given = String(obj?.hmac || '').trim();
        const key = String(secret || '').trim();
        if (!given || !key) return false;
        const concatenated = HMAC_ORDER.map((k) => hmacField(obj, k)).join('');
        const expected = crypto.createHmac('sha512', key).update(concatenated).digest('hex');
        return safeEqual(given.toLowerCase(), expected.toLowerCase());
    } catch {
        return false;
    }
};

const baseOf = (config: PaymobConfig): string =>
    String(config.baseUrl || PAYMOB_BASE).replace(/\/+$/, '');

const requestAuthToken = async (config: PaymobConfig): Promise<string> => {
    const res = await fetch(`${baseOf(config)}/auth/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: config.apiKey }),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data?.token) throw Object.assign(new Error('PAYMOB_AUTH_FAILED'), { status: res.status || 500 });
    return String(data.token);
};

export interface BillingData {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone_number?: string;
    apartment?: string;
    floor?: string;
    street?: string;
    building?: string;
    city?: string;
    country?: string;
    state?: string;
    postal_code?: string;
}

const defaultBilling = (billing?: BillingData): BillingData => ({
    first_name: billing?.first_name || 'Guest',
    last_name: billing?.last_name || 'Customer',
    email: billing?.email || 'guest@example.com',
    phone_number: billing?.phone_number || '+201000000000',
    apartment: billing?.apartment || 'NA',
    floor: billing?.floor || 'NA',
    street: billing?.street || 'NA',
    building: billing?.building || 'NA',
    city: billing?.city || 'Cairo',
    country: billing?.country || 'EG',
    state: billing?.state || 'Cairo',
    postal_code: billing?.postal_code || 'NA',
    ...billing,
});

/**
 * Full intention: auth → order → payment key → iframe URL.
 * method: 'CARD' uses cardIntegrationId, 'INSTAPAY' uses instapayIntegrationId.
 */
export const createIntention = async (input: {
    amount: number;
    currency?: string;
    merchantOrderId?: string;
    billing?: BillingData;
    method?: 'CARD' | 'INSTAPAY';
    branchId?: string;
}): Promise<{ iframeUrl: string; paymobOrderId: number; paymentKey: string; method: string }> => {
    const config = await getPaymobConfigRaw();
    if (!config.enabled) throw Object.assign(new Error('PAYMOB_DISABLED'), { status: 503 });
    if (!config.apiKey || !config.iframeId) throw Object.assign(new Error('PAYMOB_NOT_CONFIGURED'), { status: 400 });
    if (Array.isArray(config.branchIds) && config.branchIds.length > 0 && input.branchId && !config.branchIds.includes(input.branchId)) {
        throw Object.assign(new Error('PAYMOB_BRANCH_NOT_ENABLED'), { status: 403 });
    }
    const method = input.method === 'INSTAPAY' ? 'INSTAPAY' : 'CARD';
    const integrationId = method === 'INSTAPAY' ? config.instapayIntegrationId : config.cardIntegrationId;
    if (!integrationId) {
        throw Object.assign(new Error(method === 'INSTAPAY' ? 'INSTAPAY_NOT_CONFIGURED' : 'PAYMOB_INTEGRATION_MISSING'), { status: 400 });
    }
    const amountCents = toCents(input.amount);
    if (!(amountCents > 0)) throw Object.assign(new Error('PAYMOB_AMOUNT_INVALID'), { status: 400 });

    const token = await requestAuthToken(config);
    const orderRes = await fetch(`${baseOf(config)}/ecommerce/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            auth_token: token,
            delivery_needed: false,
            amount_cents: amountCents,
            currency: input.currency || 'EGP',
            merchant_order_id: input.merchantOrderId,
            items: [],
        }),
    });
    const order: any = await orderRes.json().catch(() => ({}));
    if (!orderRes.ok || !order?.id) {
        log.warn({ status: orderRes.status }, 'Paymob order register failed');
        throw Object.assign(new Error('PAYMOB_ORDER_FAILED'), { status: orderRes.status || 500 });
    }
    const keyRes = await fetch(`${baseOf(config)}/acceptance/payment_keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            auth_token: token,
            amount_cents: amountCents,
            expiration: 3600,
            order_id: order.id,
            billing_data: defaultBilling(input.billing),
            currency: input.currency || 'EGP',
            integration_id: Number(integrationId),
        }),
    });
    const keyData: any = await keyRes.json().catch(() => ({}));
    if (!keyRes.ok || !keyData?.token) {
        log.warn({ status: keyRes.status }, 'Paymob payment key failed');
        throw Object.assign(new Error('PAYMOB_KEY_FAILED'), { status: keyRes.status || 500 });
    }
    return {
        iframeUrl: buildIframeUrl(baseOf(config), String(config.iframeId), String(keyData.token)),
        paymobOrderId: Number(order.id),
        paymentKey: String(keyData.token),
        method,
    };
};

export interface PaymobCallbackResult {
    verified: boolean;
    success: boolean;
    transactionId?: number;
    amountCents?: number;
    paymobOrderId?: number;
    merchantOrderId?: string;
}

/** Verify + parse a Transaction Processed Callback body. Never throws on bad input. */
export const handleCallback = async (obj: any): Promise<PaymobCallbackResult> => {
    const config = await getPaymobConfigRaw();
    const verified = verifyPaymobHmac(obj, String(config.hmacSecret || ''));
    if (!verified) return { verified: false, success: false };
    return {
        verified: true,
        success: Boolean(obj?.success),
        transactionId: obj?.id !== undefined ? Number(obj.id) : undefined,
        amountCents: obj?.amount_cents !== undefined ? Number(obj.amount_cents) : undefined,
        paymobOrderId: obj?.order?.id !== undefined ? Number(obj.order.id) : undefined,
        merchantOrderId: obj?.order?.merchant_order_id ? String(obj.order.merchant_order_id) : undefined,
    };
};

/** Refund (or void if unsettled) a captured transaction. amountCents optional = full. */
export const refundTransaction = async (transactionId: number | string, amountCents?: number): Promise<any> => {
    const config = await getPaymobConfigRaw();
    if (!config.enabled) throw Object.assign(new Error('PAYMOB_DISABLED'), { status: 503 });
    if (!config.apiKey) throw Object.assign(new Error('PAYMOB_NOT_CONFIGURED'), { status: 400 });
    const token = await requestAuthToken(config);
    const body: Record<string, any> = { transaction_id: transactionId };
    if (amountCents !== undefined) body.amount_cents = amountCents;
    const res = await fetch(`${baseOf(config)}/acceptance/void_refund/refund?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
        log.warn({ status: res.status }, 'Paymob refund failed');
        throw Object.assign(new Error('PAYMOB_REFUND_FAILED'), { status: res.status || 500, details: data });
    }
    return data;
};
