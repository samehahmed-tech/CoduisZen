import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('analytics channel performance contract', () => {
    it('exposes branch/date-scoped channel metrics with cancelled-order separation', () => {
        const routes = readFileSync(resolve(process.cwd(), 'server/routes/analyticsRoutes.ts'), 'utf8');
        const controller = readFileSync(resolve(process.cwd(), 'server/controllers/analyticsController.ts'), 'utf8');
        expect(routes).toContain("router.get('/channel-performance', analyticsController.getChannelPerformance)");
        expect(controller).toContain('export const getChannelPerformance');
        expect(controller).toContain('req.effectiveBranchId || (req.query.branchId');
        expect(controller).toContain('resolveBusinessDateRange(req.query.businessDateFrom, req.query.businessDateTo)');
        expect(controller).toContain("if (String(order.status || '').toUpperCase() === 'CANCELLED')");
        expect(controller).toContain('avgTicket');
    });
});
