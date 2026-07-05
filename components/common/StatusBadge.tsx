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
    const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-[8px]' : 'px-2.5 py-1 text-[9px]';

    return (
        <span className={`inline-flex items-center gap-1.5 ${sizeClass} ${style.bg} ${style.text} font-black uppercase tracking-wider rounded-lg`}>
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
