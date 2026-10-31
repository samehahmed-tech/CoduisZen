import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('consolidated analytics contract', () => {
    it('exposes a server-side consolidated report with provenance', () => {
        const controller = fs.readFileSync('server/controllers/analyticsController.ts', 'utf8');
        const routes = fs.readFileSync('server/routes/analyticsRoutes.ts', 'utf8');
        expect(routes).toContain("router.get('/consolidated', requirePermission('DATA_VIEW_REVENUE'), analyticsController.getConsolidatedPerformance);");
        expect(controller).toContain('resolveConsolidatedReportScope');
        expect(controller).toContain("entity: 'orders'");
        expect(controller).toContain("dateField: 'businessDate'");
        expect(controller).toContain('cancelledExcluded: true');
    });
});
