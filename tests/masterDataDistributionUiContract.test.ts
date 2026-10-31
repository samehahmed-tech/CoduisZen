import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('master data distribution approval UI contract', () => {
    it('uses the dedicated head-office approval endpoints instead of manager PIN verification', () => {
        const api = fs.readFileSync('services/api/approval.ts', 'utf8');
        const ui = fs.readFileSync('components/ApprovalCenter.tsx', 'utf8');
        expect(api).toContain('approveMasterDataDistribution');
        expect(api).toContain('getMasterDataDistributionApprovals');
        expect(api).toContain('rejectMasterDataDistribution');
        expect(ui).toContain("approval.type !== 'MASTER_DATA_DISTRIBUTION'");
        expect(ui).toContain('approvalApi.approveMasterDataDistribution(approval.id)');
        expect(ui).toContain('approvalApi.rejectMasterDataDistribution(rejectModal.approvalId');
        expect(ui).toContain('approvalApi.getMasterDataDistributionApprovals()');
    });

    it('exposes a distinct central distribution approval type', () => {
        const ui = fs.readFileSync('components/ApprovalCenter.tsx', 'utf8');
        expect(ui).toContain('MASTER_DATA_DISTRIBUTION:');
        expect(ui).toContain('توزيع بيانات مركزية');
        expect(ui).toContain("['SUPER_ADMIN', 'OWNER', 'CEO', 'COO', 'GENERAL_MANAGER']");
    });
});
