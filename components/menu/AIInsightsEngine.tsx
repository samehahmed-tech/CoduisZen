
import React from 'react';
import {
    Sparkles, TrendingUp, TrendingDown, AlertTriangle, Clock,
    Zap, Target, Shield, ArrowUp, ArrowDown, Calendar,
    DollarSign, BarChart3, Activity
} from 'lucide-react';
import { MenuItem } from '../../types';

interface Props {
    items: (MenuItem & { _categoryName: string })[];
    lang: string;
    currency: string;
}

interface InsightAlert {
    type: 'success' | 'warning' | 'danger' | 'info';
    icon: React.ElementType;
    title: string;
    description: string;
    action?: string;
}

const AIInsightsEngine: React.FC<Props> = ({ items, lang, currency }) => {
    const activeItems = items.filter(i => i.isAvailable && !i.archivedAt);
    const itemsWithCost = items.filter(i => i.cost && i.price > 0);
    const itemsWithSales = items.filter(i => (i.salesData?.last30 || 0) > 0);

    // ??? PRICE OPTIMIZATION SUGGESTIONS ???
    const priceOptimizations = itemsWithCost
        .map(item => {
            const margin = ((item.price - (item.cost || 0)) / item.price) * 100;
            const sales30 = item.salesData?.last30 || 0;
            const revenue30 = item.salesData?.revenue30 || 0;

            // High demand + good margin = safe to increase
            if (sales30 > 30 && margin > 40) {
                const suggestedIncrease = Math.round(item.price * 0.03);
                const projectedRevenue = (item.price + suggestedIncrease) * sales30;
                return {
                    item,
                    type: 'increase' as const,
                    suggestion: lang === 'ar'
                        ? `"${item.name}" طلب مرتفع. يمكن زيادة السعر ${currency}${suggestedIncrease}. الإيراد المتوقع: +${currency}${(projectedRevenue - revenue30).toLocaleString()}`
                        : `"${item.name}" has high demand (${sales30}/30D). Safe to increase price by ${currency}${suggestedIncrease}. Projected additional revenue: +${currency}${(projectedRevenue - revenue30).toLocaleString()}`,
                    impact: projectedRevenue - revenue30,
                    margin
                };
            }

            // Low margin = critical review
            if (margin < 30 && sales30 > 0) {
                const minSafePrice = (item.cost || 0) / 0.6; // Target 40% margin
                return {
                    item,
                    type: 'review' as const,
                    suggestion: lang === 'ar'
                        ? `"${item.name}" هامش ${margin.toFixed(0)}% فقط. السعر الآمن: ${currency}${minSafePrice.toFixed(2)}`
                        : `"${item.name}" margin is only ${margin.toFixed(0)}%. Minimum safe price for 40% margin: ${currency}${minSafePrice.toFixed(2)}`,
                    impact: 0,
                    margin
                };
            }

            return null;
        })
        .filter(Boolean)
        .slice(0, 5);

    // ??? AUTO-SCHEDULING SUGGESTIONS ???
    const scheduleSuggestions = activeItems
        .filter(i => {
            const sales = i.salesData?.last30 || 0;
            return sales === 0 && i.isAvailable && !i.archivedAt;
        })
        .slice(0, 3)
        .map(item => ({
            item,
            suggestion: lang === 'ar'
                ? `"${item.name}" بدون مبيعات لمدة 30 يوم. فكر في جدولة التوفر أو الأرشفة.`
                : `"${item.name}" has zero sales in 30 days. Consider time-scheduling or archiving.`
        }));

    // ??? DEACTIVATION SUGGESTIONS ???
    const deactivationCandidates = activeItems
        .filter(i => {
            const margin = i.cost && i.price > 0 ? ((i.price - (i.cost || 0)) / i.price) * 100 : null;
            const sales = i.salesData?.last30 || 0;
            return (sales === 0 || (margin !== null && margin < 15));
        })
        .slice(0, 4);

    // ??? PREDICTIVE REVENUE ???
    const totalRevenue30 = items.reduce((s, i) => s + (i.salesData?.revenue30 || 0), 0);
    const avgDailyRevenue = totalRevenue30 / 30;
    const projected7D = avgDailyRevenue * 7;
    const projected30D = avgDailyRevenue * 30;

    // ??? SMART ALERTS ???
    const alerts: InsightAlert[] = [];

    // Margin erosion check
    const avgMargin = itemsWithCost.length > 0
        ? itemsWithCost.reduce((s, i) => s + ((i.price - (i.cost || 0)) / i.price) * 100, 0) / itemsWithCost.length
        : 0;

    if (avgMargin < 40 && itemsWithCost.length > 0) {
        alerts.push({
            type: 'danger',
            icon: Shield,
            title: lang === 'ar' ? 'تحذير: تآكل الهامش' : 'Margin Erosion Warning',
            description: lang === 'ar'
                ? `متوسط الهامش ${avgMargin.toFixed(1)}% — أقل من الحد الآمن (40%). راجع تكاليف المواد الخام.`
                : `Average margin is ${avgMargin.toFixed(1)}% — below the safe threshold of 40%. Review ingredient costs.`
        });
    }

    // Items with no cost data
    const noCostCount = activeItems.filter(i => !i.cost).length;
    if (noCostCount > 3) {
        alerts.push({
            type: 'warning',
            icon: AlertTriangle,
            title: lang === 'ar' ? 'بيانات تكلفة ناقصة' : 'Missing Cost Data',
            description: lang === 'ar'
                ? `${noCostCount} أصناف بدون تكلفة. لا يمكن حساب الهامش بدقة.`
                : `${noCostCount} items have no cost data. Margin calculations are incomplete.`
        });
    }

    // Commission impact
    const platformItems = items.filter(i => (i.platformPricing?.length || 0) > 0);
    if (platformItems.length > 0) {
        const avgCommission = platformItems.reduce((s, i) => {
            const avgComm = (i.platformPricing || []).reduce((cs, p) => cs + (p.commission || 0), 0) / (i.platformPricing?.length || 1);
            return s + avgComm;
        }, 0) / platformItems.length;
        if (avgCommission > 0.20) {
            alerts.push({
                type: 'warning',
                icon: DollarSign,
                title: lang === 'ar' ? 'عمولات التوصيل مرتفعة' : 'High Delivery Commissions',
                description: lang === 'ar'
                    ? `متوسط العمولة ${(avgCommission * 100).toFixed(0)}%. راجع أسعار التوصيل لحماية الهامش.`
                    : `Average commission is ${(avgCommission * 100).toFixed(0)}%. Review delivery pricing to protect margins.`
            });
        }
    }

    const alertColors = {
        success: { bg: 'bg-emerald-500/5', border: 'border-emerald-500/15', text: 'text-emerald-500' },
        warning: { bg: 'bg-amber-500/5', border: 'border-amber-500/15', text: 'text-amber-500' },
        danger: { bg: 'bg-rose-500/5', border: 'border-rose-500/15', text: 'text-rose-500' },
        info: { bg: 'bg-indigo-500/5', border: 'border-indigo-500/15', text: 'text-indigo-400' },
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-200">

            {/* ??? PREDICTIVE DASHBOARD ??? */}
            <div className="bg-card rounded-lg border border-border/20 overflow-hidden">
                <div className="px-5 py-3 border-b border-white/[0.04] flex items-center gap-2 bg-elevated/30">
                    <Activity size={14} className="text-indigo-400" />
                    <h3 className="text-[12px] font-semibold text-main">{lang === 'ar' ? 'التنبؤات والإسقاطات' : 'Revenue Projections'}</h3>
                </div>
                <div className="p-5 grid grid-cols-3 gap-4">
                    <div className="bg-elevated/30 rounded-md p-4 border border-white/[0.04] text-center">
                        <p className="text-[10px] text-muted/60 mb-1">{lang === 'ar' ? 'المتوسط اليومي' : 'Daily Average'}</p>
                        <p className="text-[18px] font-semibold text-main">{currency}{avgDailyRevenue.toFixed(0)}</p>
                    </div>
                    <div className="bg-elevated/30 rounded-md p-4 border border-white/[0.04] text-center">
                        <p className="text-[10px] text-muted/60 mb-1">{lang === 'ar' ? 'توقع 7 أيام' : '7-Day Forecast'}</p>
                        <p className="text-[18px] font-semibold text-emerald-500">{currency}{projected7D > 999 ? `${(projected7D / 1000).toFixed(1)}K` : projected7D.toFixed(0)}</p>
                    </div>
                    <div className="bg-elevated/30 rounded-md p-4 border border-white/[0.04] text-center">
                        <p className="text-[10px] text-muted/60 mb-1">{lang === 'ar' ? 'توقع 30 يوم' : '30-Day Forecast'}</p>
                        <p className="text-[18px] font-semibold text-emerald-500">{currency}{projected30D > 999 ? `${(projected30D / 1000).toFixed(1)}K` : projected30D.toFixed(0)}</p>
                    </div>
                </div>
            </div>

            {/* ??? SMART ALERTS ??? */}
            {alerts.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 px-1">
                        <Shield size={14} className="text-rose-500" />
                        <h3 className="text-[12px] font-semibold text-main">{lang === 'ar' ? 'تنبيهات ذكية' : 'Smart Alerts'}</h3>
                    </div>
                    {alerts.map((alert, idx) => {
                        const colors = alertColors[alert.type];
                        return (
                            <div key={idx} className={`${colors.bg} border ${colors.border} rounded-md p-4 flex items-start gap-3`}>
                                <alert.icon size={16} className={`${colors.text} shrink-0 mt-0.5`} />
                                <div>
                                    <p className={`text-[12px] font-semibold ${colors.text}`}>{alert.title}</p>
                                    <p className="text-[11px] text-main/80 mt-0.5 leading-relaxed">{alert.description}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ??? PRICE OPTIMIZATION ??? */}
            {priceOptimizations.length > 0 && (
                <div className="bg-card rounded-lg border border-border/20 overflow-hidden">
                    <div className="px-5 py-3 border-b border-white/[0.04] flex items-center gap-2 bg-elevated/30">
                        <Target size={14} className="text-cyan-400" />
                        <h3 className="text-[12px] font-semibold text-main">{lang === 'ar' ? 'تحسين الأسعار (AI)' : 'AI Price Optimization'}</h3>
                    </div>
                    <div className="p-3 space-y-2">
                        {priceOptimizations.map((opt, idx) => (
                            <div key={idx} className={`p-3 rounded-md border flex items-start gap-3 ${opt!.type === 'increase'
                                ? 'bg-emerald-500/5 border-emerald-500/10'
                                : 'bg-rose-500/5 border-rose-500/10'
                                }`}>
                                {opt!.type === 'increase' ? (
                                    <ArrowUp size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                                ) : (
                                    <AlertTriangle size={14} className="text-rose-500 shrink-0 mt-0.5" />
                                )}
                                <p className="text-[11px] text-main leading-relaxed">{opt!.suggestion}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ??? AUTO-SCHEDULING ??? */}
            {scheduleSuggestions.length > 0 && (
                <div className="bg-card rounded-lg border border-border/20 overflow-hidden">
                    <div className="px-5 py-3 border-b border-white/[0.04] flex items-center gap-2 bg-elevated/30">
                        <Calendar size={14} className="text-amber-500" />
                        <h3 className="text-[12px] font-semibold text-main">{lang === 'ar' ? 'اقتراحات الجدولة' : 'Scheduling Suggestions'}</h3>
                    </div>
                    <div className="p-3 space-y-2">
                        {scheduleSuggestions.map((sug, idx) => (
                            <div key={idx} className="p-3 rounded-md bg-amber-500/5 border border-amber-500/10 flex items-start gap-3">
                                <Clock size={14} className="text-amber-500 shrink-0 mt-0.5" />
                                <p className="text-[11px] text-main leading-relaxed">{sug.suggestion}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ??? DEACTIVATION CANDIDATES ??? */}
            {deactivationCandidates.length > 0 && (
                <div className="bg-card rounded-lg border border-border/20 overflow-hidden">
                    <div className="px-5 py-3 border-b border-white/[0.04] flex items-center gap-2 bg-elevated/30">
                        <TrendingDown size={14} className="text-rose-500" />
                        <h3 className="text-[12px] font-semibold text-main">{lang === 'ar' ? 'مرشحة للإيقاف' : 'Deactivation Candidates'}</h3>
                    </div>
                    <div className="p-3 space-y-1">
                        {deactivationCandidates.map((item, idx) => {
                            const m = item.cost && item.price > 0 ? ((item.price - (item.cost || 0)) / item.price) * 100 : null;
                            return (
                                <div key={idx} className="flex items-center gap-3 p-2.5 rounded-md hover:bg-white/[0.02] transition-colors">
                                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[12px] font-medium text-main truncate">{item.name}</p>
                                        <div className="flex gap-3 text-[10px] text-muted/60 mt-0.5">
                                            <span>{lang === 'ar' ? 'المبيعات:' : 'Sales:'} {item.salesData?.last30 || 0}</span>
                                            {m !== null && <span>{lang === 'ar' ? 'الهامش:' : 'Margin:'} {m.toFixed(0)}%</span>}
                                        </div>
                                    </div>
                                    <span className="text-[10px] text-rose-500 font-medium shrink-0">
                                        {lang === 'ar' ? 'فكّر في الأرشفة' : 'Consider archiving'}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ??? COMMISSION CALCULATOR ??? */}
            {items.some(i => (i.platformPricing?.length || 0) > 0) && (
                <div className="bg-card rounded-lg border border-border/20 overflow-hidden">
                    <div className="px-5 py-3 border-b border-white/[0.04] flex items-center gap-2 bg-elevated/30">
                        <DollarSign size={14} className="text-indigo-400" />
                        <h3 className="text-[12px] font-semibold text-main">{lang === 'ar' ? 'تأثير عمولات المنصات' : 'Platform Commission Impact'}</h3>
                    </div>
                    <div className="p-3 space-y-1">
                        {items.filter(i => (i.platformPricing?.length || 0) > 0).slice(0, 6).map((item, idx) => (
                            <div key={idx} className="flex items-center gap-3 p-2.5 rounded-md hover:bg-white/[0.02]">
                                <div className="flex-1 min-w-0">
                                    <p className="text-[12px] font-medium text-main truncate">{item.name}</p>
                                </div>
                                <div className="flex gap-3 text-[10px]">
                                    {(item.platformPricing || []).map((pp, pIdx) => {
                                        const net = pp.price * (1 - (pp.commission || 0));
                                        const netMargin = item.cost ? ((net - item.cost) / net) * 100 : null;
                                        return (
                                            <div key={pIdx} className="text-right">
                                                <p className="text-muted/60">{pp.platformId}</p>
                                                <p className={`font-medium ${netMargin !== null && netMargin < 30 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                                    {currency}{net.toFixed(2)}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AIInsightsEngine;
