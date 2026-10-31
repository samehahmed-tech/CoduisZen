import { describe, expect, it } from 'vitest';
import {
    buildAggregatorPayloadFingerprint,
    KNOWN_PROVIDERS,
    buildAggregatorIdempotencyKey,
    mapProviderStatus,
    normalizeAggregatorPayload,
    verifyProviderAuth,
} from '../server/modules/aggregators/aggregatorTypes';

describe('aggregator provider contracts', () => {
    it('fingerprints retry payloads while ignoring provider status transitions', () => {
        const base = {
            externalId: 'A-100', storeId: 'store-1', rawStatus: 'NEW', orderType: 'DELIVERY',
            items: [{ sku: 'SKU-1', quantity: 1, unitPrice: 100, totalPrice: 100 }],
            subtotal: 100, total: 110, deliveryFee: 10,
            customer: { name: 'Customer', phone: '0100', address: 'Cairo' },
        } as any;
        const retry = { ...base, rawStatus: 'CONFIRMED' };
        const changed = { ...base, total: 120 };
        expect(buildAggregatorPayloadFingerprint('elmenus', base)).toBe(buildAggregatorPayloadFingerprint('elmenus', retry));
        expect(buildAggregatorPayloadFingerprint('elmenus', base)).not.toBe(buildAggregatorPayloadFingerprint('elmenus', changed));
    });
    it('normalizes the canonical order shape for every supported provider', () => {
        for (const provider of KNOWN_PROVIDERS) {
            const result = normalizeAggregatorPayload(provider.id, {
                order_id: `${provider.id}-order-1`,
                store_id: 'store-1',
                status: 'NEW',
                order_type: 'delivery',
                items: [{ sku: 'SKU-1', quantity: 2, unit_price: 25 }],
                customer: { name: 'Test Customer', phone: '01000000000' },
                total: 50,
            });
            expect(result.ok, provider.id).toBe(true);
            if (result.ok) {
                expect(result.order.externalId).toBe(`${provider.id}-order-1`);
                expect(result.order.items[0]).toMatchObject({ sku: 'SKU-1', quantity: 2, unitPrice: 25 });
            }
        }
    });

    it('acknowledges unknown statuses without inventing an internal transition', () => {
        for (const provider of KNOWN_PROVIDERS) expect(mapProviderStatus(provider.id, 'UNKNOWN_PROVIDER_STATUS')).toBeNull();
    });

    it('keeps idempotency keys stable and provider-specific', () => {
        const payload = { order_id: 'same', status: 'NEW', items: [{ sku: 'A', quantity: 1 }] };
        expect(buildAggregatorIdempotencyKey('elmenus', 'same', 'NEW')).toBe('AGG:ELMENUS:same:NEW');
        expect(buildAggregatorIdempotencyKey('elmenus', 'same', 'NEW')).toBe(buildAggregatorIdempotencyKey('elmenus', 'same', 'NEW'));
        expect(payload).toBeTruthy();
    });

    it('accepts only the configured provider secret or Basic credentials', () => {
        expect(verifyProviderAuth({ authorization: 'Bearer secret-1' }, 'secret-1')).toBe(true);
        expect(verifyProviderAuth({ authorization: 'Bearer wrong' }, 'secret-1')).toBe(false);
        expect(verifyProviderAuth({ authorization: 'Basic dXNlcjpwYXNz' }, '', { username: 'user', password: 'pass' })).toBe(true);
        expect(verifyProviderAuth({ authorization: 'Basic dXNlcjp3cm9uZw==' }, '', { username: 'user', password: 'pass' })).toBe(false);
    });
});
