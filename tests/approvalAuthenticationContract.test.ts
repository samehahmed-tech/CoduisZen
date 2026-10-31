import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('approval authentication contract', () => {
    it('requires a signed-in actor before any approval or manager-verification route', () => {
        const source = fs.readFileSync('server/routes/approvalRoutes.ts', 'utf8');
        expect(source).toContain('router.use(authenticateToken, scopeBranchQuery);');
        expect(source).not.toContain('router.use(scopeBranchQuery);');
    });
});
