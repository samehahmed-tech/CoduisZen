import { describe, expect, it } from 'vitest';
import { resolveConsolidatedReportScope } from '../server/utils/consolidatedReportScope';

describe('consolidated report scope', () => {
    it('allows head office roles to see all branches by default', () => {
        expect(resolveConsolidatedReportScope({ role: 'OWNER', assignedBranchId: 'b1' }))
            .toEqual({ ok: true, global: true });
    });

    it('locks ordinary users to their assigned/allowed branch', () => {
        expect(resolveConsolidatedReportScope({ role: 'BRANCH_MANAGER', assignedBranchId: 'b1', requestedBranchId: 'b2' }))
            .toEqual({ ok: false, reason: 'BRANCH_MISMATCH' });
        expect(resolveConsolidatedReportScope({ role: 'BRANCH_MANAGER', assignedBranchId: 'b1' }))
            .toEqual({ ok: true, global: false, branchId: 'b1' });
    });

    it('fails closed when no branch scope exists', () => {
        expect(resolveConsolidatedReportScope({ role: 'BRANCH_MANAGER' }))
            .toEqual({ ok: false, reason: 'BRANCH_SCOPE_REQUIRED' });
    });
});
