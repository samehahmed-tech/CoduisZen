import { describe, it, expect } from 'vitest';
import {
    KNOWN_PROVIDERS,
    buildAggregatorIdempotencyKey,
    mapProviderStatus,
    normalizeAggregatorPayload,
    resolveAggregatorBranch,
    verifyProviderAuth,
} from '../server/modules/aggregators/aggregatorTypes';

describe('aggregators', () => {
    it('pre-registers elmenus/mrsool/fast/generic', () => {
        expect(KNOWN_PROVIDERS.map((p) => p.id)).toEqual(['elmenus', 'mrsool', 'fast', 'generic']);
    });

    it('maps provider statuses to internal', () => {
        expect(mapProviderStatus('elmenus', 'CONFIRMED')).toBe('PREPARING');
        expect(mapProviderStatus('elmenus', 'CANCELLED')).toBe('CANCELLED');
        expect(mapProviderStatus('mrsool', 'PICKED_UP')).toBe('OUT_FOR_DELIVERY');
        expect(mapProviderStatus('generic', 'RECEIVED')).toBe('PENDING');
        expect(mapProviderStatus('elmenus', 'WEIRD_STATUS')).toBeNull();
        expect(mapProviderStatus('unknown', 'RECEIVED')).toBeNull();
    });

    it('normalizes varied payload shapes', () => {
        const r = normalizeAggregatorPayload('elmenus', {
            order_id: 'E1', store_id: 'S1', status: 'NEW',
            items: [{ sku: 'A', quantity: 2, unit_price: 30 }],
            total: 60, customer: { name: 'Omar', phone: '0100' },
        } as any);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const n = r.order;
        expect(n.externalId).toBe('E1');
        expect(n.items).toEqual([{ sku: 'A', name: undefined, quantity: 2, unitPrice: 30, totalPrice: undefined }]);
        expect(n.customer).toMatchObject({ name: 'Omar', phone: '0100' });
    });

    it('rejects payload without external id', () => {
        expect(normalizeAggregatorPayload('mrsool', { status: 'NEW' } as any).ok).toBe(false);
    });

    it('resolves branch via map then default', () => {
        expect(resolveAggregatorBranch({ storeBranchMap: { S1: 'B1' }, defaultBranchId: 'B9' }, 'S1')).toBe('B1');
        expect(resolveAggregatorBranch({ storeBranchMap: {}, defaultBranchId: 'B9' }, 'SX')).toBe('B9');
        expect(resolveAggregatorBranch({}, 'SX')).toBeNull();
    });

    it('builds scoped idempotency keys', () => {
        expect(buildAggregatorIdempotencyKey('elmenus', 'E1', 'NEW')).toBe('AGG:ELMENUS:E1:NEW');
    });

    it('verifies shared secret or basic', () => {
        expect(verifyProviderAuth({ authorization: 'Bearer s3' }, 's3', undefined)).toBe(true);
        expect(verifyProviderAuth({ authorization: 'nope' }, 's3', undefined)).toBe(false);
        expect(verifyProviderAuth({}, '', undefined)).toBe(false);
    });
});
