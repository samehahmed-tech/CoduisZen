import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('call-center report branch authority contract', () => {
    it('anchors discount abuse and daily summary to the resolved branch', () => {
        const source = readFileSync(resolve(process.cwd(), 'server/controllers/callCenterSupervisorController.ts'), 'utf8');
        expect(source).toContain("String(req.effectiveBranchId || req.query.branchId || '').trim()");
        expect(source).not.toContain("String(req.query.branchId || '').trim()");
    });
});
