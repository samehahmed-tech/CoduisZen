type StatusCheckInput = {
    currentStatus: string;
    nextStatus: string;
    orderType?: string | null;
    notes?: string;
    userRole?: string;
    userBranchId?: string | null;
    orderBranchId?: string | null;
    allowedBranches?: string[] | null;
};

const BASE_TRANSITION_MAP: Record<string, string[]> = {
    PENDING: ['PREPARING', 'READY', 'CANCELLED'],
    PREPARING: ['READY', 'CANCELLED'],
    READY: ['DELIVERED', 'COMPLETED', 'CANCELLED'],
    OUT_FOR_DELIVERY: ['DELIVERED', 'COMPLETED', 'CANCELLED'],
    DELIVERED: ['COMPLETED'],
    COMPLETED: [],
    CANCELLED: [],
};

const HIGH_RISK_ROLES = new Set(['SUPER_ADMIN', 'BRANCH_MANAGER', 'MANAGER']);

export const evaluateOrderStatusUpdate = (input: StatusCheckInput): { ok: boolean; code?: string } => {
    const current = String(input.currentStatus || '').toUpperCase();
    const next = String(input.nextStatus || '').toUpperCase();
    const orderType = String(input.orderType || '').toUpperCase();
    const role = String(input.userRole || '').toUpperCase();
    const userBranch = input.userBranchId ? String(input.userBranchId) : null;
    const orderBranch = input.orderBranchId ? String(input.orderBranchId) : null;
    const allowedBranches = Array.isArray(input.allowedBranches) ? input.allowedBranches : [];

    if (!next) return { ok: false, code: 'STATUS_REQUIRED' };
    if (current === next) return { ok: true };

    // Branch scoping
    if (role === 'CALL_CENTER_AGENT') {
        if (!allowedBranches.includes(String(orderBranch))) {
            return { ok: false, code: 'FORBIDDEN_BRANCH_SCOPE' };
        }
    } else if (role !== 'SUPER_ADMIN' && userBranch && orderBranch && userBranch !== orderBranch) {
        return { ok: false, code: 'FORBIDDEN_BRANCH_SCOPE' };
    }

    // Call Center Locking: Agents cannot modify orders that are already being processed by the branch
    const LOCKED_STATUSES = new Set(['PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED']);
    if (role === 'CALL_CENTER_AGENT' && LOCKED_STATUSES.has(current)) {
        return { ok: false, code: 'ORDER_LOCKED_IN_BRANCH' };
    }

    if (next === 'CANCELLED' && current !== 'CANCELLED') {
        if (!HIGH_RISK_ROLES.has(role) && role !== 'CALL_CENTER_AGENT') {
            return { ok: false, code: 'STATUS_TRANSITION_FORBIDDEN' };
        }
        if (!String(input.notes || '').trim()) {
            return { ok: false, code: 'CANCELLATION_REASON_REQUIRED' };
        }
        return { ok: true };
    }

    let allowed = [...(BASE_TRANSITION_MAP[current] || [])];
    if (orderType === 'DINE_IN' && ['PENDING', 'PREPARING', 'READY'].includes(current)) {
        // ponytail: dine-in settlement can close the table from any active kitchen state; add finer payment gates if needed.
        allowed = ['COMPLETED', 'CANCELLED'];
    } else if (['TAKEAWAY', 'PICKUP'].includes(orderType) && current === 'PENDING') {
        // ponytail: direct counter sales can skip kitchen/pickup screens; add per-order-type config only if needed.
        allowed = ['PREPARING', 'READY', 'COMPLETED', 'CANCELLED'];
    } else if (current === 'READY') {
        if (orderType === 'DELIVERY') {
            allowed = ['OUT_FOR_DELIVERY', 'CANCELLED'];
        } else if (orderType === 'DINE_IN') {
            // Dine-in does not need pickup handover; it closes when the table is settled.
            allowed = ['COMPLETED', 'CANCELLED'];
        } else {
            allowed = ['DELIVERED', 'CANCELLED'];
        }
    }

    if (!allowed || !allowed.includes(next)) {
        return { ok: false, code: 'INVALID_STATUS_TRANSITION' };
    }

    return { ok: true };
};
