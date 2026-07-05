import React from 'react';
import {
    Headset, RefreshCw, Users, Bike, Ban, Clock3, Percent, DollarSign,
    PhoneCall, Route, AlertTriangle, CheckCircle2, Eye, X, MessageSquare,
    TrendingUp, Timer, MapPin, Volume2, VolumeX, Download, BarChart3,
    Building2, Activity, Star, Shield, Zap, Hash, ChevronDown, ChevronUp,
    Send, Gauge, Phone, Wifi, WifiOff, RotateCcw, Calendar, Server,
    RefreshCcw, ClipboardList
} from 'lucide-react';

export const EscalationsTab = ({ state }: any) => {
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
        approveDiscountViolation, loadCustomer, retryOrder, fmt, fmtMoney, fmtMins, timeAgo,
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
                        <div className="mb-4 flex items-center justify-between gap-2 flex-wrap">
                            <h2 className="text-sm font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 flex items-center gap-2">
                                <AlertTriangle size={14} className="text-red-500" />
                                {lang === 'ar' ? 'التصعيدات المفتوحة' : 'Open Escalations'}
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">{escalations.length}</span>
                            </h2>
                            <button onClick={scanEscalations} disabled={isScanningEscalations} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-slate-800 to-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:from-slate-700 hover:to-slate-800 disabled:opacity-60 shadow transition">
                                <Zap size={12} className={isScanningEscalations ? 'animate-spin' : ''} />
                                {lang === 'ar' ? 'فحص تلقائي' : 'Auto Scan'}
                            </button>
                        </div>
                        <div className="space-y-2 max-h-[500px] overflow-y-auto">
                            {escalations.map(e => {
                                const order = orders.find(o => String(o.id) === e.orderId);
                                const mins = order ? Math.floor((Date.now() - getOrderDate(order).getTime()) / 60000) : 0;
                                return (
                                    <div key={e.id} className={`p-3 rounded-xl border flex items-start justify-between gap-3 transition ${
                                        e.priority === 'CRITICAL' ? 'border-red-300 bg-red-50/60 dark:bg-red-950/20 dark:border-red-800' :
                                        e.priority === 'HIGH' ? 'border-orange-200 bg-orange-50/40 dark:bg-orange-950/10 dark:border-orange-900/40' :
                                        'border-slate-100 dark:border-slate-800'
                                    }`}>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 text-xs flex-wrap">
                                                <span className="font-black">#{e.orderId}</span>
                                                <PriorityBadge priority={e.priority} />
                                                {mins > 0 && <span className="text-[10px] text-slate-400 font-bold">{fmtMins(mins)} pending</span>}
                                            </div>
                                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                                                {e.reason} {e.notes ? `· ${e.notes}` : ''}
                                            </div>
                                            {order && (
                                                <div className="text-[10px] text-slate-400 mt-1">
                                                    {getCustomerName(order)} · {getDeliveryAddress(order)}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {order && (
                                                <button onClick={() => setOrderDetailId(e.orderId)} className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300 hover:bg-indigo-100 transition">
                                                    <Eye size={12} />
                                                </button>
                                            )}
                                            <button onClick={() => resolveEscalation(e.id)} disabled={resolvingEscalationId === e.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-60 transition">
                                                <CheckCircle2 size={12} />
                                                {lang === 'ar' ? 'حل' : 'Resolve'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            {escalations.length === 0 && (
                                <div className="py-10 text-center">
                                    <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
                                    <div className="text-xs font-bold text-slate-400">{lang === 'ar' ? 'لا توجد تصعيدات مفتوحة ✓' : 'All clear — no open escalations ✓'}</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </>
    );
};
