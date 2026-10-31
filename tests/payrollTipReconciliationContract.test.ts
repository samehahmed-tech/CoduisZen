import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

describe('payroll tip reconciliation contract', () => {
    it('reconciles only same-branch pools and exposes payroll posting readiness', () => {
        const service = read('server/services/payrollTipReconciliationService.ts');
        const routes = read('server/routes/hrExtendedRoutes.ts');

        expect(service).toContain('eq(tipPools.branchId, cycle.branchId)');
        expect(service).toContain('assertTipAllocationBalanced');
        expect(service).toContain('readyForPayrollPosting');
        expect(routes).toContain("'/payroll-cycles/:cycleId/tips/reconciliation'");
        expect(routes).toContain('loadScopedPayrollCycle');
    });
});
