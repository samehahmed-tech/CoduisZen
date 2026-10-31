const SENSITIVE_KEY = /(password|passcode|secret|token|api[_-]?key|master[_-]?key|dealer[_-]?key|authorization|cookie|private[_-]?key)/i;

/** Keep credentials out of the forensic record while preserving useful shape. */
export const redactAuditValue = (value: any, depth = 0, seen = new WeakSet<object>()): any => {
    if (depth > 8) return '[TRUNCATED]';
    if (value === null || value === undefined || typeof value !== 'object') return value;
    if (seen.has(value)) return '[CIRCULAR]';
    seen.add(value);
    if (Array.isArray(value)) return value.map((entry) => redactAuditValue(entry, depth + 1, seen));
    const out: Record<string, any> = {};
    for (const [key, entry] of Object.entries(value)) {
        out[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactAuditValue(entry, depth + 1, seen);
    }
    return out;
};

/** Canonical payload stored and signed by every audit writer. */
export const buildSafeAuditPayload = (payload: any, context: {
    requestId?: string | null;
    sourceDevice?: string | string[] | null;
} = {}) => {
    const safePayload = redactAuditValue(payload);
    const auditContext = {
        requestId: context.requestId || null,
        sourceDevice: context.sourceDevice || null,
    };
    if (safePayload && typeof safePayload === 'object' && !Array.isArray(safePayload)) {
        return { ...safePayload, _auditContext: auditContext };
    }
    return { value: safePayload, _auditContext: auditContext };
};
