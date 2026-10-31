const PRIVATE_KEY = /(phone|mobile|email|address|customer|payment|card|cvv|secret|token|password|pin|header|rawpayload)/i;

/** Remove PII, payment material, and transport secrets from partner payloads. */
export const sanitizePublicWebhookPayload = (value: unknown, depth = 0): unknown => {
    if (depth > 8) return '[TRUNCATED]';
    if (Array.isArray(value)) return value.slice(0, 200).map(item => sanitizePublicWebhookPayload(item, depth + 1));
    if (!value || typeof value !== 'object') return typeof value === 'string' ? value.slice(0, 4000) : value;
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (PRIVATE_KEY.test(key)) continue;
        output[key] = sanitizePublicWebhookPayload(child, depth + 1);
    }
    return output;
};
