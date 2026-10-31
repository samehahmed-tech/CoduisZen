import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const controller = readFileSync(fileURLToPath(new URL('../server/controllers/aiController.ts', import.meta.url)), 'utf8');
const routes = readFileSync(fileURLToPath(new URL('../server/routes/aiRoutes.ts', import.meta.url)), 'utf8');

describe('AI branch scope contract', () => {
    it('scopes AI insight and forecast reads through the server-resolved branch', () => {
        expect(routes).toContain("import { scopeBranchQuery } from '../middleware/branchIsolation'");
        expect(routes).toContain("router.get('/insights', aiOperationalRoles, scopeBranchQuery, getInsights)");
        expect(routes).toContain("router.get('/forecast', aiOperationalRoles, scopeBranchQuery, getRevenueForecast)");
        expect(controller).toContain('req.effectiveBranchId || (req.query.branchId as string | undefined)');
        expect(controller).toContain('branchId ? eq(orders.branchId, branchId) : undefined');
    });
});
