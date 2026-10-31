import crypto from 'crypto';

export type IntegrationFailureClass = 'TRANSIENT' | 'PERMANENT' | 'CONFLICT';

export const classifyIntegrationHttpStatus = (status?: number): IntegrationFailureClass => {
    if (!status) return 'TRANSIENT';
    if (status === 409 || status === 429 || status >= 500) return status === 409 ? 'CONFLICT' : 'TRANSIENT';
    if (status >= 400) return 'PERMANENT';
    return 'TRANSIENT';
};

export const shouldRetryIntegrationFailure = (failureClass: IntegrationFailureClass): boolean =>
    failureClass === 'TRANSIENT' || failureClass === 'CONFLICT';

export const computeIntegrationBackoffMs = (
    attempt: number,
    baseMs = 1000,
    maxMs = 5 * 60 * 1000,
): number => {
    const normalizedAttempt = Math.max(1, Math.floor(Number(attempt) || 1));
    return Math.min(maxMs, baseMs * (2 ** (normalizedAttempt - 1)));
};

/** Stable per-delivery key for providers that support idempotent requests. */
export const buildIntegrationIdempotencyKey = (
    namespace: string,
    sourceId: string,
    event: string,
    payload: unknown,
): string => {
    const digest = crypto.createHash('sha256')
        .update(JSON.stringify(payload, Object.keys((payload && typeof payload === 'object') ? payload as Record<string, unknown> : {}).sort()))
        .digest('hex')
        .slice(0, 24);
    return `${namespace}:${sourceId}:${event}:${digest}`;
};
