import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { findApproverByPin, type ApprovalManager } from '../server/services/managerApprovalAuth';

describe('findApproverByPin', () => {
    it('accepts the six-digit login PIN for a super admin on the active branch', async () => {
        const approver: ApprovalManager = {
            id: 'admin-1',
            name: 'Admin',
            role: 'SUPER_ADMIN',
            assignedBranchId: 'branch-1',
            allowedBranches: [],
            managerPin: null,
            pinCodeHash: await bcrypt.hash('654321', 4),
            pinLoginEnabled: true,
        };

        await expect(findApproverByPin([approver], '654321', 'branch-2')).resolves.toEqual(approver);
    });
});
