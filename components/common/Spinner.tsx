import React from 'react';
import { Loader2 } from 'lucide-react';

interface SpinnerProps {
    size?: 'sm' | 'md' | 'lg';
    label?: string;
    fullPage?: boolean;
}

const SIZES = { sm: 16, md: 24, lg: 36 };

/**
 * Loading spinner with optional label and fullPage overlay mode.
 *
 * Usage:
 *   <Spinner />
 *   <Spinner size="lg" label="Loading orders..." />
 *   <Spinner fullPage label="Please wait..." />
 */
const Spinner: React.FC<SpinnerProps> = ({ size = 'md', label, fullPage = false }) => {
    const content = (
        <div className="flex flex-col items-center justify-center gap-2">
            <Loader2 size={SIZES[size]} className="animate-spin text-primary" />
            {label && <span className="text-[9px] font-black text-muted uppercase tracking-widest">{label}</span>}
        </div>
    );

    if (fullPage) {
        return (
            <div className="fixed inset-0 z-[9990] bg-app/80  flex items-center justify-center">
                {content}
            </div>
        );
    }

    return <div className="flex items-center justify-center py-8">{content}</div>;
};

export default Spinner;
