import React from 'react';

interface Tab {
    key: string;
    label: string;
    icon?: React.FC<{ size?: number; className?: string }>;
    count?: number;
    disabled?: boolean;
}

interface TabsProps {
    tabs: Tab[];
    activeTab: string;
    onChange: (key: string) => void;
    variant?: 'pills' | 'underline';
    size?: 'sm' | 'md';
}

/**
 * Reusable Tabs component with two visual variants.
 *
 * Usage:
 *   <Tabs
 *     tabs={[
 *       { key: 'list', label: 'List', icon: List, count: 12 },
 *       { key: 'grid', label: 'Grid', icon: Grid },
 *     ]}
 *     activeTab={tab}
 *     onChange={setTab}
 *     variant="pills"
 *   />
 */
const Tabs: React.FC<TabsProps> = ({ tabs, activeTab, onChange, variant = 'pills', size = 'md' }) => {
    const sizeClass = size === 'sm' ? 'text-[8px] py-1.5 px-2.5 gap-1' : 'text-[9px] py-2 px-3.5 gap-1.5';

    if (variant === 'underline') {
        return (
            <div className="flex border-b border-border/50 gap-1">
                {tabs.map(tab => {
                    const isActive = tab.key === activeTab;
                    const Icon = tab.icon;
                    return (
                        <button key={tab.key} onClick={() => !tab.disabled && onChange(tab.key)} disabled={tab.disabled}
                            className={`flex items-center ${sizeClass} font-black uppercase tracking-widest border-b-2 transition-all ${isActive ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-main'} ${tab.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                            {Icon && <Icon size={size === 'sm' ? 12 : 14} />}
                            {tab.label}
                            {tab.count !== undefined && (
                                <span className={`ml-1 px-1.5 py-0.5 rounded-md text-[7px] font-black ${isActive ? 'bg-primary/10 text-primary' : 'bg-elevated text-muted'}`}>{tab.count}</span>
                            )}
                        </button>
                    );
                })}
            </div>
        );
    }

    // Pills variant (default)
    return (
        <div className="flex gap-1 p-1 bg-elevated/40 rounded-2xl border border-border/30">
            {tabs.map(tab => {
                const isActive = tab.key === activeTab;
                const Icon = tab.icon;
                return (
                    <button key={tab.key} onClick={() => !tab.disabled && onChange(tab.key)} disabled={tab.disabled}
                        className={`flex items-center ${sizeClass} font-black uppercase tracking-widest rounded-xl transition-all ${isActive ? 'bg-card text-primary shadow-sm border border-border/50' : 'text-muted hover:text-main'} ${tab.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                        {Icon && <Icon size={size === 'sm' ? 12 : 14} />}
                        {tab.label}
                        {tab.count !== undefined && (
                            <span className={`ml-1 px-1.5 py-0.5 rounded-md text-[7px] font-black ${isActive ? 'bg-primary/10 text-primary' : 'bg-app text-muted'}`}>{tab.count}</span>
                        )}
                    </button>
                );
            })}
        </div>
    );
};

export default Tabs;
