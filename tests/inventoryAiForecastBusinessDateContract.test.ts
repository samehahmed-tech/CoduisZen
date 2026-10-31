import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('inventory forecast business-date contract', () => {
    it('uses the order business date when stock consumption references an order', () => {
        const source = readFileSync(resolve(process.cwd(), 'server/services/inventoryIntelligence.ts'), 'utf8');
        expect(source).toContain('leftJoin(orders, eq(stockMovements.referenceId, orders.id))');
        expect(source).toContain('COALESCE(${orders.businessDate}, CAST(${stockMovements.createdAt} AS DATE))');
        expect(source).toContain("dateBasis: 'ORDER_BUSINESS_DATE_WITH_MOVEMENT_FALLBACK'");
    });
});
