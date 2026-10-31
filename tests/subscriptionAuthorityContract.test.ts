import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('subscription authority contract', () => {
    it('requires head-office authority for global plans and tenant onboarding', () => {
        const source = fs.readFileSync('server/routes/subscriptionRoutes.ts', 'utf8');
        expect(source).toContain("router.use(requireRoles('SUPER_ADMIN', 'OWNER', 'CEO', 'COO', 'GENERAL_MANAGER', 'IT'));");
        expect(source).toContain('tenant entitlements');
    });
});
