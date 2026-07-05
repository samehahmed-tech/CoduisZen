
import React, { useState } from 'react';
import { X, DollarSign, Percent, Eye, EyeOff, Trash2, Copy, Archive } from 'lucide-react';
import { MenuItem } from '../../types';

interface Props {
    selectedCount: number;
    onApply: (changes: Partial<MenuItem>) => void;
    onClearSelection: () => void;
    lang: string;
    currency: string;
}

const BulkActionsBar: React.FC<Props> = ({ selectedCount, onApply, onClearSelection, lang, currency }) => {
    const [action, setAction] = useState<'price-percent' | 'price-amount' | null>(null);
    const [value, setValue] = useState('');
    const [showConfirm, setShowConfirm] = useState(false);

    const handleApply = () => {
        const num = parseFloat(value);
        if (isNaN(num)) return;
        if (action === 'price-amount') onApply({ price: num } as any);
        if (action === 'price-percent') onApply({ _bulkPricePercent: num } as any);
        setAction(null);
        setValue('');
    };

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] animate-in slide-in-from-bottom duration-150">
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-border/30 rounded-lg shadow-lg px-4 py-3 flex items-center gap-3">
                {/* Count */}
                <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded bg-blue-100 dark:bg-indigo-500/10 text-blue-700 dark:text-indigo-400 flex items-center justify-center text-[12px] font-semibold">
                        {selectedCount}
                    </span>
                    <span className="text-[12px] font-medium text-gray-500 dark:text-muted">{lang === 'ar' ? 'عنصر محدد' : 'selected'}</span>
                </div>

                <div className="w-px h-5 bg-gray-200 dark:bg-elevated/60" />

                {/* Price Actions */}
                <button onClick={() => setAction(action === 'price-percent' ? null : 'price-percent')} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors ${action === 'price-percent' ? 'bg-blue-50 dark:bg-indigo-500/10 text-blue-600 dark:text-indigo-400' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-elevated/40'}`}>
                    <Percent size={13} /> {lang === 'ar' ? 'نسبة' : '% Price'}
                </button>
                <button onClick={() => setAction(action === 'price-amount' ? null : 'price-amount')} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors ${action === 'price-amount' ? 'bg-blue-50 dark:bg-indigo-500/10 text-blue-600 dark:text-indigo-400' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-elevated/40'}`}>
                    <DollarSign size={13} /> {lang === 'ar' ? 'سعر' : 'Set Price'}
                </button>

                <div className="w-px h-5 bg-gray-200 dark:bg-elevated/60" />

                {/* Status */}
                <button onClick={() => onApply({ isAvailable: true })} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-emerald-600 dark:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors">
                    <Eye size={13} /> {lang === 'ar' ? 'تفعيل' : 'Activate'}
                </button>
                <button onClick={() => onApply({ isAvailable: false })} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-red-600 dark:text-rose-500 hover:bg-red-50 dark:hover:bg-rose-500/10 transition-colors">
                    <EyeOff size={13} /> {lang === 'ar' ? 'إيقاف' : 'Deactivate'}
                </button>

                <div className="w-px h-5 bg-gray-200 dark:bg-elevated/60" />

                {/* Delete */}
                <button onClick={() => setShowConfirm(true)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-rose-500/10 transition-colors">
                    <Trash2 size={13} /> {lang === 'ar' ? 'حذف' : 'Delete'}
                </button>

                {/* Value Input */}
                {action && (
                    <>
                        <div className="w-px h-5 bg-gray-200 dark:bg-elevated/60" />
                        <input
                            type="number"
                            value={value}
                            onChange={e => setValue(e.target.value)}
                            placeholder={action === 'price-percent' ? '+5 or -10' : '0.00'}
                            className="w-20 h-8 px-2 bg-gray-50 dark:bg-elevated/50 border border-gray-200 dark:border-border/30 rounded-md text-[12px] text-gray-800 dark:text-main outline-none focus:border-blue-400 dark:focus:border-indigo-500/50 placeholder:text-gray-300 dark:placeholder:text-muted/40"
                            autoFocus
                        />
                        <button onClick={handleApply} disabled={!value} className="h-8 px-3 bg-blue-600 dark:bg-indigo-500 text-white rounded-md text-[11px] font-medium disabled:opacity-40 transition-colors">
                            {lang === 'ar' ? 'تطبيق' : 'Apply'}
                        </button>
                    </>
                )}

                {/* Delete Confirmation */}
                {showConfirm && (
                    <>
                        <div className="w-px h-5 bg-gray-200 dark:bg-elevated/60" />
                        <span className="text-[11px] text-red-600 dark:text-rose-400">{lang === 'ar' ? `حذف ${selectedCount}؟` : `Delete ${selectedCount}?`}</span>
                        <button onClick={() => { onApply({ _bulkDelete: true } as any); setShowConfirm(false); }} className="h-7 px-2.5 bg-red-500 text-white rounded text-[11px] font-medium">{lang === 'ar' ? 'تأكيد' : 'Confirm'}</button>
                        <button onClick={() => setShowConfirm(false)} className="h-7 px-2 text-gray-400 text-[11px]">{lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
                    </>
                )}

                <div className="w-px h-5 bg-gray-200 dark:bg-elevated/60" />

                {/* Close */}
                <button onClick={onClearSelection} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-elevated/40 rounded transition-colors">
                    <X size={15} />
                </button>
            </div>
        </div>
    );
};

export default BulkActionsBar;
