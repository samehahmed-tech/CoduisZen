import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { AlertTriangle, Info, CheckCircle, X, AlertCircle } from 'lucide-react';

type ModalType = 'confirm' | 'alert' | 'danger' | 'info';

interface ModalConfig {
    title: string;
    message: string;
    type?: ModalType;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
}

interface ModalContextValue {
    showModal: (config: ModalConfig) => void;
    confirm: (title: string, message: string) => Promise<boolean>;
}

const ModalContext = createContext<ModalContextValue | null>(null);

export const useModal = () => {
    const context = useContext(ModalContext);
    if (!context) throw new Error('useModal must be used within ModalProvider');
    return context;
};

const ICONS = {
    confirm: AlertTriangle,
    alert: Info,
    danger: AlertCircle,
    info: CheckCircle
};

const COLORS = {
    confirm: { bg: 'bg-amber-500', ring: 'ring-amber-500/20' },
    alert: { bg: 'bg-blue-500', ring: 'ring-blue-500/20' },
    danger: { bg: 'bg-rose-500', ring: 'ring-rose-500/20' },
    info: { bg: 'bg-emerald-500', ring: 'ring-emerald-500/20' }
};

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [modal, setModal] = useState<ModalConfig | null>(null);
    const [resolvePromise, setResolvePromise] = useState<((value: boolean) => void) | null>(null);

    const showModal = useCallback((config: ModalConfig) => {
        setModal(config);
    }, []);

    const confirm = useCallback((title: string, message: string): Promise<boolean> => {
        return new Promise((resolve) => {
            setResolvePromise(() => resolve);
            setModal({
                title,
                message,
                type: 'confirm',
                confirmText: 'Confirm',
                cancelText: 'Cancel'
            });
        });
    }, []);

    const handleConfirm = () => {
        modal?.onConfirm?.();
        resolvePromise?.(true);
        setModal(null);
        setResolvePromise(null);
    };

    const handleCancel = () => {
        modal?.onCancel?.();
        resolvePromise?.(false);
        setModal(null);
        setResolvePromise(null);
    };

    const type = modal?.type || 'confirm';
    const Icon = ICONS[type];
    const colors = COLORS[type];

    React.useEffect(() => {
        if (!modal) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleCancel(); };
        document.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
    }, [modal]);

    return (
        <ModalContext.Provider value={{ showModal, confirm }}>
            {children}

            {/* Modal Overlay */}
            {modal && (
                <div
                    role="dialog" aria-modal="true" aria-label={modal.title}
                    className="fixed inset-0 z-[9998] bg-black/60 theme-overlay flex items-center justify-center p-4 modal-backdrop-enter"
                    onClick={handleCancel}
                >
                    <div
                        className="theme-modal-panel card-primary rounded-3xl shadow-2xl max-w-md w-full p-6 modal-glass-enter"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Icon Header */}
                        <div className="flex items-center gap-4 mb-4">
                            <div className={`w-12 h-12 ${colors.bg} rounded-2xl flex items-center justify-center ring-8 ${colors.ring}`}>
                                <Icon size={24} className="text-white" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-black text-slate-900 dark:text-white">{modal.title}</h3>
                            </div>
                            <button
                                onClick={handleCancel}
                                className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Message */}
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
                            {modal.message}
                        </p>

                        {/* Actions */}
                        <div className="flex gap-3">
                            <button
                                onClick={handleCancel}
                                className="ux-btn ux-btn-secondary flex-1 !min-h-[44px] text-sm"
                            >
                                {modal.cancelText || 'Cancel'}
                            </button>
                            <button
                                onClick={handleConfirm}
                                autoFocus
                                className={`ux-btn flex-1 !min-h-[44px] text-white text-sm ${type === 'danger' ? 'ux-btn-danger' : ''}`}
                                style={type !== 'danger' ? { background: colors.bg } : undefined}
                            >
                                {modal.confirmText || 'Confirm'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ModalContext.Provider>
    );
};

export default ModalProvider;
