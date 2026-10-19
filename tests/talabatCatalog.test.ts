import { describe, it, expect } from 'vitest';
import {
    buildCatalogUpdates,
    buildVendorUpdatesFromMenu,
    isCatalogJobTerminal,
} from '../server/modules/talabat/talabatCatalogService';

describe('talabat catalog', () => {
    it('requires sku plus at least one of price/active/quantity', () => {
        expect(buildCatalogUpdates([{ sku: 'A' } as any])).toEqual({ ok: false, code: 'CATALOG_FIELD_REQUIRED' });
        expect(buildCatalogUpdates([{ sku: '', price: 10 } as any])).toEqual({ ok: false, code: 'CATALOG_SKU_REQUIRED' });
        const good = buildCatalogUpdates([{ sku: ' A ', price: 10, active: true }]);
        expect(good.ok).toBe(true);
        if (good.ok) expect(good.products).toEqual([{ sku: 'A', price: 10, active: true }]);
    });

    it('rejects non-positive price', () => {
        expect(buildCatalogUpdates([{ sku: 'A', price: 0 }])).toEqual({ ok: false, code: 'CATALOG_PRICE_INVALID' });
        expect(buildCatalogUpdates([{ sku: 'A', price: -5 }])).toEqual({ ok: false, code: 'CATALOG_PRICE_INVALID' });
    });

    it('builds vendor updates from menu rows (platform override wins, unavailable deactivates)', () => {
        const rows = buildVendorUpdatesFromMenu([
            { sku: 'A', price: 100, isAvailable: true, deletedAt: null, platformPricing: [{ platformId: 'talabat', price: 115 }] },
            { sku: 'B', price: 50, isAvailable: false, deletedAt: null, platformPricing: [] },
            { sku: '', price: 10, isAvailable: true, deletedAt: null, platformPricing: [] },
        ] as any);
        expect(rows).toEqual([
            { sku: 'A', price: 115, active: true },
            { sku: 'B', price: 50, active: false },
        ]);
    });

    it('detects terminal job statuses', () => {
        expect(isCatalogJobTerminal('COMPLETED')).toBe(true);
        expect(isCatalogJobTerminal('FAILED')).toBe(true);
        expect(isCatalogJobTerminal('QUEUED')).toBe(false);
        expect(isCatalogJobTerminal('IN_PROGRESS')).toBe(false);
    });
});
