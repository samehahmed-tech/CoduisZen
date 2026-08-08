import { AuthUser } from '../middleware/auth';

export type ActionSpec = {
    permission?: string;
    allowedRoles?: string[];
    mutates: boolean;
};

export const AI_ACTION_SPECS: Record<string, ActionSpec> = {
    UPDATE_INVENTORY: { permission: 'OP_ADJUST_STOCK', allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER'], mutates: true },
    UPDATE_MENU_ITEM: { permission: 'CFG_EDIT_MENU_PRICING', allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER'], mutates: true },
    UPDATE_MENU_PRICE: { permission: 'CFG_EDIT_MENU_PRICING', allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER'], mutates: true },
    CREATE_MENU_ITEM: { permission: 'CFG_EDIT_MENU_PRICING', allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER'], mutates: true },
    CREATE_MENU_CATEGORY: { permission: 'CFG_EDIT_MENU_PRICING', allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER'], mutates: true },
    DELETE_MENU_ITEM: { permission: 'CFG_EDIT_MENU_PRICING', allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER'], mutates: true },
    DELETE_MENU_CATEGORY: { permission: 'CFG_EDIT_MENU_PRICING', allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER'], mutates: true },
    UPDATE_MENU_CATEGORY: { permission: 'CFG_EDIT_MENU_PRICING', allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER'], mutates: true },
    CREATE_CUSTOMER: { permission: 'NAV_CRM', allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER'], mutates: true },
    CREATE_USER: { permission: 'CFG_MANAGE_USERS', allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER'], mutates: true },
    CREATE_EMPLOYEE: { permission: 'NAV_PEOPLE', allowedRoles: ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'HR_MANAGER'], mutates: true },
    CREATE_LEAVE_REQUEST: { permission: 'NAV_PEOPLE', allowedRoles: ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'HR_MANAGER'], mutates: true },
    CREATE_BONUS_PENALTY: { permission: 'NAV_PAYROLL', allowedRoles: ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'HR_MANAGER', 'PAYROLL_OFFICER'], mutates: true },
    CREATE_EMPLOYEE_LOAN: { permission: 'NAV_PAYROLL', allowedRoles: ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'HR_MANAGER', 'PAYROLL_OFFICER'], mutates: true },
    PREVIEW_PAYROLL: { permission: 'NAV_PAYROLL', allowedRoles: ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'HR_MANAGER', 'PAYROLL_OFFICER'], mutates: false },
    ANALYZE_HR: { permission: 'NAV_PEOPLE', allowedRoles: ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'HR_MANAGER', 'PAYROLL_OFFICER'], mutates: false },
    ANALYZE_MENU: { permission: 'NAV_REPORTS', allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER'], mutates: false },
    ANALYZE_INVENTORY: { permission: 'NAV_REPORTS', allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER'], mutates: false },
    SHOW_REPORT: { permission: 'NAV_REPORTS', allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER'], mutates: false },
    // Legacy compatibility action types:
    UPDATE_THRESHOLD: { permission: 'OP_ADJUST_STOCK', allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER'], mutates: true },
    RESTOCK_TRIGGER: { permission: 'OP_ADJUST_STOCK', allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER'], mutates: false },
    MARK_ITEM_STATUS: { permission: 'CFG_EDIT_MENU_PRICING', allowedRoles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER'], mutates: true },
};

export const hasPermission = (user: AuthUser, permission?: string) => {
    if (!permission) return true;
    if (user.role === 'SUPER_ADMIN') return true;
    return Boolean(user.permissions?.includes(permission) || user.permissions?.includes('*'));
};

export const evaluateActionAuthorization = (
    user: AuthUser | undefined,
    actionType: string,
): { ok: boolean; code?: string; message?: string; spec?: ActionSpec } => {
    if (!user) return { ok: false, code: 'AUTH_REQUIRED', message: 'Authentication required' };
    const spec = AI_ACTION_SPECS[actionType];
    if (!spec) return { ok: false, code: 'UNSAFE_ACTION_TYPE', message: 'Unsupported action type' };
    if (spec.allowedRoles && !spec.allowedRoles.includes(user.role)) {
        return { ok: false, code: 'INSUFFICIENT_ROLE', message: 'Role not allowed for this action' };
    }
    if (!hasPermission(user, spec.permission)) {
        return { ok: false, code: 'INSUFFICIENT_PERMISSION', message: 'Missing required permission' };
    }
    return { ok: true, spec };
};
