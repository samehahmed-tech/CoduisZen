import React from 'react';
import {
    Headset, RefreshCw, Users, Bike, Ban, Clock3, Percent, DollarSign,
    PhoneCall, Route, AlertTriangle, CheckCircle2, Eye, X, MessageSquare,
    TrendingUp, Timer, MapPin, Volume2, VolumeX, Download, BarChart3,
    Building2, Activity, Star, Shield, Zap, Hash, ChevronDown, ChevronUp,
    Send, Gauge, Phone, Wifi, WifiOff, RotateCcw, Calendar, Server,
    RefreshCcw, ClipboardList
} from 'lucide-react';

export const OverviewTab = ({ state }: any) => {
    const {
        lang, currency, branches, users, kpis,
        orders, drivers, escalations, coachingNotes, discountViolations,
        metrics, hourlyData, agentStats, coachingNotesByAgent,
        activeOrdersByDriver, driverStats, branchComparison,
        cancelledOrders, pendingOrders, escalatedOrderIds,
        detailOrder, customerProfile, isLoadingCustomer,
        branchHealthData, isLoadingBranchHealth, failedOrdersData, isLoadingFailedOrders,
        retryingOrderId, dailySummary, isLoadingDailySummary, dailyReviewDate,
        expandedSections, setExpandedSections,
        createEscalation, resolveEscalation, scanEscalations, saveCoachingNote,
        approveDiscountViolation, loadCustomer, retryOrder, fmt, fmtMoney, fmtMins, timeAgo,
        coachingAgentId, setCoachingAgentId, coachingNoteInput, setCoachingNoteInput,
        isSavingCoaching, isScanningEscalations, resolvingEscalationId, escalatingOrderId,
        isApprovingDiscountOrderId, setDailyReviewDate, toggleSection, getOrderStatus, getOrderDate, getOrderTotal,
        getOrderDiscount, getOrderBranch, getOrderAgent, getOrderDriver, getCustomerName, getCustomerPhone,
        getDeliveryAddress, getOrderNumber, getCancelReason, StatusDot, PriorityBadge, MiniSparkline, setOrderDetailId, orderDetailId
    } = state;

    return (
        <>
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                        {kpis.map(k => (
                            <div key={k.label} className={`rounded-2xl p-4 border border-slate-100 dark:border-slate-800 ${k.bg} transition hover:scale-[1.02]`}>
                                <div className="flex items-center justify-between mb-2">
                                    <k.icon size={16} className={k.color} />
                                </div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">{k.label}</div>
                                <div className={`text-lg font-black ${k.color}`}>{k.value}</div>
                                <div className="text-[10px] font-bold text-slate-400 mt-0.5">{k.sub}</div>
                            </div>
                        ))}
                    </div>

                    {/* ── Order Volume Sparkline ──────────────────────────── */}
                    <div className="card-primary rounded-2xl p-4 mb-6">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 flex items-center gap-2">
                                <TrendingUp size={14} /> {lang === 'ar' ? 'حجم الطلبات بالساعة' : 'Hourly Order Volume'}
                            </h2>
                        </div>
                        <div className="flex items-end gap-[3px] h-16">
                            {hourlyData.map((count, i) => {
                                const maxH = Math.max(...hourlyData, 1);
                                const h = (count / maxH) * 100;
                                const now = new Date().getHours();
                                return (
                                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                                        <div
                                            className={`w-full rounded-t transition-all ${
                                                i === now ? 'bg-indigo-500' : count > 0 ? 'bg-indigo-300 dark:bg-indigo-600' : 'bg-slate-100 dark:bg-slate-800'
                                            }`}
                                            style={{ height: `${Math.max(h, 2)}%`, minHeight: 2 }}
                                        />
                                        {i % 3 === 0 && (
                                            <span className="text-[8px] text-slate-400 font-bold">{i}</span>
                                        )}
                                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-900 text-white text-[9px] font-bold rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-10 pointer-events-none">
                                            {String(i).padStart(2, '0')}:00 — {count} {lang === 'ar' ? 'طلب' : 'orders'}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Branch Comparison ───────────────────────────────── */}
                    {branchComparison.length > 1 && (
                        <div className="card-primary rounded-2xl p-4 mb-6">
                            <h2 className="text-sm font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-2">
                                <Building2 size={14} /> {lang === 'ar' ? 'مقارنة الفروع' : 'Branch Comparison'}
                            </h2>
                            <div className="responsive-table">
                                <table className="w-full text-left text-xs">
                                    <thead className="text-slate-400 uppercase text-[10px]">
                                        <tr>
                                            <th className="py-2">{lang === 'ar' ? 'الفرع' : 'Branch'}</th>
                                            <th>{lang === 'ar' ? 'طلبات' : 'Orders'}</th>
                                            <th>{lang === 'ar' ? 'مبيعات' : 'Revenue'}</th>
                                            <th>{lang === 'ar' ? 'تم التوصيل' : 'Delivered'}</th>
                                            <th>{lang === 'ar' ? 'إلغاءات' : 'Cancelled'}</th>
                                            <th>{lang === 'ar' ? 'معدل الإلغاء' : 'Cancel %'}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {branchComparison.map(b => (
                                            <tr key={b.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                                                <td className="py-2.5 font-bold">{b.name}</td>
                                                <td>{fmt(b.orders)}</td>
                                                <td className="font-bold text-emerald-600">{fmtMoney(b.revenue)}</td>
                                                <td className="text-blue-600 font-bold">{fmt(b.delivered)}</td>
                                                <td className="text-rose-600 font-bold">{fmt(b.cancelled)}</td>
                                                <td className={`font-bold ${b.orders > 0 && (b.cancelled / b.orders) * 100 > 10 ? 'text-red-600' : 'text-slate-600'}`}>
                                                    {b.orders > 0 ? ((b.cancelled / b.orders) * 100).toFixed(1) : '0'}%
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* ── Pending + Cancelled Orders ─────────────────────── */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
                        {/* PENDING */}
                        <div className="card-primary rounded-2xl p-4">
                            <button onClick={() => toggleSection('pending')} className="w-full text-left text-sm font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-3 flex items-center justify-between">
                                <span className="flex items-center gap-2">
                                    <Clock3 size={14} /> {lang === 'ar' ? 'الأوردرات المعلقة' : 'Pending Orders'}
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">{pendingOrders.length}</span>
                                </span>
                                {expandedSections.pending ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                            {expandedSections.pending && (
                                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                    {pendingOrders.map(o => {
                                        const mins = Math.floor((Date.now() - getOrderDate(o).getTime()) / 60000);
                                        const isEscalated = escalatedOrderIds.has(String(o.id));
                                        const isUrgent = mins >= 30;
                                        const phone = getCustomerPhone(o);
                                        return (
                                            <div key={String(o.id)} className={`p-3 rounded-xl border transition ${isUrgent ? 'border-red-200 bg-red-50/50 dark:bg-red-950/10 dark:border-red-900/40' : 'border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800'}`}>
                                                <div className="flex items-center justify-between gap-2 text-xs">
                                                    <span className="font-black flex items-center gap-1.5">
                                                        <Hash size={10} className="text-slate-400" />
                                                        {getOrderNumber(o)}
                                                    </span>
                                                    <span className={`font-black px-2 py-0.5 rounded-full text-[10px] ${
                                                        mins >= 45 ? 'bg-red-600 text-white animate-pulse' :
                                                        mins >= 30 ? 'bg-orange-500 text-white' :
                                                        mins >= 20 ? 'bg-amber-400 text-slate-900' :
                                                        'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                                                    }`}>
                                                        {mins}m
                                                    </span>
                                                </div>
                                                <div className="mt-1.5 text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                                    <span className="font-bold">{getCustomerName(o)}</span>
                                                    <span className="text-slate-400">·</span>
                                                    <span className="truncate max-w-[180px]">{getDeliveryAddress(o)}</span>
                                                </div>
                                                <div className="mt-1 text-[10px] text-slate-400 flex items-center gap-2">
                                                    <span>{fmtMoney(getOrderTotal(o))}</span>
                                                    <span>·</span>
                                                    <span>{getOrderStatus(o)}</span>
                                                </div>
                                                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                                                    <button onClick={() => setOrderDetailId(String(o.id))} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition">
                                                        <Eye size={10} /> {lang === 'ar' ? 'تفاصيل' : 'View'}
                                                    </button>
                                                    {phone && phone !== '-' && (
                                                        <a href={`https://wa.me/${phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition">
                                                            <Send size={10} /> WA
                                                        </a>
                                                    )}
                                                    <button
                                                        onClick={() => createEscalation(o)}
                                                        disabled={isEscalated || escalatingOrderId === String(o.id)}
                                                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition ${
                                                            isEscalated ? 'bg-amber-100 text-amber-700 cursor-not-allowed' : 'bg-rose-600 text-white hover:bg-rose-700'
                                                        }`}
                                                    >
                                                        <AlertTriangle size={10} />
                                                        {isEscalated ? (lang === 'ar' ? 'مصعّد' : 'Escalated') : (lang === 'ar' ? 'تصعيد' : 'Escalate')}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {pendingOrders.length === 0 && <div className="py-6 text-center text-xs font-bold text-slate-400">{lang === 'ar' ? 'لا توجد أوردرات معلقة ✓' : 'No pending orders ✓'}</div>}
                                </div>
                            )}
                        </div>

                        {/* CANCELLED */}
                        <div className="card-primary rounded-2xl p-4">
                            <button onClick={() => toggleSection('cancelled')} className="w-full text-left text-sm font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-3 flex items-center justify-between">
                                <span className="flex items-center gap-2">
                                    <Ban size={14} /> {lang === 'ar' ? 'الإلغاءات' : 'Cancellations'}
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{cancelledOrders.length}</span>
                                </span>
                                {expandedSections.cancelled ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                            {expandedSections.cancelled && (
                                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                    {cancelledOrders.map(o => {
                                        const reason = getCancelReason(o);
                                        return (
                                            <div key={String(o.id)} className="p-3 rounded-xl border border-rose-100 bg-rose-50/30 dark:bg-rose-950/10 dark:border-rose-900/30">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="font-black flex items-center gap-1.5">
                                                        <Hash size={10} className="text-slate-400" />
                                                        {getOrderNumber(o)}
                                                    </span>
                                                    <span className="font-bold text-rose-600">{fmtMoney(getOrderTotal(o))}</span>
                                                </div>
                                                <div className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
                                                    <span className="font-bold">{getCustomerName(o)}</span>
                                                    {reason && <span className="text-rose-500"> — {reason}</span>}
                                                    {!reason && <span className="text-slate-400"> — {lang === 'ar' ? 'بدون سبب' : 'No reason'}</span>}
                                                </div>
                                                <div className="mt-2 flex items-center gap-1.5">
                                                    <button onClick={() => setOrderDetailId(String(o.id))} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition">
                                                        <Eye size={10} /> {lang === 'ar' ? 'تفاصيل' : 'View'}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {cancelledOrders.length === 0 && <div className="py-6 text-center text-xs font-bold text-slate-400">{lang === 'ar' ? 'لا توجد إلغاءات ✓' : 'No cancellations ✓'}</div>}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            </>
    );
};
