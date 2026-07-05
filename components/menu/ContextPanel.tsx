
import React from 'react';
import {
    ChevronLeft, ChevronRight, TrendingDown, AlertTriangle,
    Flame, Plus, CheckSquare
} from 'lucide-react';
import { MenuItem } from '../../types';

interface Props {
    isOpen: boolean;
    onToggle: () => void;
    allItems: (MenuItem & { _categoryName: string })[];
    totalRevenue: number;
    avgMargin: number;
    lang: string;
    currency: string;
    onNewItem: () => void;
    onToggleMultiSelect: () => void;
}

const ContextPanel: React.FC<Props> = ({
    isOpen, onToggle, allItems, totalRevenue, avgMargin,
    lang, currency, onNewItem, onToggleMultiSelect
}) => {
    const activeItems = allItems.filter(i => i.isAvailable && !i.archivedAt);
    const inactiveItems = allItems.filter(i => !i.isAvailable && !i.archivedAt);
    const itemsWithCost = allItems.filter(i => i.cost && i.price > 0);

    const notSelling = activeItems.filter(i => (i.salesData?.last30 || 0) === 0);
    const lowMargin = itemsWithCost.filter(i => ((i.price - (i.cost || 0)) / i.price) * 100 < 30);
    const topSellers = [...allItems].sort((a, b) => (b.salesData?.last30 || 0) - (a.salesData?.last30 || 0)).slice(0, 3);

    if (!isOpen) {
        return (
            <div className="w-10 border-r border-gray-200 dark:border-white/[0.04] bg-gray-50 dark:bg-card/50 flex flex-col items-center pt-4 shrink-0">
                <button
                    onClick={onToggle}
                    className="p-1.5 rounded text-gray-400 dark:text-muted/50 hover:text-gray-700 dark:hover:text-main hover:bg-gray-100 dark:hover:bg-elevated/40 transition-colors"
                >
                    <ChevronRight size={14} />
                </button>
            </div>
        );
    }

    return (
        <div className="w-56 border-r border-gray-200 dark:border-white/[0.04] bg-gray-50/50 dark:bg-card/30 flex flex-col shrink-0 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.04] flex items-center justify-between">
                <span className="text-[12px] font-semibold text-gray-700 dark:text-main">
                    {lang === 'ar' ? 'صحة المنيو' : 'Menu Health'}
                </span>
                <button onClick={onToggle} className="p-1 rounded text-gray-400 dark:text-muted/50 hover:text-gray-700 dark:hover:text-main transition-colors">
                    <ChevronLeft size={14} />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5 no-scrollbar">

                {/* Quick Stats */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white dark:bg-elevated/50 rounded-md p-2.5 border border-gray-100 dark:border-white/[0.04]">
                        <p className="text-[10px] text-gray-400 dark:text-muted/60">{lang === 'ar' ? 'نشط' : 'Active'}</p>
                        <p className="text-[14px] font-semibold text-gray-800 dark:text-main">{activeItems.length}</p>
                    </div>
                    <div className="bg-white dark:bg-elevated/50 rounded-md p-2.5 border border-gray-100 dark:border-white/[0.04]">
                        <p className="text-[10px] text-gray-400 dark:text-muted/60">{lang === 'ar' ? 'غير نشط' : 'Inactive'}</p>
                        <p className="text-[14px] font-semibold text-gray-500 dark:text-muted">{inactiveItems.length}</p>
                    </div>
                </div>

                {/* Issues (Clickable filters) */}
                {(notSelling.length > 0 || lowMargin.length > 0) && (
                    <div className="space-y-1.5">
                        <p className="text-[10px] font-semibold text-gray-400 dark:text-muted/50 uppercase tracking-wider">
                            {lang === 'ar' ? 'يحتاج مراجعة' : 'Needs Attention'}
                        </p>
                        {notSelling.length > 0 && (
                            <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/10 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-500/10 transition-colors">
                                <TrendingDown size={12} className="text-amber-600 dark:text-amber-500 shrink-0" />
                                <span className="text-[11px] text-amber-700 dark:text-amber-400">
                                    <strong>{notSelling.length}</strong> {lang === 'ar' ? 'لا يُباع (30 يوم)' : 'not selling (30D)'}
                                </span>
                            </div>
                        )}
                        {lowMargin.length > 0 && (
                            <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-red-50 dark:bg-rose-500/5 border border-red-200 dark:border-rose-500/10 cursor-pointer hover:bg-red-100 dark:hover:bg-rose-500/10 transition-colors">
                                <AlertTriangle size={12} className="text-red-600 dark:text-rose-500 shrink-0" />
                                <span className="text-[11px] text-red-700 dark:text-rose-400">
                                    <strong>{lowMargin.length}</strong> {lang === 'ar' ? 'هامش منخفض' : 'low margin'}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Top Sellers */}
                {topSellers.some(i => (i.salesData?.last30 || 0) > 0) && (
                    <div className="space-y-1.5">
                        <p className="text-[10px] font-semibold text-gray-400 dark:text-muted/50 uppercase tracking-wider">
                            {lang === 'ar' ? 'الأكثر مبيعاً' : 'Top Sellers'}
                        </p>
                        {topSellers.filter(i => (i.salesData?.last30 || 0) > 0).map(item => (
                            <div key={item.id} className="flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-white/[0.03] transition-colors">
                                <p className="text-[11px] text-gray-700 dark:text-main truncate pr-2">{item.name}</p>
                                <span className="text-[10px] text-gray-400 dark:text-muted/60 shrink-0">{item.salesData?.last30}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Quick Actions */}
                <div className="space-y-1 pt-2 border-t border-gray-100 dark:border-white/[0.04]">
                    <button onClick={onNewItem} className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-[11px] font-medium text-blue-600 dark:text-indigo-400 hover:bg-blue-50 dark:hover:bg-indigo-500/10 transition-colors text-left">
                        <Plus size={13} /> {lang === 'ar' ? 'إضافة صنف' : 'Add Item'}
                    </button>
                    <button onClick={onToggleMultiSelect} className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-[11px] font-medium text-gray-500 dark:text-muted/70 hover:bg-gray-100 dark:hover:bg-white/[0.03] transition-colors text-left">
                        <CheckSquare size={13} /> {lang === 'ar' ? 'تحديد متعدد' : 'Bulk Select'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ContextPanel;
