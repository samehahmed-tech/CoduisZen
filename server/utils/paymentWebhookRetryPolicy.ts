const TRANSIENT_CODES = new Set([
    'DB_TIMEOUT',
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'EAI_AGAIN',
    'DEADLOCK',
    '1205',
]);

/** Only infrastructure failures may enter the payment webhook retry queue. */
export const isTransientPaymentWebhookError = (error: unknown): boolean => {
    const value = error as { code?: unknown; status?: unknown; message?: unknown } | null;
    const code = String(value?.code || '').trim().toUpperCase();
    const message = String(value?.message || error || '').trim().toUpperCase();
    if (TRANSIENT_CODES.has(code) || TRANSIENT_CODES.has(message)) return true;
    if (Number(value?.status) >= 500) return true;
    return Array.from(TRANSIENT_CODES).some((candidate) => message.includes(candidate));
};
