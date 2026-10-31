import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const controller = readFileSync(fileURLToPath(new URL('../server/controllers/report/advancedCrmReports.ts', import.meta.url)), 'utf8');
const routes = readFileSync(fileURLToPath(new URL('../server/routes/reportRoutes.ts', import.meta.url)), 'utf8');

describe('customer RFM refresh contract', () => {
    it('refreshes a bounded branch-scoped audience with signed audit', () => {
        expect(controller).toContain('export const refreshCustomerRfm');
        expect(controller).toContain('Math.min(Math.max(Number(req.body?.limit ?? req.query.limit) || 250, 1), 1000)');
        expect(controller).toContain('req.effectiveBranchId');
        expect(controller).toContain('analyticsService.updateCustomerRfm');
        expect(controller).toContain("eventType: 'CUSTOMER_RFM_REFRESHED'");
        expect(routes).toContain("router.post('/customer-rfm/refresh'");
        expect(routes).toContain("'OP_MANAGE_MARKETING'");
    });
});
