const MAX_RETRY_MS = 5 * 60 * 1000;

export const simpleHash = (value: string) => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash << 5) - hash + value.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(16);
};

export const buildDedupeKey = (entity: string, action: string, payload: any) => {
    const id = payload?.id
        || payload?.key
        || payload?.item_id
        || payload?.order_id
        || payload?.table_id;
    if (id) return `${entity}:${action}:${id}`;
    return `${entity}:${action}:${simpleHash(JSON.stringify(payload || {}))}`;
};

export const computeNextAttempt = (retryCount: number, baseRetryMs: number) => {
    const delay = Math.min(MAX_RETRY_MS, baseRetryMs * Math.pow(2, Math.max(0, retryCount - 1)));
    return Date.now() + delay;
};
