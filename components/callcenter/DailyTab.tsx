import React from 'react';
import {
    Headset, RefreshCw, Users, Bike, Ban, Clock3, Percent, DollarSign,
    PhoneCall, Route, AlertTriangle, CheckCircle2, Eye, X, MessageSquare,
    TrendingUp, Timer, MapPin, Volume2, VolumeX, Download, BarChart3,
    Building2, Activity, Star, Shield, Zap, Hash, ChevronDown, ChevronUp,
    Send, Gauge, Phone, Wifi, WifiOff, RotateCcw, Calendar, Server,
    RefreshCcw, ClipboardList
} from 'lucide-react';

export const DailyTab = ({ state }: any) => {
    const {
        lang, currency, branches, users,
        orders, drivers, escalations, coachingNotes, discountViolations,
        metrics, hourlyData, agentStats, coachingNotesByAgent,
        activeOrdersByDriver, driverStats, branchComparison,
        cancelledOrders, pendingOrders, escalatedOrderIds,
        detailOrder, customerProfile, isLoadingCustomer,
        branchHealthData, isLoadingBranchHealth, failedOrdersData, isLoadingFailedOrders,
        retryingOrderId, dailySummary, isLoadingDailySummary, dailyReviewDate,
        expandedSections, setExpandedSections,
        createEscalation, resolveEscalation, scanEscalations, saveCoachingNote,
        approveDiscountViolation, loadCustomer, retryOrder, loadDailySummary, fmt, fmtMoney, fmtMins, timeAgo,
        coachingAgentId, setCoachingAgentId, coachingNoteInput, setCoachingNoteInput,
        isSavingCoaching, isScanningEscalations, resolvingEscalationId, escalatingOrderId,
        isApprovingDiscountOrderId, setDailyReviewDate, toggleSection, getOrderStatus, getOrderDate, getOrderTotal,
        getOrderDiscount, getOrderBranch, getOrderAgent, getOrderDriver, getCustomerName, getCustomerPhone,
        getDeliveryAddress, getOrderNumber, getCancelReason, StatusDot, PriorityBadge, MiniSparkline, setOrderDetailId, orderDetailId
    } = state;

    return (
        <>
                <div className="space-y-6">
                    <div className="card-primary rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                            <h2 className="text-sm font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 flex items-center gap-2">
                                <ClipboardList size={14} /> {lang === 'ar' ? 'مراجعة يومية' : 'Daily Order Review'}
                            </h2>
                            <div className="flex items-center gap-2">
                                <input type="date" value={dailyReviewDate} onChange={e => setDailyReviewDate(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 card-primary text-xs font-bold" />
                                <button onClick={loadDailySummary} disabled={isLoadingDailySummary} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-[10px] font-black uppercase disabled:opacity-60 shadow transition">
                                    <RefreshCcw size={12} className={isLoadingDailySummary ? 'animate-spin' : ''} />
                                    {lang === 'ar' ? 'تحميل' : 'Load'}
                                </button>
                            </div>
                        </div>

                        {dailySummary && (
                            <>
                                {/* Top KPIs */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                                    <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/30 p-3 text-center border border-indigo-200 dark:border-indigo-800">
                                        <div className="text-xl font-black text-indigo-600">{fmt(dailySummary.totalOrders)}</div>
                                        <div className="text-[10px] font-bold text-slate-400">{lang === 'ar' ? 'إجمالي الطلبات' : 'Total Orders'}</div>
                                    </div>
                                    <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-3 text-center border border-emerald-200 dark:border-emerald-800">
                                        <div className="text-xl font-black text-emerald-600">{fmtMoney(dailySummary.totalRevenue)}</div>
                                        <div className="text-[10px] font-bold text-slate-400">{lang === 'ar' ? 'إجمالي المبيعات' : 'Total Revenue'}</div>
                                    </div>
                                    <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 p-3 text-center border border-blue-200 dark:border-blue-800">
                                        <div className="text-xl font-black text-blue-600">
                                            {fmt(dailySummary.byStatus?.find((s: any) => s.status === 'DELIVERED')?.count || 0)}
                                        </div>
                                        <div className="text-[10px] font-bold text-slate-400">{lang === 'ar' ? 'تم التوصيل' : 'Delivered'}</div>
                                    </div>
                                    <div className="rounded-xl bg-red-50 dark:bg-red-950/30 p-3 text-center border border-red-200 dark:border-red-800">
                                        <div className="text-xl font-black text-red-600">
                                            {fmt(dailySummary.byStatus?.find((s: any) => s.status === 'CANCELLED')?.count || 0)}
                                        </div>
                                        <div className="text-[10px] font-bold text-slate-400">{lang === 'ar' ? 'ملغية' : 'Cancelled'}</div>
                                    </div>
                                </div>

                                {/* Status breakdown */}
                                <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">{lang === 'ar' ? 'تفصيل حسب الحالة' : 'By Status'}</h3>
                                <div className="responsive-table mb-4">
                                    <table className="w-full text-left text-xs">
                                        <thead className="text-slate-400 uppercase text-[10px]">
                                            <tr>
                                                <th className="py-2">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                                                <th>{lang === 'ar' ? 'عدد' : 'Count'}</th>
                                                <th>{lang === 'ar' ? 'مبيعات' : 'Revenue'}</th>
                                                <th>{lang === 'ar' ? 'خصومات' : 'Discounts'}</th>
                                                <th>{lang === 'ar' ? 'متوسط' : 'Avg Order'}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(dailySummary.byStatus || []).map((s: any) => (
                                                <tr key={s.status} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                                                    <td className="py-2 font-bold">
                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                                                            s.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-700' :
                                                            s.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                                                            s.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                                                            'bg-slate-100 text-slate-700'
                                                        }`}>{s.status}</span>
                                                    </td>
                                                    <td className="font-bold">{fmt(s.count)}</td>
                                                    <td className="text-emerald-600 font-bold">{fmtMoney(s.revenue)}</td>
                                                    <td className="text-amber-600">{fmtMoney(s.discount)}</td>
                                                    <td>{fmtMoney(s.avgOrderValue)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Hourly breakdown */}
                                <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">{lang === 'ar' ? 'توزيع بالساعة' : 'Hourly Distribution'}</h3>
                                <div className="flex items-end gap-[3px] h-20 mb-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                                    {Array(24).fill(0).map((_, i) => {
                                        const hData = (dailySummary.hourly || []).find((h: any) => h.hour === i);
                                        const hCount = hData?.orders || 0;
                                        const maxH = Math.max(...(dailySummary.hourly || []).map((h: any) => h.orders || 0), 1);
                                        const h = (hCount / maxH) * 100;
                                        return (
                                            <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                                                <div
                                                    className={`w-full rounded-t transition-all ${hCount > 0 ? 'bg-indigo-400 dark:bg-indigo-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                                                    style={{ height: `${Math.max(h, 2)}%`, minHeight: 2 }}
                                                />
                                                {i % 4 === 0 && <span className="text-[8px] text-slate-400 font-bold">{i}h</span>}
                                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-900 text-white text-[9px] font-bold rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-10 pointer-events-none">
                                                    {String(i).padStart(2, '0')}:00 — {hCount} {lang === 'ar' ? 'طلب' : 'orders'} · {fmtMoney(hData?.revenue || 0)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Agent performance for the day */}
                                <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">{lang === 'ar' ? 'أداء الموظفين ليوم' : 'Agent Performance for Day'}</h3>
                                <div className="responsive-table">
                                    <table className="w-full text-left text-xs">
                                        <thead className="text-slate-400 uppercase text-[10px]">
                                            <tr>
                                                <th className="py-2">{lang === 'ar' ? 'الموظف' : 'Agent'}</th>
                                                <th>{lang === 'ar' ? 'طلبات' : 'Orders'}</th>
                                                <th>{lang === 'ar' ? 'مبيعات' : 'Revenue'}</th>
                                                <th>{lang === 'ar' ? 'تم التوصيل' : 'Delivered'}</th>
                                                <th>{lang === 'ar' ? 'ملغية' : 'Cancelled'}</th>
                                                <th title={lang === 'ar' ? 'متوسط زمن المعالجة للدقائق' : 'Avg handle time, minutes'}>{lang === 'ar' ? 'متوسط الزمن' : 'Avg time'}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(dailySummary.agents || []).map((a: any) => {
                                                const name = users.find(u => u.id === a.agentId)?.name || a.agentId || 'Unknown';
                                                return (
                                                    <tr key={a.agentId || 'unknown'} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                                                        <td className="py-2 font-bold">{name}</td>
                                                        <td>{fmt(a.orders)}</td>
                                                        <td className="text-emerald-600 font-bold">{fmtMoney(a.revenue)}</td>
                                                        <td className="text-blue-600 font-bold">{fmt(a.delivered)}</td>
                                                        <td className="text-red-600 font-bold">{fmt(a.cancelled)}</td>
                                                        <td className="font-bold">{fmtMins(Math.round(Number(a.avgAhtMinutes || 0)))}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                        {!dailySummary && !isLoadingDailySummary && (
                            <div className="py-8 text-center text-xs font-bold text-slate-400">
                                {lang === 'ar' ? 'اختر تاريخ واضغط "تحميل" لعرض ملخص اليوم' : 'Select a date and click "Load" to view the daily summary'}
                            </div>
                        )}
                        {isLoadingDailySummary && (
                            <div className="py-8 text-center text-xs font-bold text-slate-400 animate-pulse">
                                {lang === 'ar' ? 'جاري تحميل الملخص...' : 'Loading summary...'}
                            </div>
                        )}
                    </div>
                </div>
            </>
    );
};
