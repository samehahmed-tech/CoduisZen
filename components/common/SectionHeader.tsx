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
    <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
            {Icon && <Icon size={16} className="text-primary" />}
            <div>
                <h3 className="text-[11px] font-black text-muted uppercase tracking-[0.2em]">{title}</h3>
                {subtitle && <p className="text-[8px] text-muted/60 font-bold mt-0.5">{subtitle}</p>}
            </div>
        </div>
        {action && <div>{action}</div>}
    </div>
);

export default SectionHeader;
