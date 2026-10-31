import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('refund read branch authority contract', () => {
    it('anchors list and stats reads to the resolved branch', () => {
        const source = readFileSync(resolve(process.cwd(), 'server/controllers/refundController.ts'), 'utf8');
        expect(source).toContain('branchId: req.effectiveBranchId || (req.query.branchId ? String(req.query.branchId) : undefined)');
        expect(source).not.toContain('branchId: req.query.branchId ? String(req.query.branchId) : undefined');
    });
});
