/**
 * POSShortcutsHelp — reusable keyboard shortcuts help modal (AR/EN).
 * Grouped, practical shortcuts for cashiers. Open via "?" button, F1, or Shift+/.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { X, Keyboard, Zap, LayoutGrid, CreditCard, Search } from 'lucide-react';

export interface ShortcutGroup {
    titleAr: string;
    titleEn: string;
    icon: React.ReactNode;
    items: Array<{ keys: string; ar: string; en: string }>;
}

export const POS_SHORTCUT_GROUPS: ShortcutGroup[] = [
    {
        titleAr: 'الصالة والطاولات',
        titleEn: 'Floor & Tables',
        icon: <LayoutGrid size={14} />,
        items: [
            { keys: '1…9', ar: 'اكتب رقم الطاولة للقفز إليها مباشرة', en: 'Type table number to jump to it' },
            { keys: 'Enter', ar: 'فتح الطاولة المكتوبة / المفلترة', en: 'Open typed / filtered table' },
            { keys: 'Esc', ar: 'رجوع لخريطة الصالة / مسح الرقم', en: 'Back to floor map / clear buffer' },
            { keys: 'Alt + ←/→', ar: 'التنقل بين الطاولات', en: 'Navigate between tables' },
            { keys: 'Alt + 0', ar: 'مغادرة الطاولة الحالية', en: 'Leave current table' },
        ],
    },
    {
        titleAr: 'الدفع والمطبخ',
        titleEn: 'Payment & Kitchen',
        icon: <CreditCard size={14} />,
        items: [
            { keys: 'Enter', ar: 'دفع سريع', en: 'Quick pay' },
            { keys: 'F2', ar: 'دفع سريع (بديل)', en: 'Quick pay (alt)' },
            { keys: 'Ctrl + Enter', ar: 'إرسال للمطبخ', en: 'Send to kitchen' },
            { keys: 'F9', ar: 'إرسال للمطبخ (بديل)', en: 'Send to kitchen (alt)' },
            { keys: 'Delete', ar: 'إلغاء / تصفير الطلب', en: 'Void order' },
        ],
    },
    {
        titleAr: 'بحث وتعليق',
        titleEn: 'Search & Hold',
        icon: <Search size={14} />,
        items: [
            { keys: '/', ar: 'التركيز على البحث', en: 'Focus search' },
            { keys: 'Ctrl + F', ar: 'التركيز على البحث (بديل)', en: 'Focus search (alt)' },
            { keys: 'Ctrl + K', ar: 'التركيز على البحث (بديل)', en: 'Focus search (alt)' },
            { keys: 'F3', ar: 'تعليق الطلب', en: 'Hold order' },
            { keys: 'Ctrl + H', ar: 'تعليق الطلب (بديل)', en: 'Hold order (alt)' },
            { keys: 'F4', ar: 'استدعاء الطلبات المعلقة', en: 'Recall held orders' },
            { keys: 'Alt + R', ar: 'استدعاء آخر طلب', en: 'Recall last order' },
        ],
    },
    {
        titleAr: 'أنواع الطلبات والمساعدة',
        titleEn: 'Order modes & Help',
        icon: <Zap size={14} />,
        items: [
            { keys: 'Alt + 1', ar: 'صالة', en: 'Dine-in' },
            { keys: 'Alt + 2', ar: 'تيك أواي', en: 'Takeaway' },
            { keys: 'Alt + 3', ar: 'استلام', en: 'Pickup' },
            { keys: 'Alt + 4', ar: 'دليفري', en: 'Delivery' },
            { keys: '?', ar: 'فتح دليل الاختصارات', en: 'Open this help' },
            { keys: 'F1', ar: 'فتح دليل الاختصارات (بديل)', en: 'Open this help (alt)' },
            { keys: '1…9', ar: 'التبديل بين الأقسام (داخل الطلب)', en: 'Switch categories (in order)' },
        ],
    },
];

interface POSShortcutsHelpProps {
    isOpen: boolean;
    onClose: () => void;
    lang: 'ar' | 'en';
}

const POSShortcutsHelp: React.FC<POSShortcutsHelpProps> = ({ isOpen, onClose, lang }) => {
    const isAr = lang === 'ar';

    React.useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' || e.key === 'F1') {
                e.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', onKey);
        // Lock body scroll while open
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;
    if (typeof document === 'undefined') return null;

    // Portal to <body>: escapes transformed/filtered ancestors (e.g. POSToolbar
    // has backdrop-blur + overflow-x-auto) which otherwise turn `fixed inset-0`
    // into a clipped box the size of the toolbar — showing only a thin slice.
    return createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" dir={isAr ? 'rtl' : 'ltr'} role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div
                className="relative w-full max-w-2xl max-h-[calc(100dvh-2rem)] overflow-hidden rounded-3xl border border-border bg-card shadow-2xl flex flex-col animate-in zoom-in-95 fade-in duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-3 border-b border-border/20 bg-elevated/40 px-5 py-4">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                            <Keyboard size={22} />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-main">
                                {isAr ? 'اختصارات لوحة المفاتيح' : 'Keyboard shortcuts'}
                            </h3>
                            <p className="text-[11px] font-bold text-muted">
                                {isAr ? 'اضغط ? أو F1 في أي وقت لفتح الدليل — Esc للإغلاق' : 'Press ? or F1 anytime to open — Esc to close'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label={isAr ? 'إغلاق' : 'Close'}
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-muted hover:text-main hover:bg-elevated transition-all active:scale-95"
                    >
                        <X size={18} />
                    </button>
                </div>
                <div className="overflow-y-auto p-5 grid gap-4 sm:grid-cols-2 flex-1 min-h-0">
                    {POS_SHORTCUT_GROUPS.map((group) => (
                        <div key={group.titleEn} className="rounded-2xl border border-border/30 bg-elevated/20 p-3">
                            <div className="flex items-center gap-2 mb-2 text-primary">
                                {group.icon}
                                <span className="text-[11px] font-black uppercase tracking-wider">
                                    {isAr ? group.titleAr : group.titleEn}
                                </span>
                            </div>
                            <div className="flex flex-col">
                                {group.items.map((s) => (
                                    <div key={`${group.titleEn}-${s.keys}-${s.en}`} className="flex items-center justify-between gap-2 px-1 py-1.5 border-b border-border/10 last:border-0">
                                        <span className="text-[11px] font-bold text-main leading-tight">{isAr ? s.ar : s.en}</span>
                                        <kbd className="shrink-0 rounded-lg border border-border bg-card px-2 py-0.5 font-mono text-[10px] font-black text-muted shadow-sm" dir="ltr">
                                            {s.keys}
                                        </kbd>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="border-t border-border/20 px-5 py-3 bg-elevated/20 shrink-0">
                    <p className="text-[10px] font-bold text-muted leading-relaxed">
                        {isAr
                            ? 'تلميح الصالة: اكتب رقم الطاولة (مثال: 12) من لوحة الأرقام وهي هتتفتح لوحدها بعد لحظة، أو اكتب في البحث واضغط Enter. الأرقام العربية (١٢٣) شغالة برضه.'
                            : 'Floor tip: type a table number (e.g. 12) and it opens automatically, or type in search + Enter. Arabic-Indic digits (١٢٣) also work.'}
                    </p>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default POSShortcutsHelp;
