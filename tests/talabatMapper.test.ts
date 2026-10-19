import { describe, it, expect } from 'vitest';
import {
    mapTalabatStatus,
    mapTalabatOrderType,
    buildTalabatIdempotencyKey,
    validateTalabatPayload,
    normalizeTalabatItems,
    verifyTalabatWebhookAuth,
    getStoreId,
    getExternalConfigId,
    getTotals,
    getCustomer,
} from '../server/modules/talabat/talabatMapper';

describe('talabat mapper', () => {
    it('maps lifecycle statuses to internal statuses', () => {
        expect(mapTalabatStatus('RECEIVED')).toBe('PENDING');
        expect(mapTalabatStatus('READY_FOR_PICKUP')).toBe('READY');
        expect(mapTalabatStatus('DISPATCHED')).toBe('OUT_FOR_DELIVERY');
        expect(mapTalabatStatus('CANCELLED')).toBe('CANCELLED');
        expect(mapTalabatStatus('UPDATE_CART')).toBeNull();
    });

    it('maps order types DELIVERY/PICKUP', () => {
        expect(mapTalabatOrderType('DELIVERY')).toBe('DELIVERY');
        expect(mapTalabatOrderType('PICKUP')).toBe('TAKEAWAY');
    });

    it('builds stable idempotency key per order+status', () => {
        expect(buildTalabatIdempotencyKey('oid-1', 'RECEIVED')).toBe('TALABAT_ORDER:oid-1:RECEIVED');
        expect(buildTalabatIdempotencyKey('oid-1', 'RECEIVED')).toBe(buildTalabatIdempotencyKey('oid-1', 'RECEIVED'));
    });

    it('rejects payload missing order_id/status/store', () => {
        const r = validateTalabatPayload({ status: 'RECEIVED' } as any);
        expect(r.ok).toBe(false);
        const ok = validateTalabatPayload({ order_id: 'a', status: 'RECEIVED', store_id: 's1' } as any);
        expect(ok.ok).toBe(true);
    });

    it('accepts real nested shape (client.store_id, payment.*, customer.*)', () => {
        const nested: any = {
            order_id: 'oid-9',
            status: 'RECEIVED',
            client: { store_id: 'nbet', external_partner_config_id: 'EXT1', chain_id: 'ch1' },
            payment: { sub_total: 100, order_total: 115, delivery_fee: 15 },
            customer: { first_name: 'Ahmed', last_name: 'Ali', phone_number: '+20100', delivery_address: { formattedAddress: 'Cairo', latitude: 30.0, longitude: 31.0, instructions: '3rd floor' } },
            items: [],
        };
        expect(validateTalabatPayload(nested).ok).toBe(true);
        expect(getStoreId(nested)).toBe('nbet');
        expect(getExternalConfigId(nested)).toBe('EXT1');
        expect(getTotals(nested)).toEqual({ subTotal: 100, orderTotal: 115, deliveryFee: 15 });
        expect(getCustomer(nested)).toMatchObject({ name: 'Ahmed Ali', phone: '+20100', address: 'Cairo' });
    });

    it('normalizes UNIT and KG items', () => {
        const items = normalizeTalabatItems([
            { sku: ' 222316 ', pricing: { pricing_type: 'UNIT', quantity: 2, unit_price: 85 }, status: 'IN_CART' },
            { sku: 'W1', pricing: { pricing_type: 'KG', weight: 1.5 }, status: 'IN_CART' },
        ] as any);
        expect(items[0].sku).toBe('222316');
        expect(items[0].quantity).toBe(2);
        expect(items[0].unitPrice).toBe(85);
        expect(items[1].weight).toBe(1.5);
    });

    it('verifies webhook secret or basic auth', () => {
        expect(verifyTalabatWebhookAuth({ authorization: 'Bearer s3cr3t' }, 's3cr3t')).toBe(true);
        const basic = `Basic ${Buffer.from('partner:randompassword').toString('base64')}`;
        expect(verifyTalabatWebhookAuth({ authorization: basic }, '', { username: 'partner', password: 'randompassword' })).toBe(true);
        expect(verifyTalabatWebhookAuth({ authorization: 'Bearer wrong' }, 's3cr3t')).toBe(false);
    });
});
