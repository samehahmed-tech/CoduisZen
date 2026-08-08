export const KDS_FALLBACK_POLL_MS = 10_000;

export const reconcileKdsPolling = <T>(
    connected: boolean,
    currentTimer: T | null,
    start: () => T,
    stop: (timer: T) => void,
): T | null => {
    if (connected) {
        if (currentTimer !== null) stop(currentTimer);
        return null;
    }
    return currentTimer ?? start();
};
