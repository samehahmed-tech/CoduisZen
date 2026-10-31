import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('branch export contract', () => {
    it('exposes a protected bounded JSON export', () => {
        const routes = fs.readFileSync('server/routes/dataGovernanceRoutes.ts', 'utf8');
        const controller = fs.readFileSync('server/controllers/dataGovernanceController.ts', 'utf8');
        expect(routes).toContain("router.get('/branch-export'");
        expect(controller).toContain('MAX_BRANCH_EXPORT_ORDERS');
        expect(controller).toContain('BRANCH_EXPORT_TOO_LARGE');
        expect(controller).toContain("eventType: 'BRANCH_DATA_EXPORTED'");
    });

    it('hides personal data and payment references by default', () => {
        const controller = fs.readFileSync('server/controllers/dataGovernanceController.ts', 'utf8');
        expect(controller).toContain('PERSONAL_DATA_EXPORT_RESTRICTED');
        expect(controller).toContain('paymentReferencesExcluded: true');
        expect(controller).toContain('personalDataIncluded: includePersonalData');
    });
});

