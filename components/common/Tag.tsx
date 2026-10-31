import React from 'react';
import { X } from 'lucide-react';

interface TagProps {
    label: string;
    color?: 'primary' | 'emerald' | 'rose' | 'amber' | 'indigo' | 'cyan' | 'violet' | 'neutral';
    onRemove?: () => void;
    size?: 'sm' | 'md';
    icon?: React.FC<{ size?: number; className?: string }>;
}

const COLORS: Record<string, { bg: string; text: string }> = {
    primary: { bg: 'bg-primary/10 border-primary/20', text: 'text-primary' },
    emerald: { bg: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400' },
    rose: { bg: 'bg-rose-500/10 border-rose-500/20', text: 'text-rose-600 dark:text-rose-400' },
    amber: { bg: 'bg-amber-500/10 border-amber-500/20', text: 'text-amber-600 dark:text-amber-400' },
    indigo: { bg: 'bg-indigo-500/10 border-indigo-500/20', text: 'text-indigo-600 dark:text-indigo-400' },
    cyan: { bg: 'bg-cyan-500/10 border-cyan-500/20', text: 'text-cyan-600 dark:text-cyan-400' },
    violet: { bg: 'bg-violet-500/10 border-violet-500/20', text: 'text-violet-600 dark:text-violet-400' },
    neutral: { bg: 'bg-slate-500/10 border-slate-500/20', text: 'text-slate-600 dark:text-slate-400' },
};

/**
 * Tag / Chip for categories, filters, and labels.
 *
 * Usage:
 *   <Tag label="Active" color="emerald" />
 *   <Tag label="Dine-In" color="primary" onRemove={() => removeFilter('dine-in')} />
 */
const Tag: React.FC<TagProps> = ({ label, color = 'neutral', onRemove, size = 'md', icon: Icon }) => {
    const c = COLORS[color] || COLORS.neutral;
    const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-[7px] gap-1' : 'px-2.5 py-1 text-[8px] gap-1.5';

    return (
        <span className={`inline-flex items-center ${sizeClass} ${c.bg} ${c.text} border rounded-lg font-black uppercase tracking-wider`}>
            {Icon && <Icon size={size === 'sm' ? 10 : 12} />}
            {label}
            {onRemove && (
                <button onClick={onRemove} className="hover:opacity-70 transition-opacity ml-0.5">
                    <X size={size === 'sm' ? 8 : 10} />
                </button>
            )}
        </span>
    );
};

export default Tag;
