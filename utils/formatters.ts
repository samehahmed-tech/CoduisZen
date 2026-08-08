/**
 * Format a date into relative time ("2m ago", "3h ago", "Yesterday").
 */
export function timeAgo(date: string | Date, lang: 'en' | 'ar' = 'en'): string {
    const now = Date.now();
    const then = new Date(date).getTime();
    const diff = Math.max(0, now - then);
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (lang === 'ar') {
        if (seconds < 60) return 'الآن';
        if (minutes < 60) return `منذ ${minutes} د`;
        if (hours < 24) return `منذ ${hours} س`;
        if (days === 1) return 'أمس';
        if (days < 7) return `منذ ${days} أيام`;
        if (days < 30) return `منذ ${Math.floor(days / 7)} أسابيع`;
        return new Date(date).toLocaleDateString('ar-EG');
    }

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format a number as currency with the given symbol.
 * Uses 2 fraction digits for amounts < 1,000,000 (money precision).
 */
export function formatCurrency(amount: number, symbol: string = 'LE'): string {
    return `${amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })} ${symbol}`;
}

/**
 * Round a money value to 2 decimal places, never using NaN/Infinity.
 * Use this before sending numbers to the server to avoid float drift
 * (e.g. 0.1 + 0.2 = 0.30000000000000004).
 */
export function moneyRound(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Format a number with a fixed quantity precision (e.g. inventory qty).
 * No thousand separator unless the absolute value >= 1000.
 */
export function formatQty(value: number, unit?: string): string {
    if (!Number.isFinite(value)) return unit ? `0 ${unit}` : '0';
    const rounded = moneyRound(value);
    const text = Math.abs(rounded) >= 1000
        ? rounded.toLocaleString(undefined, { maximumFractionDigits: 2 })
        : String(rounded);
    return unit ? `${text} ${unit}` : text;
}

/**
 * Today's date in local time as 'YYYY-MM-DD'.
 * Use this instead of `new Date().toISOString().slice(0,10)` to avoid UTC rollover
 * (e.g. an evening operation at 22:00 local in UTC+2 would otherwise stamp tomorrow).
 */
export function todayLocalDate(): string {
    return formatLocalDate(new Date());
}

/**
 * Format a Date (or date string) as a local 'YYYY-MM-DD'.
 */
export function formatLocalDate(date: string | Date): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * Parse a 'YYYY-MM-DD' key into a Date whose local-time component is set to noon
 * (so display toLocaleDateString doesn't roll over a day earlier in negative-UTC zones).
 * Returns null for invalid input.
 */
export function parseLocalDateKey(key: string): Date | null {
    if (!key || typeof key !== 'string') return null;
    const match = key.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const [, y, m, d] = match;
    const date = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0, 0);
    if (Number.isNaN(date.getTime())) return null;
    return date;
}

/**
 * Format a number as a compact representation (1.2K, 3.5M).
 */
export function formatCompact(num: number): string {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return String(num);
}

/**
 * Format a percentage with fixed decimals.
 */
export function formatPercent(value: number, decimals: number = 1): string {
    return `${value.toFixed(decimals)}%`;
}
