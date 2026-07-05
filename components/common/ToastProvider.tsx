import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: string;
    type: ToastType;
    message: string;
    duration?: number;
}

interface ToastContextValue {
    toast: (type: ToastType, message: string, duration?: number) => void;
    showToast: (message: string, type?: ToastType, duration?: number) => void;
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
    info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
    const ctx = useContext(ToastContext);
    if (!ctx) return {
        toast: () => { }, showToast: () => { }, success: () => { }, error: () => { }, warning: () => { }, info: () => { },
    };
    return ctx;
};

const ICONS: Record<ToastType, React.FC<{ size?: number; className?: string }>> = {
    success: CheckCircle2,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
};

const STYLES: Record<ToastType, { border: string; icon: string; bg: string }> = {
    success: { border: 'border-emerald-500/30', icon: 'text-emerald-500', bg: 'bg-emerald-500/5' },
    error: { border: 'border-rose-500/30', icon: 'text-rose-500', bg: 'bg-rose-500/5' },
    warning: { border: 'border-amber-500/30', icon: 'text-amber-500', bg: 'bg-amber-500/5' },
    info: { border: 'border-blue-500/30', icon: 'text-blue-500', bg: 'bg-blue-500/5' },
};

const ToastItem: React.FC<{ toast: Toast; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
    const [exiting, setExiting] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const style = STYLES[toast.type];
    const Icon = ICONS[toast.type];

    useEffect(() => {
        timerRef.current = setTimeout(() => {
            setExiting(true);
            setTimeout(() => onDismiss(toast.id), 300);
        }, toast.duration || 4000);
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [toast.id, toast.duration, onDismiss]);

    return (
        <div className={`theme-toast flex items-center gap-3 px-4 py-3 border ${style.border} max-w-sm w-full transition-all duration-150 ${exiting ? 'opacity-0 translate-x-8 scale-95' : 'opacity-100 translate-x-0 scale-100'}`}
            style={{ animation: exiting ? undefined : 'slideInRight 0.3s ease-out' }}>
            <div className={`p-1.5 rounded-xl ${style.bg}`}>
                <Icon size={16} className={style.icon} />
            </div>
            <p className="text-xs font-bold text-main flex-1 leading-relaxed">{toast.message}</p>
            <button onClick={() => { setExiting(true); setTimeout(() => onDismiss(toast.id), 300); }}
                className="theme-icon-button p-1 shrink-0">
                <X size={12} />
            </button>
        </div>
    );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const dismiss = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const addToast = useCallback((type: ToastType, message: string, duration?: number) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        setToasts(prev => [...prev.slice(-4), { id, type, message, duration }]);
    }, []);

    const showToast = useCallback((message: string, type: ToastType = 'info', duration?: number) => {
        addToast(type, message, duration);
    }, [addToast]);

    const value: ToastContextValue = {
        toast: addToast,
        showToast,
        success: useCallback((msg: string) => addToast('success', msg), [addToast]),
        error: useCallback((msg: string) => addToast('error', msg, 6000), [addToast]),
        warning: useCallback((msg: string) => addToast('warning', msg, 5000), [addToast]),
        info: useCallback((msg: string) => addToast('info', msg), [addToast]),
    };

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: '360px' }}>
                {toasts.map(t => (
                    <div key={t.id} className="pointer-events-auto">
                        <ToastItem toast={t} onDismiss={dismiss} />
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export default ToastProvider;
