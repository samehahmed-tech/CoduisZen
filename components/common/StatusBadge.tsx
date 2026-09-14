import React from 'react';

type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'neutral' | 'primary';

interface StatusBadgeProps {
    label: string;
    variant?: BadgeVariant;
    size?: 'sm' | 'md';
    dot?: boolean;
    pulse?: boolean;
}

const VARIANTS: Record<BadgeVariant, { bg: string; text: string; dot: string }> = {
    success: { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
    error: { bg: 'bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400', dot: 'bg-rose-500' },
    warning: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
    info: { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' },
    neutral: { bg: 'bg-slate-500/10', text: 'text-slate-600 dark:text-slate-400', dot: 'bg-slate-400' },
    primary: { bg: 'bg-primary/10', text: 'text-primary', dot: 'bg-primary' },
};

/**
 * Reusable StatusBadge for displaying statuses across all modules.
 *
 * Usage:
 *   <StatusBadge label="Active" variant="success" dot />
 *   <StatusBadge label="Pending" variant="warning" pulse />
 *   <StatusBadge label="Closed" variant="neutral" size="sm" />
 */
const StatusBadge: React.FC<StatusBadgeProps> = ({ label, variant = 'neutral', size = 'md', dot = false, pulse = false }) => {
    const style = VARIANTS[variant];
    const sizeClass = size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1 text-xs';

    return (
        <span className={`theme-badge inline-flex items-center gap-1.5 ${sizeClass} ${style.bg} ${style.text} font-bold leading-none rounded-lg`}>
            {dot && (
                <span className="relative flex h-1.5 w-1.5">
                    {pulse && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${style.dot} opacity-75`} />}
                    <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${style.dot}`} />
                </span>
            )}
            {label}
        </span>
    );
};

export default StatusBadge;

/* ────────────────────────────────────────────────────────────
   StockLevelBadge — canonical stock state across inventory, menu,
   wastage, and intelligence modules. Replaces bespoke per-module
   "low stock" badges so colors/labels stay consistent.
   ──────────────────────────────────────────────────────────── */

export type StockLevel = 'healthy' | 'low' | 'out' | 'oversocked';

interface StockLevelBadgeProps {
    /** Current quantity on hand (can be absolute number). */
    qty: number;
    /** Reorder threshold (below = "low"; at or below 0 = "out"). */
    threshold?: number;
    /** Optional unit label appended (e.g. "kg", "pcs"). */
    unit?: string;
    /** Show numeric qty next to status label. */
    showQty?: boolean;
    /** Bilingual label ('en' | 'ar'). Defaults to 'en'. */
    lang?: 'en' | 'ar';
    size?: 'sm' | 'md';
}

function resolveLevel(qty: number, threshold: number): StockLevel {
    if (!Number.isFinite(qty) || qty <= 0) return 'out';
    if (qty <= threshold) return 'low';
    return 'healthy';
}

function levelVariant(level: StockLevel): BadgeVariant {
    switch (level) {
        case 'out': return 'error';
        case 'low': return 'warning';
        case 'oversocked': return 'info';
        default: return 'success';
    }
}

function levelLabel(level: StockLevel, lang: 'en' | 'ar'): string {
    switch (level) {
        case 'out': return lang === 'ar' ? 'نفد' : 'Out of stock';
        case 'low': return lang === 'ar' ? 'منخفض' : 'Low stock';
        case 'oversocked': return lang === 'ar' ? 'زائد' : 'Overstock';
        default: return lang === 'ar' ? 'متاح' : 'In stock';
    }
}

const StockLevelBadge: React.FC<StockLevelBadgeProps> = ({
    qty,
    threshold = 0,
    unit,
    showQty = true,
    lang = 'en',
    size = 'sm',
}) => {
    const level = resolveLevel(qty, threshold);
    const variant = levelVariant(level);
    const text = levelLabel(level, lang);
    const qtyText = Number.isFinite(qty)
        ? `${qty.toLocaleString(undefined, { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`
        : '0';
    const style = VARIANTS[variant];
    const sizeClass = size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1 text-xs';

    return (
        <span
            className={`theme-badge inline-flex items-center gap-1.5 ${sizeClass} ${style.bg} ${style.text} font-bold leading-none rounded-lg`}
        >
            <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${style.dot}`} />
            {showQty ? `${text} · ${qtyText}` : text}
        </span>
    );
};

export { StockLevelBadge };
