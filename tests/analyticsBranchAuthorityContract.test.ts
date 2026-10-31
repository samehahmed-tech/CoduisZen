import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('analytics branch authority contract', () => {
    it('does not let labor or leaderboard analytics prefer a raw query branch', () => {
        const source = readFileSync(resolve(process.cwd(), 'server/controllers/analyticsController.ts'), 'utf8');
        expect(source).toContain("const branchId = req.effectiveBranchId || (req.query.branchId as string | undefined);");
        expect(source).not.toContain("const branchId = req.query.branchId as string;");
        expect(source).not.toContain("const branchId = req.query.branchId as string | undefined;");
    });
});
