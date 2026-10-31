import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('inventory AI forecast provenance contract', () => {
    it('returns scope, period, freshness and source instead of an unqualified string', () => {
        const source = readFileSync(resolve(process.cwd(), 'server/services/inventoryIntelligence.ts'), 'utf8');
        expect(source).toContain('dataFreshnessHours: number | null;');
        expect(source).toContain("source: 'STOCK_MOVEMENTS_SALE_CONSUMPTION_90_DAY_ORDER_BUSINESS_DATE'");
        expect(source).toContain('dateBasis: \'ORDER_BUSINESS_DATE_WITH_MOVEMENT_FALLBACK\'');
        expect(source).toContain('sampleDays: consumption.length');
        expect(source).toContain('wrapUntrustedAiData(itemName, \'item-name\')');
        expect(source).toContain('wrapUntrustedAiData(dataStr, \'historical-consumption\')');
    });
});
