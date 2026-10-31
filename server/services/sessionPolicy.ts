export const isSessionExpired = (expiresAt: unknown, now = Date.now()): boolean => {
    if (!expiresAt) return true;
    const expiryMs = expiresAt instanceof Date
        ? expiresAt.getTime()
        : new Date(String(expiresAt)).getTime();
    return !Number.isFinite(expiryMs) || now >= expiryMs;
};
