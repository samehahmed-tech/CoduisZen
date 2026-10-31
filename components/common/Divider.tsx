import React from 'react';

interface DividerProps {
    label?: string;
    className?: string;
}

/**
 * Styled section divider, optionally with a centered label.
 *
 * Usage:
 *   <Divider />
 *   <Divider label="Or continue with" />
 */
const Divider: React.FC<DividerProps> = ({ label, className = '' }) => {
    if (!label) {
        return <div className={`w-full h-[1px] bg-border/50 my-4 ${className}`} />;
    }

    return (
        <div className={`flex items-center gap-3 my-4 ${className}`}>
            <div className="flex-1 h-[1px] bg-border/50" />
            <span className="text-[8px] font-black text-muted uppercase tracking-[0.2em] shrink-0">{label}</span>
            <div className="flex-1 h-[1px] bg-border/50" />
        </div>
    );
};

export default Divider;
