import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('analytics authorization contract', () => {
    it('requires revenue visibility for analytics endpoints', () => {
        const source = fs.readFileSync('server/routes/analyticsRoutes.ts', 'utf8');
        expect(source).toContain("router.use(requirePermission('DATA_VIEW_REVENUE'));");
        expect(source).toContain('router.use(scopeBranchQuery);');
    });

    it('requires salary visibility for labor efficiency', () => {
        const source = fs.readFileSync('server/routes/analyticsRoutes.ts', 'utf8');
        expect(source).toContain("router.get('/labor-efficiency', requirePermission('DATA_VIEW_SALARIES'), analyticsController.getLaborEfficiency);");
    });
});
