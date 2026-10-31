import { describe, expect, it } from 'vitest';
import { buildPublicMenuItem } from '../server/utils/publicApiMenuPolicy';

describe('public API menu contract', () => {
    it('uses branch/channel pricing without leaking internal cost or platform data', () => {
        const item = buildPublicMenuItem({
            id: 'item-1', categoryId: 'cat-1', name: 'Burger', nameAr: 'برجر', price: 100, cost: 40,
            branchPricing: [{ branchId: 'branch-1', channel: 'DELIVERY', price: 125 }],
            platformPricing: [{ platformId: 'talabat', price: 140 }],
            sizes: [], modifierGroups: [],
        }, 'branch-1', 'delivery');
        expect(item).toMatchObject({ id: 'item-1', categoryId: 'cat-1', price: 125 });
        expect(item).not.toHaveProperty('cost');
        expect(item).not.toHaveProperty('branchPricing');
        expect(item).not.toHaveProperty('platformPricing');
    });

    it('falls back to the base price when no branch override exists', () => {
        expect(buildPublicMenuItem({ id: 'item-2', categoryId: 'cat-1', price: 80 }, 'branch-2', 'TAKEAWAY').price).toBe(80);
    });
});
