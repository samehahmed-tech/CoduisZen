import { describe, expect, it } from 'vitest';

import { stockUpdateSchema } from '../server/middleware/validation';
import { getStockAdjustmentPreview, parseStockAdjustmentQuantity } from '../services/stockAdjustment';

describe('stock adjustment validation and preview', () => {
    it('rejects empty, negative, NaN, and infinite quantities', () => {
        expect(parseStockAdjustmentQuantity('')).toBeNull();
        expect(parseStockAdjustmentQuantity(-1)).toBeNull();
        expect(parseStockAdjustmentQuantity(Number.NaN)).toBeNull();
        expect(parseStockAdjustmentQuantity(Number.POSITIVE_INFINITY)).toBeNull();

        const payload = {
            item_id: 'item-1',
            warehouse_id: 'warehouse-1',
            type: 'ADJUSTMENT' as const,
        };
        expect(stockUpdateSchema.safeParse({ ...payload, quantity: Number.POSITIVE_INFINITY }).success).toBe(false);
    });

    it('previews the resulting quantity and delta before saving', () => {
        expect(getStockAdjustmentPreview(12.5, '9')).toEqual({
            currentQuantity: 12.5,
            newQuantity: 9,
            delta: -3.5,
            isValid: true,
        });
    });
});
