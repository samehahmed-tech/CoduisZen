import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('scheduling read branch authority contract', () => {
    it('uses the server-resolved branch for plan and entry reads', () => {
        const source = fs.readFileSync('server/routes/hrExtendedRoutes.ts', 'utf8');
        const plans = source.slice(source.indexOf("router.get('/schedules/plans'"), source.indexOf("router.post('/schedules/plans'"));
        const entries = source.slice(source.indexOf("router.get('/schedules/entries'"), source.indexOf("router.post('/schedules/entries'"));
        expect(plans).toContain('schedulingService.listPlans(req.effectiveBranchId || undefined)');
        expect(plans).not.toContain('req.query.branchId');
        expect(entries).toContain('branchId: req.effectiveBranchId || undefined');
        expect(entries).not.toContain('branchId: req.query.branchId');
    });

    it('does not let a non-super-admin create a plan under a body-supplied branch', () => {
        const source = fs.readFileSync('server/routes/hrExtendedRoutes.ts', 'utf8');
        const plans = source.slice(source.indexOf("router.post('/schedules/plans'"), source.indexOf("router.put('/schedules/plans/:id'"));
        expect(plans).toContain('branchId: req.effectiveBranchId || req.body.branchId');
    });
});
