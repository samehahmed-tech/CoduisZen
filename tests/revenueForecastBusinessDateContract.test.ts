import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('revenue forecast semantic date contract', () => {
    it('uses canonical business dates and excludes cancelled orders', () => {
        const source = readFileSync(resolve(process.cwd(), 'server/services/revenueForecastService.ts'), 'utf8');
        expect(source).toContain('resolveBusinessDateRange(fromDate.toISOString().slice(0, 10), now.toISOString().slice(0, 10))');
        expect(source).toContain('date: orders.businessDate');
        expect(source).toContain('gte(orders.businessDate, dateRange.from)');
        expect(source).toContain('lte(orders.businessDate, dateRange.to)');
        expect(source).toContain("NOT IN ('CANCELLED')");
        expect(source).toContain('businessDateFrom: dateRange.from');
    });
});
