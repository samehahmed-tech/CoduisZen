export const FISCAL_RETRY_LEASE_MS = 10 * 60 * 1000;

export const isFiscalRetryLeaseExpired = (updatedAt?: string | Date | null, now = Date.now()): boolean => {
    if (!updatedAt) return true;
    const timestamp = new Date(updatedAt).getTime();
    return !Number.isFinite(timestamp) || now - timestamp >= FISCAL_RETRY_LEASE_MS;
};
