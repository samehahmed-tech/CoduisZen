export const PAYMENT_WEBHOOK_MAX_ATTEMPTS = 5;
export const PAYMENT_WEBHOOK_BACKOFF_MINUTES = [1, 5, 15, 60, 240] as const;
/** A crashed worker must not leave a payment webhook locked forever. */
export const PAYMENT_WEBHOOK_LEASE_MS = 10 * 60 * 1000;

export const getRetryPolicy = (attempt: number, lastAttemptAt?: string | Date | null, now = Date.now()) => {
    const normalizedAttempt = Math.max(0, Math.floor(Number(attempt) || 0));
    const exhausted = normalizedAttempt >= PAYMENT_WEBHOOK_MAX_ATTEMPTS;
    const backoffMinutes = PAYMENT_WEBHOOK_BACKOFF_MINUTES[Math.min(normalizedAttempt, PAYMENT_WEBHOOK_BACKOFF_MINUTES.length - 1)];
    const last = lastAttemptAt ? new Date(lastAttemptAt).getTime() : 0;
    const eligibleAt = last + backoffMinutes * 60 * 1000;

    return {
        exhausted,
        eligible: !exhausted && now >= eligibleAt,
        nextAttempt: normalizedAttempt + 1,
        eligibleAt,
        backoffMinutes,
    };
};

export const isPaymentWebhookLeaseExpired = (
    leasedAt?: string | Date | null,
    now = Date.now(),
): boolean => {
    if (!leasedAt) return true;
    const timestamp = new Date(leasedAt).getTime();
    return !Number.isFinite(timestamp) || now - timestamp >= PAYMENT_WEBHOOK_LEASE_MS;
};
