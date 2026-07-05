import React from 'react';

interface TimelineItem {
    key: string;
    title: string;
    description?: string;
    time?: string;
    icon?: React.FC<{ size?: number; className?: string }>;
    color?: 'primary' | 'emerald' | 'rose' | 'amber' | 'indigo';
}

interface TimelineProps {
    items: TimelineItem[];
}

const COLORS: Record<string, string> = {
    primary: 'bg-primary border-primary/20',
    emerald: 'bg-emerald-500 border-emerald-500/20',
    rose: 'bg-rose-500 border-rose-500/20',
    amber: 'bg-amber-500 border-amber-500/20',
    indigo: 'bg-indigo-500 border-indigo-500/20',
};

/**
 * Vertical timeline for activity logs, order history, audit trails.
 *
 * Usage:
 *   <Timeline items={[{ key: '1', title: 'Order placed', time: '2m ago', color: 'emerald' }]} />
 */
const Timeline: React.FC<TimelineProps> = ({ items }) => (
    <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[11px] top-2 bottom-2 w-[2px] bg-border/30" />
        <div className="space-y-4">
            {items.map((item, i) => {
                const Icon = item.icon;
                const color = item.color || 'primary';
                return (
                    <div key={item.key} className="flex gap-3 relative">
                        <div className={`w-6 h-6 rounded-full ${COLORS[color]} flex items-center justify-center shrink-0 z-10 border-2`}>
                            {Icon ? <Icon size={10} className="text-white" /> : <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <div className="flex-1 pb-1">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-bold text-main">{item.title}</p>
                                {item.time && <span className="text-[8px] font-bold text-muted">{item.time}</span>}
                            </div>
                            {item.description && <p className="text-[8px] text-muted mt-0.5">{item.description}</p>}
                        </div>
                    </div>
                );
            })}
        </div>
    </div>
);

export default Timeline;
