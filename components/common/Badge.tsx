import React from 'react';

interface BadgeProps {
    children: React.ReactNode;
    color?: 'primary' | 'emerald' | 'rose' | 'amber' | 'indigo' | 'neutral';
    size?: 'sm' | 'md';
}

const COLORS: Record<string, string> = {
    primary: 'bg-primary/10 text-primary border-primary/20',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    indigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
    neutral: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
};

/**
 * Inline badge for labeling content.
 *
 * Usage:
 *   <Badge color="emerald">Active</Badge>
 *   <Badge color="rose" size="sm">Overdue</Badge>
 */
const Badge: React.FC<BadgeProps> = ({ children, color = 'neutral', size = 'md' }) => {
    const sizeClass = size === 'sm' ? 'px-1.5 py-0.5 text-[7px]' : 'px-2 py-0.5 text-[8px]';
    return (
        <span className={`inline-flex items-center ${sizeClass} ${COLORS[color]} border rounded-md font-black uppercase tracking-wider`}>
            {children}
        </span>
    );
};

export default Badge;
