import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertTriangle, Trash2, CheckCircle2, X } from 'lucide-react';

type ConfirmVariant = 'danger' | 'warning' | 'info';

interface ConfirmOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: ConfirmVariant;
}

interface ConfirmContextValue {
    confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export const useConfirm = (): ConfirmContextValue => {
    const ctx = useContext(ConfirmContext);
    if (!ctx) return { confirm: async () => false };
    return ctx;
};

const VARIANT_STYLES: Record<ConfirmVariant, { icon: React.FC<{ size?: number; className?: string }>; iconColor: string; iconBg: string; btnColor: string }> = {
    danger: { icon: Trash2, iconColor: 'text-rose-500', iconBg: 'bg-rose-500/10', btnColor: 'bg-rose-500 hover:bg-rose-600' },
    warning: { icon: AlertTriangle, iconColor: 'text-amber-500', iconBg: 'bg-amber-500/10', btnColor: 'bg-amber-500 hover:bg-amber-600' },
    info: { icon: CheckCircle2, iconColor: 'text-blue-500', iconBg: 'bg-blue-500/10', btnColor: 'bg-blue-500 hover:bg-blue-600' },
};

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, setState] = useState<{ options: ConfirmOptions; resolve: (val: boolean) => void } | null>(null);

    const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
        return new Promise(resolve => setState({ options, resolve }));
    }, []);

    const handleClose = (result: boolean) => {
        state?.resolve(result);
        setState(null);
    };

    const variant = state?.options.variant || 'danger';
    const style = VARIANT_STYLES[variant];
    const Icon = style.icon;

    return (
        <ConfirmContext.Provider value={{ confirm }}>
            {children}
            {state && (
                <div className="fixed inset-0 bg-black/60  z-[9998] flex items-center justify-center p-4" onClick={() => handleClose(false)}>
                    <div className="bg-card border border-border rounded-[2rem] w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="p-6 text-center">
                            <div className={`w-14 h-14 rounded-2xl ${style.iconBg} flex items-center justify-center mx-auto mb-4`}>
                                <Icon size={28} className={style.iconColor} />
                            </div>
                            <h3 className="text-lg font-black text-main mb-2">{state.options.title}</h3>
                            <p className="text-sm text-muted leading-relaxed">{state.options.message}</p>
                        </div>
                        <div className="p-4 border-t border-border flex gap-3">
                            <button onClick={() => handleClose(false)}
                                className="flex-1 py-3 bg-app border border-border rounded-xl text-xs font-black text-muted uppercase tracking-widest hover:text-main transition-colors">
                                {state.options.cancelText || 'Cancel'}
                            </button>
                            <button onClick={() => handleClose(true)}
                                className={`flex-1 py-3 ${style.btnColor} text-white rounded-xl text-xs font-black uppercase tracking-widest transition-colors`}>
                                {state.options.confirmText || 'Confirm'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmContext.Provider>
    );
};

export default ConfirmProvider;
