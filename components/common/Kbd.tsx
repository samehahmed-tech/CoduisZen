import React from 'react';

interface KbdProps {
    children: string;
    size?: 'sm' | 'md';
}

/**
 * Keyboard shortcut display component.
 *
 * Usage:
 *   <Kbd>?K</Kbd>
 *   <Kbd>Ctrl</Kbd> + <Kbd>S</Kbd>
 */
const Kbd: React.FC<KbdProps> = ({ children, size = 'md' }) => {
    const sizeClass = size === 'sm' ? 'px-1 py-0.5 text-[7px]' : 'px-1.5 py-0.5 text-[8px]';
    return (
        <kbd className={`${sizeClass} font-mono font-bold text-muted bg-elevated border border-border rounded-md shadow-[0_1px_0_1px_rgb(var(--border-color)/0.3)] inline-flex items-center justify-center min-w-[1.3em]`}>
            {children}
        </kbd>
    );
};

export default Kbd;
