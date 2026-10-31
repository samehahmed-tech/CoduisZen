import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('analytics reconciliation route contract', () => {
    it('exposes a branch/date-scoped read-only reconciliation job', () => {
        const routes = readFileSync(resolve(process.cwd(), 'server/routes/analyticsRoutes.ts'), 'utf8');
        const controller = readFileSync(resolve(process.cwd(), 'server/controllers/analyticsController.ts'), 'utf8');
        const service = readFileSync(resolve(process.cwd(), 'server/services/analyticsService.ts'), 'utf8');
        expect(routes).toContain("router.get('/reconciliation', analyticsController.getAnalyticsReconciliation)");
        expect(controller).toContain('export const getAnalyticsReconciliation');
        expect(controller).toContain('req.effectiveBranchId');
        expect(controller).toContain('resolveBusinessDateRange(req.query.businessDateFrom, req.query.businessDateTo)');
        expect(service).toContain('async reconcileBranchSnapshots(branchId: string, fromDate: string, toDate: string)');
        expect(service).toContain('reconcileDailyBranchSnapshots(expected, actual)');
        expect(service).toContain('status: mismatches.length === 0 ? \'MATCH\' : \'MISMATCH\'');
    });
});
