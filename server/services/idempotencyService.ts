import { createHash } from 'node:crypto';

const canonicalize = (value: any): any => {
    if (Array.isArray(value)) {
        return value.map(canonicalize);
    }
    if (value && typeof value === 'object') {
        return Object.keys(value)
            .sort()
            .reduce((acc, key) => {
                acc[key] = canonicalize(value[key]);
                return acc;
            }, {} as Record<string, any>);
    }
    return value;
};

export const buildRequestHash = (payload: unknown): string => {
    const normalized = canonicalize(payload);
    const serialized = JSON.stringify(normalized);
    return createHash('sha256').update(serialized).digest('hex');
};

export const getIdempotencyKeyFromRequest = (req: {
    get?: (name: string) => string | undefined;
    headers?: Record<string, any>;
    body?: any;
}): string | undefined => {
    const fromHeader =
        req.get?.('Idempotency-Key') ||
        req.get?.('idempotency-key') ||
        req.headers?.['idempotency-key'] ||
        req.headers?.['Idempotency-Key'];
    const fromBody = req.body?.idempotency_key || req.body?.idempotencyKey;
    const raw = fromHeader || fromBody;
    if (!raw) return undefined;
    const normalized = String(raw).trim();
    return normalized || undefined;
};

export const sanitizeIdempotencyPayload = (payload: any) => {
    if (!payload || typeof payload !== 'object') return payload;
    const clone = { ...payload };
    delete clone.idempotency_key;
    delete clone.idempotencyKey;
    return clone;
};
