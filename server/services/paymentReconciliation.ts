export type PaymentAggregateRow = {
    orderId: string;
    method: string | null;
    total: number;
    count: number;
};

export const sessionProviderToPaymentMethod = (providerType: string | null | undefined) => {
    const provider = String(providerType || '').toLowerCase();
    if (provider === 'manual_cash') return 'CASH';
    if (provider === 'eft_pos') return 'VISA';
    return provider.toUpperCase() || 'UNKNOWN';
};

export const reconcilePaymentRows = (
    legacyRows: PaymentAggregateRow[],
    sessionRows: PaymentAggregateRow[],
) => {
    const byOrderMethod = new Map<string, PaymentAggregateRow>();
    for (const row of legacyRows) {
        const method = String(row.method || 'UNKNOWN').toUpperCase();
        byOrderMethod.set(`${row.orderId}:${method}`, { ...row, method });
    }
    for (const row of sessionRows) {
        const method = sessionProviderToPaymentMethod(row.method);
        byOrderMethod.set(`${row.orderId}:${method}`, { ...row, method });
    }

    const byMethod = new Map<string, { method: string; total: number; count: number }>();
    for (const row of byOrderMethod.values()) {
        const method = String(row.method || 'UNKNOWN');
        const current = byMethod.get(method) || { method, total: 0, count: 0 };
        current.total += Number(row.total || 0);
        current.count += Number(row.count || 0);
        byMethod.set(method, current);
    }
    return Array.from(byMethod.values());
};
