import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
vi.mock('../server/db', () => ({ db: {} }));
import {
    buildIframeUrl,
    isPaymobCallbackFresh,
    toCents,
    verifyPaymobHmac,
} from '../server/modules/payments/paymobService';

// Documented HMAC field order (Transaction Processed Callback)
const ORDER = ['amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction', 'id', 'integration_id', 'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded', 'is_standalone_payment', 'is_voided', 'order.id', 'owner', 'pending', 'source_data.pan', 'source_data.sub_type', 'source_data.type', 'success'];

const get = (obj: any, path: string): string => {
    if (path === 'order.id') return String(obj?.order?.id ?? '');
    if (path.startsWith('source_data.')) return String(obj?.source_data?.[path.slice(12)] ?? '');
    return String(obj?.[path] ?? '');
};

describe('paymob', () => {
    it('converts pounds to cents', () => {
        expect(toCents(115)).toBe(11500);
        expect(toCents(99.99)).toBe(9999);
        expect(toCents(0)).toBe(0);
    });

    it('builds iframe url', () => {
        expect(buildIframeUrl('https://accept.paymob.com/api', '123', 'key-9')).toBe(
            'https://accept.paymob.com/api/acceptance/iframes/123?payment_token=key-9',
        );
    });

    it('verifies HMAC computed with documented field order', () => {
        const secret = 'hmac-secret';
        const obj: any = {
            amount_cents: 11500, created_at: '2024-01-01T00:00:00Z', currency: 'EGP', error_occured: false,
            has_parent_transaction: false, id: 1, integration_id: 2, is_3d_secure: true, is_auth: false,
            is_capture: false, is_refunded: false, is_standalone_payment: true, is_voided: false,
            order: { id: 77 }, owner: 5, pending: false,
            source_data: { pan: '2346', sub_type: 'Mastercard', type: 'card' }, success: true,
        };
        const concatenated = ORDER.map((k) => get(obj, k)).join('');
        obj.hmac = crypto.createHmac('sha512', secret).update(concatenated).digest('hex');
        expect(verifyPaymobHmac(obj, secret)).toBe(true);
        expect(verifyPaymobHmac({ ...obj, success: false }, secret)).toBe(false);
        expect(verifyPaymobHmac(obj, 'wrong')).toBe(false);
        expect(verifyPaymobHmac({}, secret)).toBe(false);
    });

    it('accepts only callbacks inside the freshness window', () => {
        const now = Date.parse('2026-10-26T12:00:00Z');
        expect(isPaymobCallbackFresh({ created_at: '2026-10-26T11:59:00Z' }, now)).toBe(true);
        expect(isPaymobCallbackFresh({ created_at: '2026-10-26T11:00:00Z' }, now)).toBe(false);
        expect(isPaymobCallbackFresh({ created_at: '2026-10-26T12:10:00Z' }, now)).toBe(false);
        expect(isPaymobCallbackFresh({}, now)).toBe(false);
    });
});
