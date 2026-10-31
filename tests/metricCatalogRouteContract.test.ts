import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('metric catalog route contract', () => {
    it('exposes the canonical catalog under the branch-scoped analytics router', () => {
        const routes = readFileSync(resolve(process.cwd(), 'server/routes/analyticsRoutes.ts'), 'utf8');
        const controller = readFileSync(resolve(process.cwd(), 'server/controllers/analyticsController.ts'), 'utf8');
        expect(routes).toContain("router.get('/metrics/catalog', analyticsController.getMetricCatalog)");
        expect(routes).toContain('router.use(scopeBranchQuery)');
        expect(controller).toContain("version: '2026-10-27'");
        expect(controller).toContain('METRIC_CATALOG');
    });
});
