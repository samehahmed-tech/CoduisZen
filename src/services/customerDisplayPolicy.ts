export const CUSTOMER_DISPLAY_TYPES = ['TAKEAWAY', 'PICKUP', 'KIOSK'] as const;
export const CUSTOMER_DISPLAY_STATUSES = ['READY', 'DELIVERED'] as const;

export type CustomerDisplayOrder = {
    orderNumber: number | null;
    status: string;
    updatedAt: string | Date | null;
};

export type CustomerDisplayOrderInput = {
    orderNumber?: unknown;
    status?: unknown;
    updatedAt?: string | Date | null;
};

export const sanitizeCustomerDisplayOrder = (row: CustomerDisplayOrderInput): CustomerDisplayOrder => ({
    orderNumber: Number.isFinite(Number(row.orderNumber)) && Number(row.orderNumber) > 0 ? Number(row.orderNumber) : null,
    status: String(row.status || '').toUpperCase(),
    updatedAt: row.updatedAt || null,
});

export const normalizeCustomerDisplayLimit = (value: unknown, fallback = 12) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(30, Math.max(1, Math.floor(parsed)));
};
