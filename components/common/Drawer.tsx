import React, { useEffect } from 'react';
import { X } from 'lucide-react';

type DrawerSide = 'left' | 'right';
type DrawerSize = 'sm' | 'md' | 'lg' | 'xl';

interface DrawerProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    title?: string;
    subtitle?: string;
    side?: DrawerSide;
    size?: DrawerSize;
}

const SIZE_MAP: Record<DrawerSize, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
};

/**
 * Slide-in Drawer panel for forms, details, and previews.
 *
 * Usage:
 *   <Drawer isOpen={show} onClose={() => setShow(false)} title="Order Details" size="lg">
 *     <OrderForm />
 *   </Drawer>
 */
const Drawer: React.FC<DrawerProps> = ({ isOpen, onClose, children, title, subtitle, side = 'right', size = 'md' }) => {
    const borderSideClass = side === 'right' ? 'border-l' : 'border-r';

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handler);
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9995]" role="dialog" aria-modal="true" aria-label={title || 'Panel'}>
            {/* Backdrop */}
            <div className="theme-overlay modal-backdrop-enter absolute inset-0" onClick={onClose} />

            {/* Panel */}
            <div className={`theme-drawer-panel absolute top-0 ${side === 'right' ? 'right-0' : 'left-0'} h-full w-full ${SIZE_MAP[size]} ${borderSideClass} flex flex-col`}>
                {/* Header */}
                {(title || subtitle) && (
                    <div className="theme-modal-header flex items-center justify-between p-5 shrink-0">
                        <div className="min-w-0">
                            {title && <h2 className="text-[15px] font-extrabold text-main leading-snug">{title}</h2>}
                            {subtitle && <p className="ux-section-sub mt-0.5">{subtitle}</p>}
                        </div>
                        <button onClick={onClose} aria-label="Close panel" className="theme-icon-button touch-target shrink-0">
                            <X size={18} />
                        </button>
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Drawer;
