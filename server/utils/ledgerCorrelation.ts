export const buildLedgerCorrelationId = (
    orderId: string | null,
    paymentSessionId: string | null,
    source?: string,
    explicitCorrelationId?: string,
) => String(
    explicitCorrelationId
    || `${source || 'LEGACY_LEDGER'}:${orderId || '-'}:${paymentSessionId || '-'}`,
).trim().slice(0, 255);
