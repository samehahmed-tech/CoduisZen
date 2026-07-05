import React from 'react';
import {
    Headset, RefreshCw, Users, Bike, Ban, Clock3, Percent, DollarSign,
    PhoneCall, Route, AlertTriangle, CheckCircle2, Eye, X, MessageSquare,
    TrendingUp, Timer, MapPin, Volume2, VolumeX, Download, BarChart3,
    Building2, Activity, Star, Shield, Zap, Hash, ChevronDown, ChevronUp,
    Send, Gauge, Phone, Wifi, WifiOff, RotateCcw, Calendar, Server,
    RefreshCcw, ClipboardList
} from 'lucide-react';

export const AgentsTab = ({ state }: any) => {
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
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-4 flex items-center gap-2">
                            <Users size={14} /> {lang === 'ar' ? 'أداء موظفي الكول سنتر' : 'Agent Performance Board'}
                        </h2>
                        <div className="responsive-table">
                            <table className="w-full text-left text-xs">
                                <thead className="text-slate-400 uppercase text-[10px]">
                                    <tr>
                                        <th className="py-2">{lang === 'ar' ? 'الموظف' : 'Agent'}</th>
                                        <th>{lang === 'ar' ? 'طلبات' : 'Orders'}</th>
                                        <th>{lang === 'ar' ? 'مبيعات' : 'Revenue'}</th>
                                        <th>{lang === 'ar' ? 'تم التوصيل' : 'Delivered'}</th>
                                        <th>{lang === 'ar' ? 'إلغاءات' : 'Cancelled'}</th>
                                        <th>{lang === 'ar' ? 'خصومات' : 'Discounts'}</th>
                                        <th>{lang === 'ar' ? 'حمل العمل' : 'Workload'}</th>
                                        <th className="hidden xl:table-cell">{lang === 'ar' ? 'نشاط' : 'Activity'}</th>
                                        <th>{lang === 'ar' ? 'تدريب' : 'Coach'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {agentStats.map(a => {
                                        const workloadLevel = a.pending > 6 ? 'HIGH' : a.pending > 3 ? 'MED' : 'LOW';
                                        const cancelRate = a.orders > 0 ? (a.cancelled / a.orders) * 100 : 0;
                                        return (
                                            <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                                                <td className="py-2.5">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-black">
                                                            {a.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-xs">{a.name}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="font-bold">{fmt(a.orders)}</td>
                                                <td className="font-bold text-emerald-600">{fmtMoney(a.revenue)}</td>
                                                <td className="text-blue-600 font-bold">{fmt(a.delivered)}</td>
                                                <td>
                                                    <span className={`font-bold ${cancelRate > 15 ? 'text-red-600' : cancelRate > 8 ? 'text-amber-600' : 'text-slate-600'}`}>
                                                        {fmt(a.cancelled)} <span className="text-[9px] text-slate-400">({cancelRate.toFixed(0)}%)</span>
                                                    </span>
                                                </td>
                                                <td>{fmtMoney(a.discounts)}</td>
                                                <td>
                                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                                                        workloadLevel === 'HIGH' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                                                        workloadLevel === 'MED' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                                                        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                                    }`}>
                                                        {fmt(a.pending)} {lang === 'ar' ? 'نشط' : 'active'}
                                                    </span>
                                                </td>
                                                <td className="hidden xl:table-cell">
                                                    <MiniSparkline data={a.hourly} color={cancelRate > 15 ? '#ef4444' : '#6366f1'} />
                                                </td>
                                                <td>
                                                    <button onClick={() => setCoachingAgentId(a.id)} className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition">
                                                        {lang === 'ar' ? `📝 ${coachingNotesByAgent.get(a.id)?.length || 0}` : `📝 ${coachingNotesByAgent.get(a.id)?.length || 0}`}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {agentStats.length === 0 && <div className="py-8 text-center text-xs font-bold text-slate-400">{lang === 'ar' ? 'لا توجد بيانات موظفين للفترة.' : 'No agent data for selected period.'}</div>}
                        </div>
                    </div>

                    {/* ── Coaching Notes ──────────────────────────────────── */}
                    <div className="card-primary rounded-2xl p-4">
                        <button onClick={() => toggleSection('coaching')} className="w-full text-left text-sm font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-3 flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <MessageSquare size={14} /> {lang === 'ar' ? 'ملاحظات التدريب' : 'Coaching Notes'}
                            </span>
                            {expandedSections.coaching ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        {expandedSections.coaching && (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-[220px_1fr_auto] gap-2 mb-3">
                                    <select value={coachingAgentId} onChange={e => setCoachingAgentId(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 card-primary text-xs font-bold">
                                        <option value="">{lang === 'ar' ? 'اختر موظف' : 'Select agent'}</option>
                                        {agentStats.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                    </select>
                                    <input value={coachingNoteInput} onChange={e => setCoachingNoteInput(e.target.value)} placeholder={lang === 'ar' ? 'اكتب ملاحظة تدريب...' : 'Write a coaching note...'} className="px-3 py-2 rounded-xl border border-slate-200 card-primary text-xs font-bold" onKeyDown={e => e.key === 'Enter' && saveCoachingNote()} />
                                    <button onClick={saveCoachingNote} disabled={isSavingCoaching || !coachingAgentId.trim() || !coachingNoteInput.trim()} className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-black disabled:opacity-60 shadow-lg shadow-indigo-500/20">
                                        {lang === 'ar' ? 'حفظ' : 'Save'}
                                    </button>
                                </div>
                                <div className="space-y-2 max-h-[260px] overflow-y-auto">
                                    {coachingNotes.slice(0, 30).map(note => {
                                        const agentName = users.find(u => u.id === note.agentId)?.name || note.agentId;
                                        return (
                                            <div key={note.id} className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                                                <div className="flex items-center justify-between">
                                                    <div className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">{agentName}</div>
                                                    <div className="text-[10px] text-slate-400">{new Date(note.createdAt).toLocaleString()}</div>
                                                </div>
                                                <div className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-1">{note.note}</div>
                                            </div>
                                        );
                                    })}
                                    {coachingNotes.length === 0 && <div className="py-4 text-center text-xs font-bold text-slate-400">{lang === 'ar' ? 'لا توجد ملاحظات تدريب.' : 'No coaching notes yet.'}</div>}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </>
    );
};
