type StatusCheckInput = {
    currentStatus: string;
    nextStatus: string;
    orderType?: string | null;
    orderDriverId?: string | null;
    deliverySource?: string | null;
    orderSource?: string | null;
    notes?: string;
    userRole?: string;
    userPermissions?: string[] | null;
    userBranchId?: string | null;
    orderBranchId?: string | null;
    allowedBranches?: string[] | null;
    managerApproved?: boolean;
};

const BASE_TRANSITION_MAP: Record<string, string[]> = {
    SCHEDULED: ['PENDING', 'CANCELLED'],
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
    const permissions = Array.isArray(input.userPermissions) ? input.userPermissions : [];

    if (!next) return { ok: false, code: 'STATUS_REQUIRED' };
    if (current === next) return { ok: true };

    // Branch scoping
    // CALL_CENTER and CALL_CENTER_AGENT are the same agent surface: both are
    // locked to allowedBranches and locked out of branch-started orders.
    const isCallCenter = role === 'CALL_CENTER_AGENT' || role === 'CALL_CENTER';
    if (isCallCenter) {
        if (!allowedBranches.includes(String(orderBranch))) {
            return { ok: false, code: 'FORBIDDEN_BRANCH_SCOPE' };
        }
    } else if (role !== 'SUPER_ADMIN' && userBranch && orderBranch && userBranch !== orderBranch) {
        return { ok: false, code: 'FORBIDDEN_BRANCH_SCOPE' };
    }

    // Call Center Locking: Agents cannot modify orders that are already being processed by the branch
    const LOCKED_STATUSES = new Set(['PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED']);
    if (isCallCenter && LOCKED_STATUSES.has(current)) {
        return { ok: false, code: 'ORDER_LOCKED_IN_BRANCH' };
    }

    if (next === 'CANCELLED' && current !== 'CANCELLED') {
        const canVoidOrder = HIGH_RISK_ROLES.has(role)
            || permissions.includes('*')
            || permissions.includes('OP_VOID_ORDER');
        if (!canVoidOrder && !isCallCenter && !input.managerApproved) {
            return { ok: false, code: 'STATUS_TRANSITION_FORBIDDEN' };
        }
        if (!String(input.notes || '').trim()) {
            return { ok: false, code: 'CANCELLATION_REASON_REQUIRED' };
        }
        return { ok: true };
    }

    // Custody guard (monitoring + cash safety): an in-house delivery order
    // (restaurant delivers it, not an aggregator) must have a driver before
    // it leaves the branch (OUT_FOR_DELIVERY) or closes (DELIVERED).
    // Without this, orders close with no one accountable for the cash/food,
    // delivery KPIs break, and driverless orders pollute 3rd-party reports.
    // Aggregator orders (talabat/…) are delivered by the platform — exempt.
    if (orderType === 'DELIVERY' && (next === 'OUT_FOR_DELIVERY' || next === 'DELIVERED')) {
        const source = String(input.deliverySource || '').trim().toLowerCase();
        const origin = String(input.orderSource || '').trim().toLowerCase();
        // Legacy platform orders may carry source=platform:<name> without a
        // deliverySource — treat any platform marker as aggregator-delivered.
        const aggregator = (source && source !== 'restaurant') || origin.startsWith('platform:');
        if (!aggregator && !String(input.orderDriverId || '').trim()) {
            return { ok: false, code: 'DRIVER_REQUIRED_FOR_DELIVERY' };
        }
    }

    let allowed = [...(BASE_TRANSITION_MAP[current] || [])];
    if (orderType === 'DINE_IN' && ['PENDING', 'PREPARING'].includes(current)) {
        // ponytail: dine-in settlement can close the table from any active kitchen state; add finer payment gates if needed.
        allowed = Array.from(new Set([...allowed, 'COMPLETED', 'CANCELLED']));
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
