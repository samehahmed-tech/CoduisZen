export const CONSOLIDATED_REPORT_ROLES = new Set([
    'SUPER_ADMIN',
    'OWNER',
    'CEO',
    'COO',
    'GENERAL_MANAGER',
]);

export type ConsolidatedScopeInput = {
    role?: unknown;
    requestedBranchId?: unknown;
    assignedBranchId?: unknown;
    allowedBranches?: unknown;
};

export type ConsolidatedScope =
    | { ok: true; global: boolean; branchId?: string }
    | { ok: false; reason: 'BRANCH_SCOPE_REQUIRED' | 'BRANCH_MISMATCH' };

export const resolveConsolidatedReportScope = (input: ConsolidatedScopeInput): ConsolidatedScope => {
    const role = String(input.role || '').trim().toUpperCase();
    const requested = String(input.requestedBranchId || '').trim();
    if (CONSOLIDATED_REPORT_ROLES.has(role)) {
        return requested ? { ok: true, global: false, branchId: requested } : { ok: true, global: true };
    }

    const assigned = String(input.assignedBranchId || '').trim();
    const allowed = new Set([
        assigned,
        ...(Array.isArray(input.allowedBranches) ? input.allowedBranches.map(String) : []),
    ].filter(Boolean));
    if (!assigned && allowed.size === 0) return { ok: false, reason: 'BRANCH_SCOPE_REQUIRED' };
    const branchId = requested || assigned || Array.from(allowed)[0];
    if (!allowed.has(branchId)) return { ok: false, reason: 'BRANCH_MISMATCH' };
    return { ok: true, global: false, branchId };
};
