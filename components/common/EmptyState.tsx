import React from 'react';
import { Package, Users, FileText, Search, ShoppingBag, BarChart3, Inbox } from 'lucide-react';

interface EmptyStateProps {
    icon?: React.FC<{ size?: number; className?: string }>;
    title: string;
    subtitle?: string;
    action?: { label: string; onClick: () => void };
    type?: 'data' | 'search' | 'orders' | 'customers' | 'reports' | 'inbox';
    compact?: boolean;
}

const TYPE_ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
    data: Package,
    search: Search,
    orders: ShoppingBag,
    customers: Users,
    reports: BarChart3,
    inbox: Inbox,
};

/**
 * Reusable EmptyState for tables, lists, and pages with no data.
 *
 * Usage:
 *   <EmptyState type="orders" title="No orders yet" subtitle="New orders will appear here" />
 *   <EmptyState type="search" title="No results" action={{ label: 'Clear filters', onClick: reset }} />
 */
const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, subtitle, action, type = 'data', compact = false }) => {
    const Icon = icon || TYPE_ICONS[type] || Package;

    return (
        <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8 px-3' : 'py-16 px-4'}`}>
            {/* Premium icon container */}
            <div className="empty-state-icon">
                <Icon size={compact ? 22 : 26} className="text-muted opacity-50" />
            </div>

            {/* Glow dot decoration */}
            <div className="w-1.5 h-1.5 rounded-full bg-primary/30 mb-3 mx-auto" />

            <h3 className={`font-black text-main mb-1 ${compact ? 'text-xs' : 'text-sm'}`}>{title}</h3>
            {subtitle && (
                <p className={`text-muted max-w-xs leading-relaxed ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
                    {subtitle}
                </p>
            )}
            {action && (
                <button
                    onClick={action.onClick}
                    className="mt-4 px-5 py-2 bg-primary/10 text-primary border border-primary/20 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary/15 transition-all duration-150"
                >
                    {action.label}
                </button>
            )}
        </div>
    );
};

export default EmptyState;
