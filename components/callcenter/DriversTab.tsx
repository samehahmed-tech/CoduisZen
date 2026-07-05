import React from 'react';
import {
    Headset, RefreshCw, Users, Bike, Ban, Clock3, Percent, DollarSign,
    PhoneCall, Route, AlertTriangle, CheckCircle2, Eye, X, MessageSquare,
    TrendingUp, Timer, MapPin, Volume2, VolumeX, Download, BarChart3,
    Building2, Activity, Star, Shield, Zap, Hash, ChevronDown, ChevronUp,
    Send, Gauge, Phone, Wifi, WifiOff, RotateCcw, Calendar, Server,
    RefreshCcw, ClipboardList
} from 'lucide-react';

export const DriversTab = ({ state }: any) => {
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
                <div className="card-primary rounded-2xl p-4">
                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-4 flex items-center gap-2">
                        <Route size={14} /> {lang === 'ar' ? 'متابعة الطيارين' : 'Driver Tracking'}
                    </h2>
                    <div className="responsive-table">
                        <table className="w-full text-left text-xs">
                            <thead className="text-slate-400 uppercase text-[10px]">
                                <tr>
                                    <th className="py-2">{lang === 'ar' ? 'الطيار' : 'Driver'}</th>
                                    <th>{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                                    <th>{lang === 'ar' ? 'طلبات نشطة' : 'Active'}</th>
                                    <th>{lang === 'ar' ? 'تم التوصيل' : 'Delivered'}</th>
                                    <th>{lang === 'ar' ? 'متوسط التوصيل' : 'Avg Time'}</th>
                                    <th>{lang === 'ar' ? 'الوقت الحالي' : 'Current Wait'}</th>
                                    <th>{lang === 'ar' ? 'الوجهة' : 'Destination'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {driverStats.map(d => (
                                    <tr key={d.id} className={`border-t border-slate-100 dark:border-slate-800 transition ${d.isDelayed ? 'bg-red-50/50 dark:bg-red-950/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
                                        <td className="py-2.5">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-white text-[10px] font-black">
                                                    {d.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-xs">{d.name}</div>
                                                    {d.branchName && <div className="text-[9px] text-slate-400">{d.branchName}</div>}
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase">
                                                <StatusDot status={d.status} /> {d.status}
                                            </span>
                                        </td>
                                        <td className="font-bold text-indigo-600">{fmt(d.activeCount)}</td>
                                        <td className="font-bold text-emerald-600">{fmt(d.delivered)}</td>
                                        <td>{d.avgDeliveryTime > 0 ? fmtMins(d.avgDeliveryTime) : '-'}</td>
                                        <td>
                                            {d.currentWait > 0 ? (
                                                <span className={`font-bold ${d.isDelayed ? 'text-red-600 animate-pulse' : d.currentWait > 30 ? 'text-amber-600' : 'text-slate-600'}`}>
                                                    {fmtMins(d.currentWait)}
                                                    {d.isDelayed && <span className="ml-1 text-[9px]">⚠️</span>}
                                                </span>
                                            ) : '-'}
                                        </td>
                                        <td className="max-w-[200px] truncate text-slate-600 dark:text-slate-400">{d.currentRoute}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {driverStats.length === 0 && <div className="py-8 text-center text-xs font-bold text-slate-400">{lang === 'ar' ? 'لا يوجد طيارين.' : 'No drivers available.'}</div>}
                    </div>
                </div>
            </>
    );
};
