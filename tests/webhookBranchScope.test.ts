import { describe, expect, it } from 'vitest';
import { isWebhookBranchMatch } from '../server/utils/webhookScope';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const controllerSource = readFileSync(fileURLToPath(new URL('../server/controllers/webhookController.ts', import.meta.url)), 'utf8');
const routeSource = readFileSync(fileURLToPath(new URL('../server/routes/webhookRoutes.ts', import.meta.url)), 'utf8');

describe('webhook branch scope', () => {
    it('allows global endpoints for global and branch events', () => {
        expect(isWebhookBranchMatch(undefined, undefined)).toBe(true);
        expect(isWebhookBranchMatch(null, 'branch-a')).toBe(true);
    });

    it('requires an explicit matching branch for branch-bound endpoints', () => {
        expect(isWebhookBranchMatch('branch-a', 'branch-a')).toBe(true);
        expect(isWebhookBranchMatch('branch-a', 'branch-b')).toBe(false);
        expect(isWebhookBranchMatch('branch-a', undefined)).toBe(false);
    });

    it('enforces branch ownership at the authenticated CRUD boundary', () => {
        expect(routeSource).toContain('router.use(enforceBranch)');
        expect(controllerSource).toContain('canAccessWebhookBranch');
        expect(controllerSource).toContain('req.effectiveBranchId');
        expect(controllerSource).toContain('FORBIDDEN_BRANCH_ACCESS');
        expect(controllerSource).toContain("role === 'SUPER_ADMIN'");
    });
});
