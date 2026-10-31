import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('retention execution plan contract', () => {
    it('exposes a protected plan and connects it to legal holds', () => {
        const routes = fs.readFileSync('server/routes/dataGovernanceRoutes.ts', 'utf8');
        const controller = fs.readFileSync('server/controllers/dataGovernanceController.ts', 'utf8');
        expect(routes).toContain("router.get('/retention/plan'");
        expect(controller).toContain('getRetentionPlan');
        expect(controller).toContain('activeLegalHolds');
        expect(controller).toContain('legalHoldProtection');
        expect(controller).toContain('NO_AUTOMATIC_DELETE');
    });
});

