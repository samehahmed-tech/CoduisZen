import { describe, expect, it } from 'vitest';
import {
    applyPlatformMarkup,
    detectQuoteDrift,
    normalizeChannel,
    resolveBranchPrice,
    resolvePlatformOverride,
} from '../server/services/pricingService';

describe('unified pricing model', () => {
    it('prefers the exact branch+channel entry', () => {
        const list = [
            { branchId: 'b1', price: 100 },
            { branchId: 'b1', channel: 'DELIVERY', price: 120 },
            { branchId: 'b1', channel: 'TAKEAWAY', price: 90 },
        ];
        expect(resolveBranchPrice(list, 'b1', 'DELIVERY')).toEqual({ price: 120, source: 'BRANCH:DELIVERY' });
        expect(resolveBranchPrice(list, 'b1', 'TAKEAWAY')).toEqual({ price: 90, source: 'BRANCH:TAKEAWAY' });
        expect(resolveBranchPrice(list, 'b1', 'DINE_IN')).toEqual({ price: 100, source: 'BRANCH:ALL' });
        expect(resolveBranchPrice(list, 'b1')).toEqual({ price: 100, source: 'BRANCH:ALL' });
    });

    it('falls back to base when nothing matches', () => {
        expect(resolveBranchPrice([], 'b1', 'DELIVERY')).toEqual({ price: 0, source: 'BASE' });
        expect(resolveBranchPrice([{ branchId: 'b2', price: 50 }], 'b1', 'DELIVERY')).toEqual({ price: 0, source: 'BASE' });
        expect(resolveBranchPrice('not-json', 'b1')).toEqual({ price: 0, source: 'BASE' });
    });

    it('parses JSON strings and branch_id aliases', () => {
        const raw = JSON.stringify([{ branch_id: 'b1', channel: 'delivery', price: 77 }]);
        expect(resolveBranchPrice(raw, 'b1', 'DELIVERY')).toEqual({ price: 77, source: 'BRANCH:DELIVERY' });
    });

    it('normalizes channel aliases', () => {
        expect(normalizeChannel('pickup')).toBe('TAKEAWAY');
        expect(normalizeChannel('call_center')).toBe('DELIVERY');
        expect(normalizeChannel('dine-in')).toBe('DINE_IN');
        expect(normalizeChannel('whatever')).toBeUndefined();
    });

    it('resolves platform fixed overrides', () => {
        const list = [{ platformId: 'Talabat', price: 150 }];
        expect(resolvePlatformOverride(list, 'talabat')).toBe(150);
        expect(resolvePlatformOverride(list, 'other')).toBe(0);
    });

    it('applies platform markup', () => {
        expect(applyPlatformMarkup(100, 20, 5)).toBe(125);
    });

    it('detects quote drift beyond tolerance', () => {
        expect(detectQuoteDrift({ subtotal: 100, total: 114 }, { subtotal: 100, total: 114 }).drifted).toBe(false);
        expect(detectQuoteDrift({ subtotal: 100, total: 114 }, { subtotal: 120, total: 136.8 }).drifted).toBe(true);
    });
});
