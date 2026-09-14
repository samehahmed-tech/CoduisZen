import React from 'react';

interface SectionHeaderProps {
    title: string;
    subtitle?: string;
    icon?: React.FC<{ size?: number; className?: string }>;
    action?: React.ReactNode;
}

/**
 * Reusable section header used across all modules.
 *
 * Usage:
 *   <SectionHeader title="Recent Orders" icon={ShoppingBag} action={<ExportButton ... />} />
 */
const SectionHeader: React.FC<SectionHeaderProps> = ({ title, subtitle, icon: Icon, action }) => (
    <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
            {Icon && <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0"><Icon size={16} /></span>}
            <div className="min-w-0">
                <h3 className="ux-section-title truncate">{title}</h3>
                {subtitle && <p className="ux-section-sub truncate">{subtitle}</p>}
            </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
    </div>
);

export default SectionHeader;
