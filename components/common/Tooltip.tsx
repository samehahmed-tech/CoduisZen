import React, { useState, useRef } from 'react';

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
    content: string;
    children: React.ReactNode;
    position?: TooltipPosition;
    delay?: number;
}

const POSITION_CLASSES: Record<TooltipPosition, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

const ARROW_CLASSES: Record<TooltipPosition, string> = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-slate-900 dark:border-t-slate-700 border-x-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-slate-900 dark:border-b-slate-700 border-x-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-slate-900 dark:border-l-slate-700 border-y-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-slate-900 dark:border-r-slate-700 border-y-transparent border-l-transparent',
};

/**
 * Lightweight Tooltip component.
 *
 * Usage:
 *   <Tooltip content="Click to save" position="top">
 *     <button>Save</button>
 *   </Tooltip>
 */
const Tooltip: React.FC<TooltipProps> = ({ content, children, position = 'top', delay = 200 }) => {
    const [visible, setVisible] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const show = () => {
        timerRef.current = setTimeout(() => setVisible(true), delay);
    };

    const hide = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setVisible(false);
    };

    return (
        <div className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
            {children}
            {visible && (
                <div role="tooltip" className={`absolute z-[200] ${POSITION_CLASSES[position]} pointer-events-none animate-scale-in`}>
                    <div className="theme-tooltip px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap max-w-[240px]">
                        {content}
                    </div>
                    <div className={`absolute w-0 h-0 border-[4px] ${ARROW_CLASSES[position]}`} />
                </div>
            )}
        </div>
    );
};

export default Tooltip;
