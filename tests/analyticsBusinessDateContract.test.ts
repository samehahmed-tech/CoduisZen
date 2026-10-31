import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('analytics business-date contract', () => {
    it('uses the server-resolved branch and order business date range', () => {
        const source = readFileSync(resolve(process.cwd(), 'server/controllers/analyticsController.ts'), 'utf8');
        expect(source).toContain('resolveBusinessDateRange(req.query.businessDateFrom, req.query.businessDateTo)');
        expect(source).toContain('const effectiveBranchId = req.effectiveBranchId;');
        expect(source).toContain('gte(orders.businessDate, dateRange.from)');
        expect(source).toContain('lte(orders.businessDate, dateRange.to)');
        expect(source).not.toContain('const branchFilterId = req.query.branchId');
    });
});
