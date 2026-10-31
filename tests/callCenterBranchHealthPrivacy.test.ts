import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('call center branch health privacy contract', () => {
    it('limits non-super-admin health reads to the effective branch', () => {
        const source = fs.readFileSync('server/controllers/callCenterSupervisorController.ts', 'utf8');
        expect(source).toContain("const scopedBranchId = String(req.effectiveBranchId || '').trim();");
        expect(source).toContain("BRANCH_SCOPE_REQUIRED");
        expect(source).toContain('scopedBranchId ? eq(branches.id, scopedBranchId) : undefined');
    });

    it('does not expose branch network addresses or phone numbers in health output', () => {
        const source = fs.readFileSync('server/controllers/callCenterSupervisorController.ts', 'utf8');
        const healthBlock = source.slice(source.indexOf('export const getBranchHealth'), source.indexOf('export const getFailedOrders'));
        expect(healthBlock).not.toContain('serverIp: ip');
        expect(healthBlock).not.toContain('phone: branch.phone');
        expect(healthBlock).toContain('endpointConfigured: Boolean(ip)');
    });
});
