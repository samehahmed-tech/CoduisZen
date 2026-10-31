import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('budget route authorization contract', () => {
    it('protects budget reads as well as mutations with the finance gate', () => {
        const source = fs.readFileSync('server/routes/budgetRoutes.ts', 'utf8');
        expect(source).toContain("router.get('/', financeAuth, enforceBranch");
        expect(source).toContain("router.get('/:id', financeAuth, enforceBranch");
        expect(source).toContain("router.get('/:id/vs-actual', financeAuth, enforceBranch");
        expect(source).toContain("['OP_MANAGE_BUDGETS']");
    });
});
