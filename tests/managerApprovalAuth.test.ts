import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { findApproverByPassword, findApproverByPin, type ApprovalManager } from '../server/services/managerApprovalAuth';

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

describe('findApproverByPassword', () => {
    it('accepts a hashed manager password only within the manager branch scope', async () => {
        const approver: ApprovalManager = {
            id: 'manager-1',
            name: 'Manager',
            role: 'BRANCH_MANAGER',
            assignedBranchId: 'branch-1',
            allowedBranches: [],
            managerPin: null,
            pinCodeHash: null,
            pinLoginEnabled: false,
            passwordHash: await bcrypt.hash('SecurePass123!', 4),
        };

        await expect(findApproverByPassword([approver], 'SecurePass123!', 'branch-1')).resolves.toEqual(approver);
        await expect(findApproverByPassword([approver], 'SecurePass123!', 'branch-2')).resolves.toBeUndefined();
        await expect(findApproverByPassword([approver], 'wrong-password', 'branch-1')).resolves.toBeUndefined();
    });
});
