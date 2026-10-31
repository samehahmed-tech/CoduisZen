import React from 'react';

interface ToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string;
    description?: string;
    size?: 'sm' | 'md';
    disabled?: boolean;
}

/**
 * Styled toggle switch.
 * Usage:
 *   <Toggle checked={darkMode} onChange={setDarkMode} label="Dark Mode" description="Toggle dark theme" />
 */
const Toggle: React.FC<ToggleProps> = ({ checked, onChange, label, description, size = 'md', disabled = false }) => {
    const trackSize = size === 'sm' ? 'w-8 h-4' : 'w-10 h-5';
    const dotSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
    const dotTranslate = size === 'sm' ? (checked ? 'translate-x-4' : 'translate-x-0.5') : (checked ? 'translate-x-5' : 'translate-x-0.5');

    return (
        <label className={`flex items-center gap-3 group ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => !disabled && onChange(!checked)}
                disabled={disabled}
                className={`relative ${trackSize} rounded-full border transition-colors duration-150 ${checked ? 'bg-primary border-primary' : 'bg-elevated border-border'}`}
            >
                <span className={`absolute top-0.5 ${dotSize} bg-white rounded-full shadow-sm transition-transform duration-150 ${dotTranslate}`} />
            </button>
            {(label || description) && (
                <div>
                    {label && <span className="text-xs font-bold text-main block">{label}</span>}
                    {description && <span className="text-[9px] text-muted block">{description}</span>}
                </div>
            )}
        </label>
    );
};

export default Toggle;
