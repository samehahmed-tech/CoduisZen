import { describe, expect, it } from 'vitest';
import { prepareInventoryExcelRows } from '../services/inventoryExcelRows';

describe('inventory Excel import validation', () => {
    it('keeps valid new items and skips duplicate or incomplete rows', () => {
        const result = prepareInventoryExcelRows([
            { code: 'NEW-1', name_en: 'Flour', name_ar: 'دقيق', warehouse_id: 'wh-1', opening_quantity: 10 },
            { code: 'OLD-1', name_en: 'Old', name_ar: 'قديم' },
            { code: '', name_en: '', name_ar: '' },
        ], ['OLD-1'], ['wh-1']);

        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0]).toMatchObject({ sku: 'NEW-1', warehouseId: 'wh-1', quantity: 10 });
        expect(result.skipped).toBe(2);
    });

    it('rejects opening stock assigned to an unknown warehouse before importing', () => {
        expect(() => prepareInventoryExcelRows([
            { code: 'NEW-1', name_en: 'Flour', name_ar: 'دقيق', warehouse_id: 'missing', opening_quantity: 10 },
        ], [], ['wh-1'])).toThrow('INVALID_WAREHOUSE:2');
    });
});
