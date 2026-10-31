
import React from 'react';
import {
    TrendingUp, TrendingDown, BarChart3, Flame,
    AlertTriangle, ArrowUp, ArrowDown
} from 'lucide-react';
import { MenuItem } from '../../types';

interface Props {
    items: (MenuItem & { _categoryName: string })[];
    lang: string;
    currency: string;
}

const AnalyticsPanel: React.FC<Props> = ({ items, lang, currency }) => {
    const totalRevenue = items.reduce((s, i) => s + (i.salesData?.revenue30 || 0), 0);
    const totalSales = items.reduce((s, i) => s + (i.salesData?.last30 || 0), 0);
    const itemsWithCost = items.filter(i => i.cost && i.price > 0);
    const avgMargin = itemsWithCost.length > 0
        ? itemsWithCost.reduce((s, i) => s + ((i.price - (i.cost || 0)) / i.price) * 100, 0) / itemsWithCost.length
        : 0;

    const marginColor = (m: number) => m >= 50 ? 'text-emerald-600 dark:text-emerald-500' : m >= 30 ? 'text-amber-600 dark:text-amber-500' : 'text-red-600 dark:text-rose-500';
    const marginBg = (m: number) => m >= 50 ? 'bg-emerald-50 dark:bg-emerald-500/10' : m >= 30 ? 'bg-amber-50 dark:bg-amber-500/10' : 'bg-red-50 dark:bg-rose-500/10';

    // Top sellers
    const topSellers = [...items].sort((a, b) => (b.salesData?.revenue30 || 0) - (a.salesData?.revenue30 || 0)).filter(i => (i.salesData?.revenue30 || 0) > 0).slice(0, 8);

    // Low margin items
    const lowMarginItems = itemsWithCost.filter(i => ((i.price - (i.cost || 0)) / i.price) * 100 < 30).sort((a, b) => {
        const ma = ((a.price - (a.cost || 0)) / a.price) * 100;
        const mb = ((b.price - (b.cost || 0)) / b.price) * 100;
        return ma - mb;
    }).slice(0, 6);

    // Not selling items
    const notSelling = items.filter(i => i.isAvailable && (i.salesData?.last30 || 0) === 0 && !i.archivedAt).slice(0, 6);

    // Sales summary
    const avgDailyRevenue = totalRevenue / 30;
    const estimated7D = avgDailyRevenue * 7;

    return (
        <div className="space-y-5 max-w-[1200px]">

            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-white dark:bg-card rounded-lg border border-gray-200 dark:border-border/20 p-4">
                    <p className="text-[11px] text-gray-400 dark:text-muted/60">{lang === 'ar' ? 'إجمالي المبيعات (30 يوم)' : 'Total Sales (30D)'}</p>
                    <p className="text-[20px] font-semibold text-gray-800 dark:text-main mt-1">{totalSales.toLocaleString()}</p>
                </div>
                <div className="bg-white dark:bg-card rounded-lg border border-gray-200 dark:border-border/20 p-4">
                    <p className="text-[11px] text-gray-400 dark:text-muted/60">{lang === 'ar' ? 'الإيرادات (30 يوم)' : 'Revenue (30D)'}</p>
                    <p className="text-[20px] font-semibold text-gray-800 dark:text-main mt-1">{currency}{totalRevenue.toLocaleString()}</p>
                </div>
                <div className="bg-white dark:bg-card rounded-lg border border-gray-200 dark:border-border/20 p-4">
                    <p className="text-[11px] text-gray-400 dark:text-muted/60">{lang === 'ar' ? 'متوسط الهامش' : 'Average Margin'}</p>
                    <p className={`text-[20px] font-semibold mt-1 ${marginColor(avgMargin)}`}>{avgMargin.toFixed(1)}%</p>
                </div>
                <div className="bg-white dark:bg-card rounded-lg border border-gray-200 dark:border-border/20 p-4">
                    <p className="text-[11px] text-gray-400 dark:text-muted/60">{lang === 'ar' ? 'المتوسط اليومي' : 'Daily Average'}</p>
                    <p className="text-[20px] font-semibold text-gray-800 dark:text-main mt-1">{currency}{avgDailyRevenue.toFixed(0)}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                {/* Top Sellers */}
                <div className="bg-white dark:bg-card rounded-lg border border-gray-200 dark:border-border/20 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.04]">
                        <h3 className="text-[12px] font-semibold text-gray-700 dark:text-main">{lang === 'ar' ? 'الأكثر مبيعاً' : 'Top Sellers'}</h3>
                    </div>
                    <div className="divide-y divide-gray-50 dark:divide-white/[0.03]">
                        {topSellers.length > 0 ? topSellers.map((item, idx) => (
                            <div key={item.id} className="px-4 py-2.5 flex items-center gap-3">
                                <span className="text-[11px] font-medium text-gray-400 dark:text-muted/50 w-5 shrink-0">{idx + 1}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[12px] font-medium text-gray-700 dark:text-main truncate">{item.name}</p>
                                    <p className="text-[10px] text-gray-400 dark:text-muted/50">{item._categoryName}</p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-[12px] font-medium text-gray-700 dark:text-main">{currency}{(item.salesData?.revenue30 || 0).toLocaleString()}</p>
                                    <p className="text-[10px] text-gray-400 dark:text-muted/50">{item.salesData?.last30} sold</p>
                                </div>
                            </div>
                        )) : (
                            <div className="text-center py-8">
                                <p className="text-[12px] text-gray-400 dark:text-muted/60">{lang === 'ar' ? 'لا توجد بيانات مبيعات' : 'No sales data yet'}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Low Margin Items */}
                <div className="bg-white dark:bg-card rounded-lg border border-gray-200 dark:border-border/20 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.04]">
                        <h3 className="text-[12px] font-semibold text-gray-700 dark:text-main">{lang === 'ar' ? 'هامش منخفض' : 'Low Margin Items'}</h3>
                    </div>
                    <div className="divide-y divide-gray-50 dark:divide-white/[0.03]">
                        {lowMarginItems.length > 0 ? lowMarginItems.map(item => {
                            const m = ((item.price - (item.cost || 0)) / item.price) * 100;
                            return (
                                <div key={item.id} className="px-4 py-2.5 flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[12px] font-medium text-gray-700 dark:text-main truncate">{item.name}</p>
                                        <p className="text-[10px] text-gray-400 dark:text-muted/50">{currency}{item.price.toFixed(2)} / Cost: {currency}{(item.cost || 0).toFixed(2)}</p>
                                    </div>
                                    <span className={`text-[12px] font-semibold shrink-0 ${marginColor(m)}`}>{m.toFixed(0)}%</span>
                                </div>
                            );
                        }) : (
                            <div className="text-center py-8">
                                <p className="text-[12px] text-gray-400 dark:text-muted/60">{lang === 'ar' ? 'لا توجد أصناف بهامش منخفض' : 'All margins are healthy'}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Not Selling */}
            {notSelling.length > 0 && (
                <div className="bg-white dark:bg-card rounded-lg border border-gray-200 dark:border-border/20 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.04]">
                        <h3 className="text-[12px] font-semibold text-gray-700 dark:text-main">{lang === 'ar' ? 'لا يُباع (30 يوم)' : 'Not Selling (30 Days)'}</h3>
                    </div>
                    <div className="px-4 py-3 flex flex-wrap gap-2">
                        {notSelling.map(item => (
                            <div key={item.id} className="px-3 py-1.5 rounded-md border border-amber-200 dark:border-amber-500/10 bg-amber-50 dark:bg-amber-500/5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                                {item.name}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Margin Heatmap */}
            {itemsWithCost.length > 0 && (
                <div className="bg-white dark:bg-card rounded-lg border border-gray-200 dark:border-border/20 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.04]">
                        <h3 className="text-[12px] font-semibold text-gray-700 dark:text-main">{lang === 'ar' ? 'خريطة الهوامش' : 'Margin Overview'}</h3>
                    </div>
                    <div className="p-4 flex flex-wrap gap-2">
                        {itemsWithCost.map(item => {
                            const m = ((item.price - (item.cost || 0)) / item.price) * 100;
                            return (
                                <div
                                    key={item.id}
                                    className={`px-2.5 py-1.5 rounded-md border border-gray-100 dark:border-border/20 ${marginBg(m)} text-[11px] font-medium flex items-center gap-1.5 hover:opacity-80 cursor-default`}
                                    title={`${item.name}: ${m.toFixed(1)}%`}
                                >
                                    <span className="text-gray-600 dark:text-main truncate max-w-[100px]">{item.name}</span>
                                    <span className={`${marginColor(m)} font-semibold`}>{m.toFixed(0)}%</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AnalyticsPanel;
