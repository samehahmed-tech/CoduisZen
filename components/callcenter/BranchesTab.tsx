import React from 'react';
import {
    Headset, RefreshCw, Users, Bike, Ban, Clock3, Percent, DollarSign,
    PhoneCall, Route, AlertTriangle, CheckCircle2, Eye, X, MessageSquare,
    TrendingUp, Timer, MapPin, Volume2, VolumeX, Download, BarChart3,
    Building2, Activity, Star, Shield, Zap, Hash, ChevronDown, ChevronUp,
    Send, Gauge, Phone, Wifi, WifiOff, RotateCcw, Calendar, Server,
    RefreshCcw, ClipboardList
} from 'lucide-react';

export const BranchesTab = ({ state }: any) => {
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
        approveDiscountViolation, loadCustomer, retryOrder, loadBranchHealth, fmt, fmtMoney, fmtMins, timeAgo,
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
                                <Server size={14} /> {lang === 'ar' ? 'حالة الفروع — صحة الاتصال' : 'Branch Health — Connection Status'}
                            </h2>
                            <button onClick={loadBranchHealth} disabled={isLoadingBranchHealth} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-60 shadow transition">
                                <RefreshCcw size={12} className={isLoadingBranchHealth ? 'animate-spin' : ''} />
                                {lang === 'ar' ? 'فحص الآن' : 'Ping Now'}
                            </button>
                        </div>

                        {/* Summary cards */}
                        {branchHealthData?.summary && (
                            <div className="grid grid-cols-3 gap-3 mb-4">
                                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-3 text-center border border-emerald-200 dark:border-emerald-800">
                                    <div className="flex items-center justify-center gap-1.5 mb-1"><Wifi size={14} className="text-emerald-600" /></div>
                                    <div className="text-xl font-black text-emerald-600">{branchHealthData.summary.online}</div>
                                    <div className="text-[10px] font-bold text-slate-400">{lang === 'ar' ? 'أونلاين' : 'Online'}</div>
                                </div>
                                <div className="rounded-xl bg-red-50 dark:bg-red-950/30 p-3 text-center border border-red-200 dark:border-red-800">
                                    <div className="flex items-center justify-center gap-1.5 mb-1"><WifiOff size={14} className="text-red-600" /></div>
                                    <div className="text-xl font-black text-red-600">{branchHealthData.summary.offline}</div>
                                    <div className="text-[10px] font-bold text-slate-400">{lang === 'ar' ? 'أوفلاين' : 'Offline'}</div>
                                </div>
                                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 text-center border border-slate-200 dark:border-slate-700">
                                    <div className="flex items-center justify-center gap-1.5 mb-1"><Activity size={14} className="text-slate-500" /></div>
                                    <div className="text-xl font-black text-slate-600 dark:text-slate-300">{branchHealthData.summary.unknown}</div>
                                    <div className="text-[10px] font-bold text-slate-400">{lang === 'ar' ? 'غير معروف' : 'Unknown'}</div>
                                </div>
                            </div>
                        )}

                        {/* Branch list */}
                        <div className="space-y-2">
                            {(branchHealthData?.branches || []).map((b: any) => (
                                <div key={b.id} className={`p-4 rounded-xl border transition ${
                                    b.status === 'ONLINE' ? 'border-emerald-200 bg-emerald-50/30 dark:bg-emerald-950/10 dark:border-emerald-800' :
                                    b.status === 'OFFLINE' ? 'border-red-200 bg-red-50/30 dark:bg-red-950/10 dark:border-red-800 animate-pulse' :
                                    'border-slate-200 dark:border-slate-700'
                                }`}>
                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-3 h-3 rounded-full ${
                                                b.status === 'ONLINE' ? 'bg-emerald-500' :
                                                b.status === 'OFFLINE' ? 'bg-red-500 animate-pulse' :
                                                'bg-slate-400'
                                            }`} />
                                            <div>
                                                <div className="text-sm font-black">{b.name}</div>
                                                <div className="text-[10px] text-slate-400 flex items-center gap-2">
                                                    <span>IP: {b.serverIp || (lang === 'ar' ? 'غير محدد' : 'Not configured')}</span>
                                                    {b.latencyMs > 0 && <span className="text-emerald-600">• {b.latencyMs}ms</span>}
                                                    {b.phone && <span>• 📞 {b.phone}</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                                                b.status === 'ONLINE' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' :
                                                b.status === 'OFFLINE' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                                                'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                            }`}>
                                                {b.status}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                        <div className="rounded-lg bg-white dark:bg-slate-800 p-2 border border-slate-100 dark:border-slate-700">
                                            <div className="text-sm font-black text-indigo-600">{b.orders24h}</div>
                                            <div className="text-[9px] font-bold text-slate-400">{lang === 'ar' ? 'طلبات 24 ساعة' : '24h Orders'}</div>
                                        </div>
                                        <div className="rounded-lg bg-white dark:bg-slate-800 p-2 border border-slate-100 dark:border-slate-700">
                                            <div className={`text-sm font-black ${b.failedSync > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{b.failedSync}</div>
                                            <div className="text-[9px] font-bold text-slate-400">{lang === 'ar' ? 'فاشل مزامنة' : 'Failed Sync'}</div>
                                        </div>
                                        <div className="rounded-lg bg-white dark:bg-slate-800 p-2 border border-slate-100 dark:border-slate-700">
                                            <div className="text-sm font-black text-amber-600">{b.pendingOrders}</div>
                                            <div className="text-[9px] font-bold text-slate-400">{lang === 'ar' ? 'معلقة' : 'Pending'}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {(!branchHealthData || branchHealthData.branches?.length === 0) && !isLoadingBranchHealth && (
                                <div className="py-8 text-center text-xs font-bold text-slate-400">
                                    {lang === 'ar' ? 'اضغط "فحص الآن" لفحص حالة الفروع' : 'Click "Ping Now" to check branch status'}
                                </div>
                            )}
                            {isLoadingBranchHealth && (
                                <div className="py-8 text-center text-xs font-bold text-slate-400 animate-pulse">
                                    {lang === 'ar' ? 'جاري فحص الفروع...' : 'Pinging branches...'}
                                </div>
                            )}
                        </div>
                        {branchHealthData?.checkedAt && (
                            <div className="mt-3 text-[10px] text-slate-400 text-center">
                                {lang === 'ar' ? 'آخر فحص:' : 'Last checked:'} {new Date(branchHealthData.checkedAt).toLocaleString()}
                            </div>
                        )}
                    </div>
                </div>
            </>
    );
};
