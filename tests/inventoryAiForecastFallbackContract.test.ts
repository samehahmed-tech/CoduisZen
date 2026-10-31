import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('inventory AI forecast fallback contract', () => {
    it('keeps forecast usable with an explicit degraded status when AI is unavailable', () => {
        const source = readFileSync(resolve(process.cwd(), 'server/services/inventoryIntelligence.ts'), 'utf8');
        expect(source).toContain("aiStatus: 'GENERATED' | 'DEGRADED_FALLBACK' | 'INSUFFICIENT_DATA'");
        expect(source).toContain("aiStatus = 'DEGRADED_FALLBACK'");
        expect(source).toContain('averageDailyUsage');
        expect(source).toContain("console.warn('[AI] Inventory forecast provider unavailable; deterministic consumption fallback used.')");
        expect(source).toContain('forecast_${branchId || \'global\'}_${itemId}_${dataAsOf || \'none\'}');
    });
});
