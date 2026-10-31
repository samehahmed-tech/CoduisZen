import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('inventory purchase estimate contract', () => {
    it('derives estimated purchase cost from item cost price and exposes its source', () => {
        const source = readFileSync(resolve(process.cwd(), 'server/services/inventoryIntelligence.ts'), 'utf8');
        expect(source).toContain('costPrice: number;');
        expect(source).toContain("estimatedCostSource: 'ITEM_COST_PRICE' | 'UNAVAILABLE';");
        expect(source).toContain('alert.reorderQty * alert.costPrice');
        expect(source).toContain("'ITEM_COST_PRICE' : 'UNAVAILABLE'");
        expect(source).toContain('explanation: reason');
        expect(source).not.toContain('estimatedCost: 0, // Could be calculated from PO history');
    });
});
