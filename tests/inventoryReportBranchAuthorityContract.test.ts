import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('inventory report branch authority contract', () => {
    it('uses effectiveBranchId for movement, reorder and expiry reports', () => {
        const source = readFileSync(resolve(process.cwd(), 'server/controllers/report/inventoryReports.ts'), 'utf8');
        expect(source).toContain('const branchId = req.effectiveBranchId || (req.query.branchId ? String(req.query.branchId) : undefined);');
        expect(source).toContain("req.effectiveBranchId || (typeof req.query.branchId === 'string' ? req.query.branchId.trim() : '')");
        expect(source).not.toContain('const { startDate, endDate, branchId } = req.query;');
    });
});
