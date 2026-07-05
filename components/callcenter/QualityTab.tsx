import React from 'react';
import {
    Headset, RefreshCw, Users, Bike, Ban, Clock3, Percent, DollarSign,
    PhoneCall, Route, AlertTriangle, CheckCircle2, Eye, X, MessageSquare,
    TrendingUp, Timer, MapPin, Volume2, VolumeX, Download, BarChart3,
    Building2, Activity, Star, Shield, Zap, Hash, ChevronDown, ChevronUp,
    Send, Gauge, Phone, Wifi, WifiOff, RotateCcw, Calendar, Server,
    RefreshCcw, ClipboardList
} from 'lucide-react';

export const QualityTab = ({ state }: any) => {
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
                    {/* Discount Abuse */}
                    <div className="card-primary rounded-2xl p-4">
                        <button onClick={() => toggleSection('discount')} className="w-full text-left text-sm font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-3 flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <Percent size={14} className="text-amber-500" />
                                {lang === 'ar' ? 'مراقبة الخصومات' : 'Discount Abuse Monitor'}
                                {discountViolations.length > 0 && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">{discountViolations.length}</span>
                                )}
                            </span>
                            {expandedSections.discount ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        {expandedSections.discount && (
                            <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                {discountViolations.map(v => {
                                    const agentName = users.find(u => u.id === v.agentId)?.name || v.agentId || 'UNASSIGNED';
                                    return (
                                        <div key={v.orderId} className="p-3 rounded-xl border border-amber-100 bg-amber-50/50 dark:bg-amber-950/10 dark:border-amber-900/30">
                                            <div className="flex items-center justify-between gap-2 text-xs">
                                                <span className="font-black flex items-center gap-1.5">
                                                    <Hash size={10} className="text-slate-400" />
                                                    {v.orderId}
                                                </span>
                                                <span className="font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded dark:bg-amber-900/40 dark:text-amber-300">{v.discountPercent.toFixed(1)}%</span>
                                            </div>
                                            <div className="mt-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                                                {lang === 'ar' ? 'الموظف:' : 'Agent:'} <span className="font-bold">{agentName}</span>
                                                <span className="text-slate-400 mx-1">·</span>
                                                {lang === 'ar' ? 'الخصم:' : 'Discount:'} <span className="font-bold text-amber-600">{fmtMoney(v.discount)}</span>
                                                <span className="text-slate-400 mx-1">·</span>
                                                {lang === 'ar' ? 'الإجمالي:' : 'Total:'} {fmtMoney(v.total)}
                                            </div>
                                            <div className="mt-2 flex items-center gap-2">
                                                <button onClick={() => approveDiscountViolation(v, 'APPROVED')} disabled={isApprovingDiscountOrderId === v.orderId} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-60 hover:bg-emerald-700 transition">
                                                    <CheckCircle2 size={10} className="inline mr-1" />{lang === 'ar' ? 'اعتماد' : 'Approve'}
                                                </button>
                                                <button onClick={() => approveDiscountViolation(v, 'REJECTED')} disabled={isApprovingDiscountOrderId === v.orderId} className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-60 hover:bg-rose-700 transition">
                                                    <X size={10} className="inline mr-1" />{lang === 'ar' ? 'رفض' : 'Reject'}
                                                </button>
                                                <button onClick={() => setOrderDetailId(v.orderId)} className="px-2 py-1.5 rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition">
                                                    <Eye size={10} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                                {discountViolations.length === 0 && (
                                    <div className="py-8 text-center">
                                        <Shield size={28} className="mx-auto text-emerald-500 mb-2" />
                                        <div className="text-xs font-bold text-slate-400">{lang === 'ar' ? 'لا توجد مخالفات خصم ✓' : 'No discount violations ✓'}</div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </>
    );
};
