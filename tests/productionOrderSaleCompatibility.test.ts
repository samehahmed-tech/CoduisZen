import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('automatic production order compatibility', () => {
    it('writes the legacy required quantity column when auto-producing for a sale', () => {
        const source = fs.readFileSync('server/services/inventoryService.ts', 'utf8');
        const insertStart = source.indexOf('await tx.insert(productionOrders).values({');
        const insertEnd = source.indexOf('});', insertStart);
        const insertBlock = source.slice(insertStart, insertEnd);

        expect(insertStart).toBeGreaterThan(-1);
        expect(insertBlock).toContain('quantity: outputQty');
    });

    it('keeps the production table bootstrap compatible with legacy quantity columns', () => {
        const source = fs.readFileSync('server/controllers/productionController.ts', 'utf8');
        expect(source).toContain("COL_LENGTH('dbo.production_orders', 'quantity') IS NULL");
        expect(source).toContain('ADD quantity real');
        expect(source).toContain('ALTER TABLE dbo.production_orders ALTER COLUMN quantity real NOT NULL');
    });

    it('executes pending production during sale consumption and claims it once', () => {
        const source = fs.readFileSync('server/services/inventoryService.ts', 'utf8');
        expect(source).toContain('completePlannedProductionForSale');
        expect(source).toContain("sql`${productionOrders.status} IN ('PLANNED', 'PENDING')`");
        expect(source).toContain("set({ status: 'IN_PROGRESS', startedAt, updatedAt: startedAt })");
        expect(source).toContain("set({ status: 'COMPLETED', actualYield: quantityProduced");
        expect(source).toContain('const plannedProduction = await this.completePlannedProductionForSale');
    });

    it('creates manual production orders with a non-null quantity', () => {
        const source = fs.readFileSync('server/controllers/productionController.ts', 'utf8');
        expect(source).toContain('quantity: qty');
    });
});
