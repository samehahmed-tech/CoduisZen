import React, { memo, useEffect, useRef, useState } from 'react';
import { X, Command } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';

interface Shortcut {
    keys: string[];
    label: string;
    labelAr?: string;
}

const SHORTCUTS: { group: string; groupAr: string; items: Shortcut[] }[] = [
    {
        group: 'Navigation', groupAr: 'التنقل',
        items: [
            { keys: ['Ctrl', 'K'], label: 'Quick Search', labelAr: 'بحث سريع' },
            { keys: ['Ctrl', 'Shift', 'P'], label: 'POS', labelAr: 'نقطة البيع' },
            { keys: ['?'], label: 'Keyboard Shortcuts', labelAr: 'اختصارات لوحة المفاتيح' },
        ],
    },
    {
        group: 'Actions', groupAr: 'إجراءات',
        items: [
            { keys: ['Esc'], label: 'Close modal / drawer', labelAr: 'إغلاق النافذة' },
            { keys: ['?', '?'], label: 'Navigate lists', labelAr: 'تنقل في القوائم' },
            { keys: ['Enter'], label: 'Select / confirm', labelAr: 'اختيار / تأكيد' },
        ],
    },
    {
        group: 'Export', groupAr: 'تصدير',
        items: [
            { keys: ['Ctrl', 'E'], label: 'Export current view (if available)', labelAr: 'تصدير العرض الحالي' },
        ],
    },
];

const KeyboardShortcuts: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const isOpenRef = useRef(false);
    const lang = useAuthStore((state) => state.settings.language || 'en');

    useEffect(() => {
        isOpenRef.current = isOpen;
    }, [isOpen]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (
                event.key === '?'
                && !event.ctrlKey
                && !event.metaKey
                && !(event.target instanceof HTMLInputElement)
                && !(event.target instanceof HTMLTextAreaElement)
                && !(event.target instanceof HTMLSelectElement)
            ) {
                event.preventDefault();
                setIsOpen((prev) => !prev);
                return;
            }

            if (event.key === 'Escape' && isOpenRef.current) {
                setIsOpen(false);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    if (!isOpen) return null;

    return (
        <div className="theme-overlay fixed inset-0 z-[9990] flex items-center justify-center p-4" onClick={() => setIsOpen(false)}>
            <div className="theme-modal-panel w-full max-w-lg animate-in zoom-in-95 duration-200" onClick={(event) => event.stopPropagation()}>
                <div className="theme-modal-header p-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Command size={20} className="text-primary" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-main">{lang === 'ar' ? 'اختصارات لوحة المفاتيح' : 'Keyboard Shortcuts'}</h3>
                            <p className="text-[9px] text-muted font-bold uppercase tracking-widest">{lang === 'ar' ? 'اضغط ? لإغلاق' : 'Press ? to close'}</p>
                        </div>
                    </div>
                    <button onClick={() => setIsOpen(false)} className="theme-icon-button">
                        <X size={18} />
                    </button>
                </div>
                <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
                    {SHORTCUTS.map((group) => (
                        <div key={group.group}>
                            <h4 className="text-[9px] font-black text-muted uppercase tracking-[0.2em] mb-3">{lang === 'ar' ? group.groupAr : group.group}</h4>
                            <div className="space-y-2">
                                {group.items.map((shortcut, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 bg-elevated/55 rounded-xl border border-border/50">
                                        <span className="text-xs font-bold text-main">{lang === 'ar' ? shortcut.labelAr || shortcut.label : shortcut.label}</span>
                                        <div className="flex items-center gap-1">
                                            {shortcut.keys.map((key, j) => (
                                                <React.Fragment key={j}>
                                                    {j > 0 && <span className="text-[8px] text-muted">+</span>}
                                                    <kbd className="px-2 py-1 rounded-lg bg-card border border-border text-[10px] font-black text-muted min-w-[24px] text-center shadow-sm">{key}</kbd>
                                                </React.Fragment>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default memo(KeyboardShortcuts);
