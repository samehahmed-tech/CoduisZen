import bcrypt from 'bcryptjs';
import { db } from '../db';
import { roles } from '../../src/db/schema';
import { INITIAL_ROLE_PERMISSIONS } from '../../types';

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
    permissions?: string[] | string | null;
    customPermissions?: any;
};

const APPROVER_ROLES = new Set(['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'MANAGER', 'FINANCE_DIRECTOR', 'ACCOUNTANT']);
const GLOBAL_APPROVER_ROLES = new Set(['SUPER_ADMIN', 'OWNER']);

const canApproveAtBranch = (approver: ApprovalManager, branchId: string) =>
    GLOBAL_APPROVER_ROLES.has(approver.role)
    || approver.assignedBranchId === branchId
    || (approver.allowedBranches || []).includes(branchId);

const parsePermList = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === 'string' && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed.map(String);
        } catch { /* fall through to comma split */ }
        return value.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return [];
};

/**
 * Effective permissions of a potential approver: code role defaults ∪ DB
 * role-matrix row ∪ stored snapshot ± custom overrides. Lets the Roles
 * screen delegate approvals (e.g. a senior cashier holding OP_APPLY_DISCOUNT
 * approves discounts with their own PIN) without sharing manager PINs.
 */
const approverHasPermission = async (
    approver: ApprovalManager,
    permission: string,
    rolePerms: Map<string, string[]>,
): Promise<boolean> => {
    const role = String(approver.role || '');
    const defaults: string[] = ((INITIAL_ROLE_PERMISSIONS as any)[role] || []) as string[];
    const effective = new Set<string>([...defaults, ...(rolePerms.get(role) || []), ...parsePermList(approver.permissions)]);
    const custom: any = approver.customPermissions && typeof approver.customPermissions === 'object'
        ? approver.customPermissions
        : {};
    if (Array.isArray(custom.added)) for (const p of custom.added) effective.add(String(p));
    if (Array.isArray(custom.removed)) for (const p of custom.removed) effective.delete(String(p));
    for (const [perm, enabled] of Object.entries(custom)) {
        if (perm === 'added' || perm === 'removed' || perm === 'defaultPage') continue;
        if (enabled) effective.add(perm); else effective.delete(perm);
    }
    return effective.has(permission);
};

const loadRolePerms = async (): Promise<Map<string, string[]>> => {
    const map = new Map<string, string[]>();
    try {
        const rows = await db.select({ id: roles.id, name: roles.name, permissions: roles.permissions }).from(roles);
        for (const row of rows as any[]) {
            const perms = parsePermList(row?.permissions);
            if (row?.id) map.set(String(row.id), perms);
            if (row?.name) map.set(String(row.name), perms);
        }
    } catch { /* enforcement falls back to code defaults + snapshot */ }
    return map;
};

export const findApproverByPin = async (approvers: ApprovalManager[], pin: string, branchId: string, allowPermission?: string) => {
    const rolePerms = allowPermission ? await loadRolePerms() : new Map<string, string[]>();
    for (const approver of approvers) {
        const inRole = APPROVER_ROLES.has(approver.role);
        const viaPerm = !!allowPermission && !inRole
            && await approverHasPermission(approver, allowPermission, rolePerms);
        if ((!inRole && !viaPerm) || !canApproveAtBranch(approver, branchId)) continue;
        if (approver.managerPin === pin) return approver;
        if (approver.pinLoginEnabled && approver.pinCodeHash && await bcrypt.compare(pin, approver.pinCodeHash)) return approver;
    }
    return undefined;
};

export const findApproverByPassword = async (approvers: ApprovalManager[], password: string, branchId: string, allowPermission?: string) => {
    const rolePerms = allowPermission ? await loadRolePerms() : new Map<string, string[]>();
    for (const approver of approvers) {
        const inRole = APPROVER_ROLES.has(approver.role);
        const viaPerm = !!allowPermission && !inRole
            && await approverHasPermission(approver, allowPermission, rolePerms);
        if ((!inRole && !viaPerm) || !canApproveAtBranch(approver, branchId)) continue;
        if (approver.passwordHash && await bcrypt.compare(password, approver.passwordHash)) return approver;
    }
    return undefined;
};
