import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('legal hold route contract', () => {
    it('protects create, list, and release routes and audits mutations', () => {
        const routes = fs.readFileSync('server/routes/dataGovernanceRoutes.ts', 'utf8');
        const controller = fs.readFileSync('server/controllers/dataGovernanceController.ts', 'utf8');
        expect(routes).toContain("router.get('/legal-holds'");
        expect(routes).toContain("router.post('/legal-holds'");
        expect(routes).toContain("router.post('/legal-holds/:id/release'");
        expect(routes).toContain('governanceAdmin');
        expect(controller).toContain("eventType: 'LEGAL_HOLD_CREATED'");
        expect(controller).toContain("eventType: 'LEGAL_HOLD_RELEASED'");
    });
});

