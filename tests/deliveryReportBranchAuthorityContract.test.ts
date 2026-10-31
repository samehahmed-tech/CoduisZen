import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('delivery report branch authority contract', () => {
    it('anchors telemetry, SLA alerts and escalations to the resolved branch', () => {
        const source = readFileSync(resolve(process.cwd(), 'server/controllers/deliveryController.ts'), 'utf8');
        expect(source).toContain('(req.effectiveBranchId as string) || getStringParam(req.query.branchId)');
        expect(source).toContain('(req.effectiveBranchId as string)\n            || String(req.body?.branchId || req.user?.branchId || \'\').trim()');
        expect(source).toContain('const branchId = getStringParam(req.effectiveBranchId) || getStringParam(req.query.branchId);');
        expect(source).toContain('if (branchId) conditions.push(eq(drivers.branchId, branchId as string));');
        expect(source).toContain("const branchId = getStringParam(req.effectiveBranchId) || getStringParam(req.query.branchId);");
        expect(source).toContain("String(req.effectiveBranchId || body.branchId || req.user?.branchId || '')");
        expect(source).toContain('req.effectiveBranchId ? eq(drivers.branchId, req.effectiveBranchId) : undefined');
        expect(source).toContain("throw new Error('CROSS_BRANCH_ASSIGN')");
        expect(source).toContain('req.effectiveBranchId ? eq(drivers.branchId, req.effectiveBranchId) : undefined,');
    });
});
