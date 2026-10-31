import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('../server/controllers/p1FinanceController.ts', import.meta.url)), 'utf8');

describe('payment provider branch scope contract', () => {
    it('checks every configured branch before persisting provider settings', () => {
        expect(source).toContain("import { canAccessBranch } from '../middleware/branchIsolation'");
        expect(source).toContain('configuredBranchIds.some((id: string) => !canAccessBranch(req.user, id))');
        expect(source).toContain("error: 'BRANCH_MISMATCH'");
        expect(source).toContain('// The middleware-resolved branch is authoritative');
        expect(source).toContain('...req.body,');
        expect(source).toContain('branchId,\n        branchIds: configuredBranchIds');
        expect(source).toContain('branchIds: configuredBranchIds');
    });
});
