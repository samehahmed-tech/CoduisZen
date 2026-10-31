import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('AI insights semantic date contract', () => {
    it('uses businessDate and exposes the exact reporting window', () => {
        const source = readFileSync(resolve(process.cwd(), 'server/controllers/aiController.ts'), 'utf8');
        expect(source).toContain('resolveBusinessDateRange(fromDate.toISOString().slice(0, 10), now.toISOString().slice(0, 10))');
        expect(source).toContain('gte(orders.businessDate, dateRange.from)');
        expect(source).toContain('lte(orders.businessDate, dateRange.to)');
        expect(source).toContain('businessDateFrom: dateRange.from');
        expect(source).toContain("source: 'ORDERS_TOTAL_7_BUSINESS_DAYS'");
    });
});
