const SENSITIVE_DELIVERY_KEY = /(password|passcode|secret|token|api[_-]?key|master[_-]?key|dealer[_-]?key|authorization|cookie|private[_-]?key|phone|mobile|email|card|pan|cvv|cvc|otp)/i;

const redactDeliveryValue = (value: any, depth = 0, seen = new WeakSet<object>()): any => {
    if (depth > 8) return '[TRUNCATED]';
    if (value === null || value === undefined || typeof value !== 'object') return value;
    if (seen.has(value)) return '[CIRCULAR]';
    seen.add(value);
    if (Array.isArray(value)) return value.map((entry) => redactDeliveryValue(entry, depth + 1, seen));
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
        key,
        SENSITIVE_DELIVERY_KEY.test(key) ? '[REDACTED]' : redactDeliveryValue(entry, depth + 1, seen),
    ]));
};

const redactDeliveryText = (value: unknown) => {
    if (value === null || value === undefined) return value;
    const text = String(value).slice(0, 2000);
    try {
        return JSON.stringify(redactDeliveryValue(JSON.parse(text)));
    } catch {
        return text.replace(/(authorization|token|password|secret|phone|mobile|email)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]');
    }
};

export const sanitizeWebhookDelivery = (delivery: any) => ({
    ...delivery,
    payload: redactDeliveryValue(delivery?.payload),
    responseBody: redactDeliveryText(delivery?.responseBody),
    lastError: redactDeliveryText(delivery?.lastError),
});
