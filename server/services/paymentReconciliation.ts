export type PaymentAggregateRow = {
    orderId: string;
    method: string | null;
    total: number;
    count: number;
};

/**
 * Card-brand aliases all mean "card terminal payment" in reports. Without
 * this, one order paid via legacy 'CARD' + confirmed 'eft_pos' session would
 * be counted under BOTH labels (double count). Mirrors the VISA-equivalence
 * lookup already used by the shift X-report.
 */
const CARD_ALIASES = new Set(['CARD', 'CREDIT_CARD', 'DEBIT_CARD']);

export const normalizePaymentMethod = (method: string | null | undefined) => {
    const upper = String(method || 'UNKNOWN').toUpperCase();
    if (CARD_ALIASES.has(upper)) return 'VISA';
    return upper || 'UNKNOWN';
};

export const sessionProviderToPaymentMethod = (providerType: string | null | undefined) => {
    const provider = String(providerType || '').toLowerCase();
    if (provider === 'manual_cash') return 'CASH';
    if (provider === 'eft_pos') return 'VISA';
    return normalizePaymentMethod(provider) || 'UNKNOWN';
};

export const reconcilePaymentRows = (
    legacyRows: PaymentAggregateRow[],
    sessionRows: PaymentAggregateRow[],
) => {
    const byOrderMethod = new Map<string, PaymentAggregateRow>();
    for (const row of legacyRows) {
        const method = normalizePaymentMethod(row.method);
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
