export const ETA_DEAD_LETTER_LEASE_MS = 10 * 60 * 1000;

export const isEtaDeadLetterLeaseExpired = (updatedAt?: string | Date | null, now = Date.now()): boolean => {
    if (!updatedAt) return true;
    const timestamp = new Date(updatedAt).getTime();
    return !Number.isFinite(timestamp) || now - timestamp >= ETA_DEAD_LETTER_LEASE_MS;
};
