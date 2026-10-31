import { describe, expect, it } from 'vitest';
import { parseLocalDateRange, resolveScopedBranchId } from '../server/controllers/report/reportUtils';

describe('report scope and date policy', () => {
    it('rejects invalid or inverted report date ranges', () => {
        expect(() => parseLocalDateRange('2026-02-30', '2026-03-01')).toThrow('INVALID_DATE_RANGE');
        expect(() => parseLocalDateRange('2026-03-02', '2026-03-01')).toThrow('INVALID_DATE_RANGE');
    });

    it('prefers the middleware-resolved branch and supports allowed branch lists', () => {
        const req: any = { user: { role: 'MANAGER', branchId: 'b1', allowedBranches: ['b2'] }, effectiveBranchId: 'b2' };
        expect(resolveScopedBranchId(req, 'b2')).toBe('b2');
        expect(() => resolveScopedBranchId(req, 'b3')).toThrow('FORBIDDEN_BRANCH_SCOPE');
    });
});
