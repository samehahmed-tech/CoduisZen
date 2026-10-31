import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('data governance retention contract', () => {
    it('mounts protected get/update retention routes', () => {
        const app = fs.readFileSync('server/app.ts', 'utf8');
        const routes = fs.readFileSync('server/routes/dataGovernanceRoutes.ts', 'utf8');
        const controller = fs.readFileSync('server/controllers/dataGovernanceController.ts', 'utf8');
        expect(app).toContain("app.use('/api/ops/data-governance', dataGovernanceRoutes)");
        expect(routes).toContain("router.get('/retention'");
        expect(routes).toContain("router.put('/retention'");
        expect(routes).toContain('governanceAdmin');
        expect(routes).toContain("'GENERAL_MANAGER'");
        expect(routes).not.toContain("['CFG_MANAGE_SETTINGS']");
        expect(controller).toContain('RETENTION_POLICY_UPDATED');
    });

    it('is fail-safe and never enables automatic deletion', () => {
        const controller = fs.readFileSync('server/controllers/dataGovernanceController.ts', 'utf8');
        const policy = fs.readFileSync('server/utils/retentionPolicy.ts', 'utf8');
        expect(controller).toContain('NO_AUTOMATIC_DELETE');
        expect(controller).toContain('automaticDelete: false');
        expect(policy).toContain("executionMode: 'DRY_RUN' | 'MANUAL_APPROVAL'");
        expect(policy).not.toContain('AUTO_DELETE');
    });
});
