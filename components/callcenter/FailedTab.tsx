import React from 'react';
import {
    Headset, RefreshCw, Users, Bike, Ban, Clock3, Percent, DollarSign,
    PhoneCall, Route, AlertTriangle, CheckCircle2, Eye, X, MessageSquare,
    TrendingUp, Timer, MapPin, Volume2, VolumeX, Download, BarChart3,
    Building2, Activity, Star, Shield, Zap, Hash, ChevronDown, ChevronUp,
    Send, Gauge, Phone, Wifi, WifiOff, RotateCcw, Calendar, Server,
    RefreshCcw, ClipboardList
} from 'lucide-react';

export const FailedTab = ({ state }: any) => {
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
        approveDiscountViolation, loadCustomer, retryOrder, loadFailedOrders, fmt, fmtMoney, fmtMins, timeAgo,
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
                                <WifiOff size={14} className="text-red-500" />
                                {lang === 'ar' ? 'طلبات فشلت المزامنة للفرع' : 'Failed Sync Queue'}
                                {failedOrdersData?.total > 0 && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">{failedOrdersData.total}</span>
                                )}
                            </h2>
                            <button onClick={loadFailedOrders} disabled={isLoadingFailedOrders} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-[10px] font-black uppercase disabled:opacity-60 shadow transition">
                                <RefreshCcw size={12} className={isLoadingFailedOrders ? 'animate-spin' : ''} />
                                {lang === 'ar' ? 'تحديث' : 'Refresh'}
                            </button>
                        </div>

                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                            {lang === 'ar'
                                ? '⚠️ الطلبات اللي ظاهرة هنا هي اللي بعتها الكول سنتر بس موصلتش للفرع (الفرع كان أوفلاين أو فيه مشكلة اتصال). اضغط "إعادة إرسال" لمحاولة تاني.'
                                : '⚠️ These are call center orders that failed to sync to the branch (branch was offline or had connection issues). Click "Retry" to attempt re-sync.'}
                        </div>

                        <div className="space-y-2 max-h-[500px] overflow-y-auto">
                            {(failedOrdersData?.orders || []).map((o: any) => {
                                const branchName = branches.find(b => b.id === o.branchId)?.name || o.branchId;
                                const agentName = users.find(u => u.id === o.callCenterAgentId)?.name || o.callCenterAgentId || '-';
                                const mins = Math.floor((Date.now() - new Date(o.createdAt || Date.now()).getTime()) / 60000);
                                return (
                                    <div key={o.id} className="p-3 rounded-xl border border-red-100 bg-red-50/30 dark:bg-red-950/10 dark:border-red-900/30">
                                        <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
                                            <div className="flex items-center gap-2">
                                                <span className="font-black">#{o.orderNumber || o.id}</span>
                                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                                                    o.syncStatus === 'FAILED' ? 'bg-red-600 text-white' : 'bg-amber-400 text-slate-900'
                                                }`}>{o.syncStatus}</span>
                                                <span className="text-slate-400">{fmtMins(mins)} {lang === 'ar' ? 'منذ' : 'ago'}</span>
                                            </div>
                                            <button
                                                onClick={() => retryOrder(o.id)}
                                                disabled={retryingOrderId === o.id}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-60 transition"
                                            >
                                                <RotateCcw size={10} className={retryingOrderId === o.id ? 'animate-spin' : ''} />
                                                {lang === 'ar' ? 'إعادة إرسال' : 'Retry'}
                                            </button>
                                        </div>
                                        <div className="mt-1.5 text-[11px] text-slate-600 dark:text-slate-400 grid grid-cols-2 gap-1">
                                            <span>🏢 {branchName}</span>
                                            <span>👤 {agentName}</span>
                                            <span>📞 {o.customerName || '-'} · {o.customerPhone || '-'}</span>
                                            <span>💰 {fmtMoney(Number(o.total || 0))}</span>
                                        </div>
                                        <div className="mt-1 text-[10px] text-slate-400 truncate">
                                            📍 {o.deliveryAddress || '-'}
                                        </div>
                                    </div>
                                );
                            })}
                            {failedOrdersData?.total === 0 && (
                                <div className="py-10 text-center">
                                    <Wifi size={32} className="mx-auto text-emerald-500 mb-2" />
                                    <div className="text-xs font-bold text-slate-400">{lang === 'ar' ? 'كل الطلبات متزامنة بنجاح ✓' : 'All orders synced successfully ✓'}</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </>
    );
};
