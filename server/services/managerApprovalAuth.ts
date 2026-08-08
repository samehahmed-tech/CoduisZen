import bcrypt from 'bcryptjs';

export type ApprovalManager = {
    id: string;
    name: string;
    role: string;
    assignedBranchId: string | null;
    allowedBranches: string[] | null;
    managerPin: string | null;
    pinCodeHash: string | null;
    pinLoginEnabled: boolean | null;
    passwordHash?: string | null;
};

const APPROVER_ROLES = new Set(['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'MANAGER', 'FINANCE_DIRECTOR', 'ACCOUNTANT']);
const GLOBAL_APPROVER_ROLES = new Set(['SUPER_ADMIN', 'OWNER']);

const canApproveAtBranch = (approver: ApprovalManager, branchId: string) =>
    GLOBAL_APPROVER_ROLES.has(approver.role)
    || approver.assignedBranchId === branchId
    || (approver.allowedBranches || []).includes(branchId);

export const findApproverByPin = async (approvers: ApprovalManager[], pin: string, branchId: string) => {
    for (const approver of approvers) {
        if (!APPROVER_ROLES.has(approver.role) || !canApproveAtBranch(approver, branchId)) continue;
        if (approver.managerPin === pin) return approver;
        if (approver.pinLoginEnabled && approver.pinCodeHash && await bcrypt.compare(pin, approver.pinCodeHash)) return approver;
    }
    return undefined;
};

export const findApproverByPassword = async (approvers: ApprovalManager[], password: string, branchId: string) => {
    for (const approver of approvers) {
        if (!APPROVER_ROLES.has(approver.role) || !canApproveAtBranch(approver, branchId)) continue;
        if (approver.passwordHash && await bcrypt.compare(password, approver.passwordHash)) return approver;
    }
    return undefined;
};
