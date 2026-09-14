import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
    title: string;
    value: string | number;
    icon: React.FC<{ size?: number; className?: string }>;
    trend?: number; // percentage change, positive = up
    subtitle?: string;
    color?: string;
    compact?: boolean;
}

/**
 * Reusable StatCard / KPI card used across Dashboard, modules, and reports.
 *
 * Usage:
 *   <StatCard title="Revenue" value="12,500" icon={DollarSign} trend={12.5} color="emerald" />
 *   <StatCard title="Orders" value={256} icon={ShoppingBag} trend={-3.2} subtitle="Today" />
 */
const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, trend, subtitle, color = 'primary', compact = false }) => {
    const isPositive = trend !== undefined && trend >= 0;
    const isNegative = trend !== undefined && trend < 0;

    const iconColorMap: Record<string, string> = {
        primary: 'bg-primary/10 text-primary',
        indigo: 'bg-indigo-500/10 text-indigo-500',
        emerald: 'bg-emerald-500/10 text-emerald-500',
        amber: 'bg-amber-500/10 text-amber-500',
        rose: 'bg-rose-500/10 text-rose-500',
        cyan: 'bg-cyan-500/10 text-cyan-500',
        violet: 'bg-violet-500/10 text-violet-500',
    };
    const iconClass = iconColorMap[color] || iconColorMap.primary;

    return (
        <div
            className={`glass-1 relative group overflow-hidden transition-transform duration-150 hover:-translate-y-1 ${compact ? 'p-4' : 'p-5'} border-border/10`}
        >
            {/* Background Decorative Glow */}
            <div className={`absolute -right-4 -top-4 w-24 h-24 blur-3xl opacity-10 group-hover:opacity-20 transition-opacity duration-500 ${iconClass.split(' ')[0]}`} />
            
            <div className="relative z-10 flex items-start justify-between">
                {/* Left: title + value + trend */}
                <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-black text-muted uppercase tracking-[0.22em] mb-1.5 truncate">{title}</p>
                    <p className={`font-black text-main stat-number tracking-tight ${compact ? 'text-lg' : 'text-xl'}`}>
                        {value}
                    </p>
                    {/* Trend + subtitle row */}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {trend !== undefined && (
                            <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isPositive ? 'text-emerald-600 bg-emerald-500/10' :
                                    isNegative ? 'text-rose-500 bg-rose-500/10' :
                                        'text-muted bg-elevated'
                                }`}>
                                {isPositive && <TrendingUp size={9} />}
                                {isNegative && <TrendingDown size={9} />}
                                {trend >= 0 ? '+' : ''}{Math.abs(trend).toFixed(1)}%
                            </span>
                        )}
                        {subtitle && (
                            <span className="text-[8px] text-muted font-bold uppercase tracking-wider">{subtitle}</span>
                        )}
                    </div>
                </div>
                {/* Icon */}
                <div className={`${compact ? 'w-9 h-9' : 'w-10 h-10'} rounded-xl ${iconClass} flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110`}>
                    <Icon size={compact ? 16 : 18} />
                </div>
            </div>
        </div>
    );
};

export default StatCard;
