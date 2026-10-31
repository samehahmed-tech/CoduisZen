import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('analytics anomaly route contract', () => {
    it('is branch-scoped and uses auditable sources', () => {
        const routes = readFileSync(resolve(process.cwd(), 'server/routes/analyticsRoutes.ts'), 'utf8');
        const controller = readFileSync(resolve(process.cwd(), 'server/controllers/analyticsController.ts'), 'utf8');
        expect(routes).toContain("router.get('/anomalies', analyticsController.getOperationalAnomalies)");
        expect(routes).toContain('router.use(scopeBranchQuery)');
        expect(controller).toContain('req.effectiveBranchId');
        expect(controller).toContain("'audit_logs.event_type'");
        expect(controller).toContain("'refund_records.amount'");
        expect(controller).toContain("'day_close_reports.variance'");
    });
});
