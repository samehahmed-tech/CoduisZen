import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('table read branch authority contract', () => {
    it('prefers the branch resolved by enforceBranch for tables and zones', () => {
        const source = fs.readFileSync('server/controllers/tableController.ts', 'utf8');
        expect(source).toContain('const branchId = req.effectiveBranchId || getStringParam(req.query.branchId);');
        expect(source).not.toContain('const branchId = getStringParam(req.query.branchId);');
    });
});
