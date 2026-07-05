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
 */
export function formatCurrency(amount: number, symbol: string = 'LE'): string {
    return `${amount.toLocaleString()} ${symbol}`;
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
