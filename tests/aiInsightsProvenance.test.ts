import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('AI insights provenance contract', () => {
    it('returns branch, period, source, metrics and freshness metadata', () => {
        const source = readFileSync(resolve(process.cwd(), 'server/controllers/aiController.ts'), 'utf8');
        expect(source).toContain("source: 'ORDERS_TOTAL_7_BUSINESS_DAYS'");
        expect(source).toContain('dataFreshnessHours');
        expect(source).toContain('branchId: branchId || null');
        expect(source).toContain('metrics: { totalRevenue, orderCount, avgTicket }');
        expect(source).toContain('if (!recentOrders.length)');
        expect(source).toContain('no AI conclusion was generated');
    });
});
