import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('approval branch authority contract', () => {
    const source = fs.readFileSync('server/controllers/approvalController.ts', 'utf8');

    it('does not let a scoped caller verify an approval for another branch', () => {
        expect(source).toContain('const scopedBranchId = req.effectiveBranchId;');
        expect(source).toContain("BRANCH_SCOPE_VIOLATION");
        expect(source).toContain("APPROVAL_BRANCH_MISMATCH");
        expect(source).toContain('const effectiveBranchId = scopedBranchId || branchId || approval?.branchId;');
    });

    it('checks approval ownership before rejection', () => {
        expect(source).toContain("if (req.effectiveBranchId && approval.branchId && String(req.effectiveBranchId) !== String(approval.branchId))");
        expect(source).toContain("return res.status(403).json({ error: 'BRANCH_SCOPE_VIOLATION' });");
    });
});
