export type BusinessDateRange = { from: string; to: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeBusinessDate(value: unknown): string | null {
    const text = String(value || '').trim();
    if (!DATE_RE.test(text)) return null;
    const parsed = new Date(`${text}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) return null;
    return text;
}

export function resolveBusinessDateRange(from: unknown, to: unknown, now = new Date()): BusinessDateRange {
    const today = now.toISOString().slice(0, 10);
    const normalizedTo = normalizeBusinessDate(to) || today;
    const defaultFrom = new Date(`${normalizedTo}T00:00:00.000Z`);
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);
    const normalizedFrom = normalizeBusinessDate(from) || defaultFrom.toISOString().slice(0, 10);
    if (normalizedFrom > normalizedTo) throw new Error('INVALID_BUSINESS_DATE_RANGE');
    return { from: normalizedFrom, to: normalizedTo };
}
