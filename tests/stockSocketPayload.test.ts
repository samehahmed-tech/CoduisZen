import { describe, expect, it } from 'vitest';

import { applyAbsoluteStockQuantity } from '../services/stockSocket';
import { InventoryItem, InventoryUnit } from '../types';

const item = {
    id: 'item-1',
    name: 'Flour',
    nameAr: 'دقيق',
    unit: InventoryUnit.KG,
    category: 'Raw',
    costPrice: 2,
    purchasePrice: 2,
    threshold: 1,
    isAudited: true,
    auditFrequency: 'DAILY',
    isComposite: false,
    bom: [],
    warehouseQuantities: [{ warehouseId: 'warehouse-1', quantity: 10 }],
} as InventoryItem;

describe('stock socket payload contract', () => {
    it('treats quantity as the absolute warehouse balance, not a delta', () => {
        const patched = applyAbsoluteStockQuantity([item], item.id, 'warehouse-1', 3);

        expect(patched[0].warehouseQuantities[0].quantity).toBe(3);
    });

    it('ignores invalid balances and adds a missing warehouse with the absolute balance', () => {
        const inventory = [item];
        expect(applyAbsoluteStockQuantity(inventory, item.id, 'warehouse-1', Number.NaN)).toBe(inventory);
        expect(applyAbsoluteStockQuantity(inventory, item.id, 'warehouse-1', -1)).toBe(inventory);

        const patched = applyAbsoluteStockQuantity(inventory, item.id, 'warehouse-2', 4);
        expect(patched[0].warehouseQuantities).toContainEqual({ warehouseId: 'warehouse-2', quantity: 4 });
    });
});
