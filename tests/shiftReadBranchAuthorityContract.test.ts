import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('shift read branch authority contract', () => {
    it('uses the server-resolved effective branch before the client query branch', () => {
        const source = fs.readFileSync('server/controllers/shiftController.ts', 'utf8');
        expect(source).toContain('const branchId = req.effectiveBranchId || getStringParam(req.query.branchId);');
        expect(source).not.toContain('const branchId = getStringParam(req.query.branchId);');
    });
});
