import React, { useEffect, useMemo, useState } from 'react';
import {
    RotateCcw, DollarSign, CheckCircle2, XCircle, Clock, AlertTriangle,
    Search, Filter, ChevronRight, X, Shield, Settings, TrendingDown,
    FileText, Users, Eye, RefreshCw, BarChart3, Zap
} from 'lucide-react';
import { refundApi } from '../services/api/refunds';
import { useAuthStore } from '../stores/useAuthStore';
import { translations } from '../services/translations';
import ExportButton from './common/ExportButton';
import { useToast } from './common/ToastProvider';

type Refund = {
    id: string;
    orderId: string;
    type: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PROCESSED';
    reason: string;
    reasonCategory: string;
    refundMethod: string;
    requestedByName?: string;
    customAmount?: number;
    totalAmount?: number;
    items?: any[];
    createdAt: string;
    processedAt?: string;
    rejectionReason?: string;
};

type RefundTab = 'list' | 'stats' | 'policy';

const TABS: { id: RefundTab; labelKey: string; icon: any }[] = [
    { id: 'list', labelKey: 'refund_requests', icon: RotateCcw },
    { id: 'stats', labelKey: 'refund_analytics', icon: BarChart3 },
    { id: 'policy', labelKey: 'refund_policy', icon: Shield },
];

const STATUS_MAP: Record<string, { bg: string; text: string }> = {
    PENDING: { bg: 'bg-amber-500/10', text: 'text-amber-500' },
    APPROVED: { bg: 'bg-blue-500/10', text: 'text-blue-500' },
    REJECTED: { bg: 'bg-rose-500/10', text: 'text-rose-500' },
    PROCESSED: { bg: 'bg-emerald-500/10', text: 'text-emerald-500' },
};

const RefundManager: React.FC = () => {
    const { settings } = useAuthStore();
    const lang = settings.language || 'en';
    const t = translations[lang];
    const isAr = lang === 'ar';
    const tr = (en: string, ar: string) => isAr ? ar : en;
    const currency = settings.currencySymbol || 'LE';
    const { success, error: showError } = useToast();

    const [activeTab, setActiveTab] = useState<RefundTab>('list');
    const [refunds, setRefunds] = useState<Refund[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [policy, setPolicy] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRefund, setSelectedRefund] = useState<Refund | null>(null);
    const [pendingAction, setPendingAction] = useState<string | null>(null);
    const [rejectRefundId, setRejectRefundId] = useState<string | null>(null);
    const [rejectReason, setRejectReason] = useState('');

    const loadRefunds = async () => {
        setIsLoading(true);
        try {
            const filters: any = {};
            if (statusFilter !== 'ALL') filters.status = statusFilter;
            if (settings.activeBranchId) filters.branchId = settings.activeBranchId;
            setRefunds(await refundApi.getRefunds(filters));
        } catch (error: any) {
            showError(error.message || tr('Failed to load refunds', 'تعذر تحميل طلبات الاسترداد'));
        } finally {
            setIsLoading(false);
        }
    };

    const loadStats = async () => {
        try {
            setStats(await refundApi.getStats(settings.activeBranchId));
        } catch (error: any) {
            showError(error.message || tr('Failed to load refund analytics', 'تعذر تحميل تحليلات الاسترداد'));
        }
    };

    const loadPolicy = async () => {
        try {
            setPolicy(await refundApi.getPolicy());
        } catch (error: any) {
            showError(error.message || tr('Failed to load refund policy', 'تعذر تحميل سياسة الاسترداد'));
        }
    };

    useEffect(() => { loadRefunds(); loadStats(); loadPolicy(); }, []);
    useEffect(() => { loadRefunds(); }, [statusFilter]);

    const filtered = useMemo(() => {
        if (!searchQuery) return refunds;
        const q = searchQuery.toLowerCase();
        return refunds.filter(r => r.orderId.toLowerCase().includes(q) || r.reason.toLowerCase().includes(q) || r.requestedByName?.toLowerCase().includes(q));
    }, [refunds, searchQuery]);

    const totals = useMemo(() => ({
        pending: refunds.filter(r => r.status === 'PENDING').length,
        approved: refunds.filter(r => r.status === 'APPROVED').length,
        processed: refunds.filter(r => r.status === 'PROCESSED').length,
        rejected: refunds.filter(r => r.status === 'REJECTED').length,
        totalAmount: refunds.reduce((s, r) => s + (r.totalAmount || r.customAmount || 0), 0),
    }), [refunds]);

    const handleApprove = async (id: string) => {
        if (pendingAction) return;
        setPendingAction(`approve:${id}`);
        try { await refundApi.approveRefund(id); await loadRefunds(); await loadStats(); success(tr('Refund approved', 'تمت الموافقة على الاسترداد')); } catch (e: any) { showError(e.message); }
        finally { setPendingAction(null); }
    };

    const submitReject = async () => {
        if (!rejectRefundId || pendingAction) return;
        const reason = rejectReason.trim();
        if (!reason) {
            showError(tr('Rejection reason is required', 'سبب الرفض مطلوب'));
            return;
        }
        setPendingAction(`reject:${rejectRefundId}`);
        try {
            await refundApi.rejectRefund(rejectRefundId, reason);
            await loadRefunds();
            await loadStats();
            setSelectedRefund(null);
            setRejectRefundId(null);
            setRejectReason('');
            success(tr('Refund rejected', 'تم رفض الاسترداد'));
        } catch (e: any) { showError(e.message); }
        finally { setPendingAction(null); }
    };

    const handleProcess = async (id: string) => {
        if (pendingAction) return;
        setPendingAction(`process:${id}`);
        try { await refundApi.processRefund(id); await loadRefunds(); await loadStats(); success(tr('Refund processed', 'تم تنفيذ الاسترداد')); } catch (e: any) { showError(e.message); }
        finally { setPendingAction(null); }
    };

    const handleSavePolicy = async () => {
        if (!policy) return;
        try { await refundApi.updatePolicy(policy); success(tr('Policy saved successfully', 'تم حفظ سياسة الاسترداد')); } catch (e: any) { showError(e.message); }
    };

    const statusLabel = (status: string) => ({
        ALL: tr('All', 'الكل'),
        PENDING: t.refund_pending,
        APPROVED: t.refund_approved,
        REJECTED: t.refund_rejected,
        PROCESSED: t.refund_processed,
    } as Record<string, string>)[status] || status;

    return (
        <div className="p-4 md:p-8 lg:p-10 bg-app min-h-screen pb-24">
            {/* Header */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-8">
                <div>
                    <div className="flex items-center gap-4 mb-2">
                        <div className="w-14 h-14 rounded-[1.5rem] bg-gradient-to-br from-rose-600 to-orange-600 text-white flex items-center justify-center shadow-2xl shadow-rose-600/30">
                            <RotateCcw size={28} />
                        </div>
                        <h2 className="text-3xl font-black text-main uppercase tracking-tighter">{t.refund_manager_title}</h2>
                    </div>
                    <p className="text-muted font-bold text-xs uppercase tracking-widest opacity-60">{t.refund_requests} · {t.refund_approved} · {t.refund_processed} · {t.refund_rejected}</p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton data={filtered} columns={[
                        { key: 'orderId', label: tr('Order ID', 'رقم الطلب') },
                        { key: 'requestedByName', label: tr('Requester', 'طالب الاسترداد') },
                        { key: 'reason', label: tr('Reason', 'السبب') },
                        { key: 'reasonCategory', label: tr('Category', 'التصنيف') },
                        { key: 'refundMethod', label: tr('Method', 'الطريقة') },
                        { key: 'totalAmount', label: tr('Amount', 'المبلغ'), format: (v: any) => `${(v || 0).toLocaleString()} ${currency}` },
                        { key: 'status', label: tr('Status', 'الحالة') },
                        { key: 'createdAt', label: tr('Date', 'التاريخ'), format: (v: any) => v ? new Date(v).toLocaleDateString() : '' },
                    ]} filename="refunds" title={tr('Refund Report', 'تقرير الاستردادات')} />
                    <button onClick={() => { loadRefunds(); loadStats(); }} className="bg-gradient-to-r from-rose-600 to-orange-600 text-white px-5 py-2.5 rounded-xl shadow-lg font-black uppercase text-[10px] tracking-widest flex items-center gap-2 hover:scale-105 transition-transform">
                        <RefreshCw size={14} /> {t.refresh}
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                {[
                    { label: t.refund_pending, value: totals.pending, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
                    { label: t.refund_approved, value: totals.approved, icon: CheckCircle2, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                    { label: t.refund_processed, value: totals.processed, icon: Zap, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                    { label: t.refund_rejected, value: totals.rejected, icon: XCircle, color: 'text-rose-500', bg: 'bg-rose-500/10' },
                    { label: t.refund_total_value, value: `${totals.totalAmount.toLocaleString()} ${currency}`, icon: DollarSign, color: 'text-violet-500', bg: 'bg-violet-500/10' },
                ].map((stat, i) => (
                    <div key={i} className="card-primary border border-border p-5 rounded-[2rem] shadow-sm">
                        <div className={`w-9 h-9 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center mb-3`}><stat.icon size={16} /></div>
                        <p className="text-[8px] font-black text-muted uppercase tracking-widest mb-0.5">{stat.label}</p>
                        <h4 className="text-xl font-black text-main">{stat.value}</h4>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-8 bg-elevated/40 p-1.5 rounded-2xl border border-border w-fit">
                {TABS.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-gradient-to-r from-rose-600 to-orange-600 text-white shadow-lg' : 'text-muted hover:text-main hover:bg-elevated/60'}`}>
                        <tab.icon size={14} /> {(t as any)[tab.labelKey]}
                    </button>
                ))}
            </div>

            {/* LIST TAB */}
            {activeTab === 'list' && (
                <div className="space-y-4 animate-in slide-in-from-bottom-5 duration-150">
                    {/* Filters */}
                    <div className="flex flex-col md:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
                            <input type="text" placeholder={t.refund_search_placeholder} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-xl text-xs font-bold outline-none focus:border-rose-500 transition-colors text-main" />
                        </div>
                        <div className="flex gap-1 bg-elevated/40 p-1 rounded-xl border border-border">
                            {['ALL', 'PENDING', 'APPROVED', 'PROCESSED', 'REJECTED'].map(s => (
                                <button key={s} onClick={() => setStatusFilter(s)}
                                    className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${statusFilter === s ? 'bg-card text-main shadow-sm' : 'text-muted hover:text-main'}`}>
                                    {statusLabel(s)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Refund Table */}
                    <div className="card-primary border border-border rounded-[2.5rem] shadow-sm overflow-hidden">
                        <div className="responsive-table">
                            <table className="w-full text-left">
                                <thead className="bg-app/50 text-[9px] font-black uppercase text-muted tracking-[0.2em]">
                                    <tr>
                                        <th className="px-6 py-4">{tr('Order', 'الطلب')}</th>
                                        <th className="px-4 py-4">{tr('Requester', 'طالب الاسترداد')}</th>
                                        <th className="px-4 py-4">{tr('Reason', 'السبب')}</th>
                                        <th className="px-4 py-4">{tr('Method', 'الطريقة')}</th>
                                        <th className="px-4 py-4 text-right">{tr('Amount', 'المبلغ')}</th>
                                        <th className="px-4 py-4">{tr('Status', 'الحالة')}</th>
                                        <th className="px-4 py-4">{tr('Date', 'التاريخ')}</th>
                                        <th className="px-6 py-4 text-center">{tr('Actions', 'الإجراءات')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50">
                                    {isLoading && <tr><td colSpan={8} className="px-6 py-12 text-center text-muted text-sm">{tr('Loading...', 'جاري التحميل...')}</td></tr>}
                                    {!isLoading && filtered.length === 0 && <tr><td colSpan={8} className="px-6 py-12 text-center text-muted text-sm">{tr('No refund requests found.', 'لا توجد طلبات استرداد.')}</td></tr>}
                                    {filtered.map(r => {
                                        const st = STATUS_MAP[r.status] || STATUS_MAP.PENDING;
                                        return (
                                            <tr key={r.id} className="hover:bg-elevated/20 transition-all">
                                                <td className="px-6 py-4">
                                                    <p className="text-xs font-black text-main font-mono">#{r.orderId.slice(-8)}</p>
                                                    <p className="text-[9px] text-muted">{r.type}</p>
                                                </td>
                                                <td className="px-4 py-4 text-[10px] font-bold text-main">{r.requestedByName || '—'}</td>
                                                <td className="px-4 py-4">
                                                    <p className="text-[10px] font-bold text-main truncate max-w-[150px]">{r.reason}</p>
                                                    <p className="text-[8px] text-muted uppercase">{r.reasonCategory}</p>
                                                </td>
                                                <td className="px-4 py-4 text-[10px] font-bold text-muted uppercase">{r.refundMethod}</td>
                                                <td className="px-4 py-4 text-right font-mono text-xs font-black text-main">{(r.totalAmount || r.customAmount || 0).toLocaleString()} {currency}</td>
                                                <td className="px-4 py-4">
                                                    <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${st.bg} ${st.text}`}>{statusLabel(r.status)}</span>
                                                </td>
                                                <td className="px-4 py-4 text-[10px] text-muted">{new Date(r.createdAt).toLocaleDateString()}</td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        {r.status === 'PENDING' && (
                                                            <>
                                                                <button onClick={() => handleApprove(r.id)} className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors" title={tr('Approve', 'موافقة')}><CheckCircle2 size={14} /></button>
                                                                <button onClick={() => { setRejectRefundId(r.id); setRejectReason(''); }} disabled={Boolean(pendingAction)} className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-colors disabled:opacity-50" title={tr('Reject', 'رفض')}><XCircle size={14} /></button>
                                                            </>
                                                        )}
                                                        {r.status === 'APPROVED' && (
                                                            <button onClick={() => handleProcess(r.id)} className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors" title={tr('Process', 'تنفيذ')}><Zap size={14} /></button>
                                                        )}
                                                        <button onClick={() => setSelectedRefund(r)} className="p-1.5 rounded-lg bg-slate-500/10 text-slate-500 hover:bg-slate-500/20 transition-colors" title={tr('Details', 'التفاصيل')}><Eye size={14} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* STATS TAB */}
            {activeTab === 'stats' && (
                <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        <div className="card-primary border border-border rounded-[2.5rem] p-6 shadow-sm">
                            <h3 className="text-xs font-black text-muted uppercase tracking-widest mb-4">{tr('Refund Rate', 'معدل الاسترداد')}</h3>
                            <p className="text-4xl font-black text-main">{stats?.refundRate?.toFixed(1) || '0.0'}%</p>
                            <p className="text-[10px] text-muted mt-1">{isAr ? `${stats?.totalRefunds || 0} استرداد من ${stats?.totalOrders || 0} طلب` : `${stats?.totalRefunds || 0} refunds out of ${stats?.totalOrders || 0} orders`}</p>
                        </div>
                        <div className="card-primary border border-border rounded-[2.5rem] p-6 shadow-sm">
                            <h3 className="text-xs font-black text-muted uppercase tracking-widest mb-4">{tr('Total Refunded', 'إجمالي المسترد')}</h3>
                            <p className="text-4xl font-black text-rose-500">{(stats?.totalRefundedAmount || 0).toLocaleString()} <span className="text-lg text-muted">{currency}</span></p>
                            <p className="text-[10px] text-muted mt-1">{tr('Average:', 'المتوسط:')} {(stats?.avgRefundAmount || 0).toFixed(0)} {currency}</p>
                        </div>
                        <div className="card-primary border border-border rounded-[2.5rem] p-6 shadow-sm">
                            <h3 className="text-xs font-black text-muted uppercase tracking-widest mb-4">{tr('Top Reason', 'أكثر سبب')}</h3>
                            <p className="text-xl font-black text-main">{stats?.topReason || tr('N/A', 'لا يوجد')}</p>
                            <p className="text-[10px] text-muted mt-1">{isAr ? `${stats?.topReasonCount || 0} مرات` : `${stats?.topReasonCount || 0} occurrences`}</p>
                        </div>
                    </div>

                    {/* Reason Breakdown */}
                    {stats?.reasonBreakdown && (
                        <div className="card-primary border border-border rounded-[2.5rem] p-6 shadow-sm">
                            <h3 className="text-xs font-black text-muted uppercase tracking-widest mb-6">{tr('Reason Breakdown', 'توزيع الأسباب')}</h3>
                            <div className="space-y-3">
                                {(stats.reasonBreakdown || []).map((item: any, i: number) => {
                                    const maxCount = Math.max(...(stats.reasonBreakdown || []).map((r: any) => r.count || 0), 1);
                                    return (
                                        <div key={i} className="flex items-center gap-4">
                                            <p className="text-[10px] font-black text-muted w-36 truncate">{item.reason}</p>
                                            <div className="flex-1 h-5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-rose-500 to-orange-500 rounded-full transition-all" style={{ width: `${(item.count / maxCount) * 100}%` }} />
                                            </div>
                                            <p className="text-xs font-black text-main w-16 text-right">{item.count}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* POLICY TAB */}
            {activeTab === 'policy' && policy && (
                <div className="card-primary border border-border rounded-[2.5rem] p-8 shadow-sm animate-in slide-in-from-bottom-5 duration-150 max-w-2xl">
                    <h3 className="text-lg font-black text-main uppercase tracking-tight mb-6 flex items-center gap-2"><Shield size={18} className="text-rose-500" /> {tr('Refund Policy Configuration', 'إعداد سياسة الاسترداد')}</h3>
                    <div className="space-y-5">
                        {[
                            { key: 'maxRefundDays', label: tr('Max Days After Order', 'أقصى أيام بعد الطلب'), type: 'number' },
                            { key: 'requireManagerApproval', label: tr('Require Manager Approval', 'يتطلب موافقة مدير'), type: 'toggle' },
                            { key: 'maxAutoApproveAmount', label: tr('Auto-Approve Limit (below this amount)', 'حد الموافقة التلقائية'), type: 'number' },
                            { key: 'allowPartialRefund', label: tr('Allow Partial Refunds', 'السماح بالاسترداد الجزئي'), type: 'toggle' },
                        ].map(field => (
                            <div key={field.key} className="flex items-center justify-between p-4 bg-app rounded-2xl border border-border">
                                <label className="text-xs font-black text-main uppercase tracking-widest">{field.label}</label>
                                {field.type === 'toggle' ? (
                                    <button onClick={() => setPolicy({ ...policy, [field.key]: !policy[field.key] })}
                                        className={`w-12 h-6 rounded-full relative transition-all ${policy[field.key] ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}>
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${policy[field.key] ? 'right-1' : 'left-1'}`} />
                                    </button>
                                ) : (
                                    <input type="number" value={policy[field.key] || ''} onChange={e => setPolicy({ ...policy, [field.key]: Number(e.target.value) })}
                                        className="w-24 px-3 py-2 bg-card border border-border rounded-lg text-xs font-black text-main text-center outline-none focus:border-rose-500" />
                                )}
                            </div>
                        ))}
                    </div>
                    <button onClick={handleSavePolicy} className="mt-6 w-full py-3.5 bg-gradient-to-r from-rose-600 to-orange-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:shadow-lg transition-shadow">
                        {t.refund_save_policy}
                    </button>
                </div>
            )}

            {/* DETAIL DRAWER */}
            {selectedRefund && (
                <div className="fixed inset-0 bg-black/60  z-50 flex justify-end" onClick={() => setSelectedRefund(null)}>
                    <div className="w-full max-w-md bg-card h-full shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-border flex items-center justify-between sticky top-0 bg-card z-10">
                            <h3 className="text-lg font-black text-main">{t.refund_details}</h3>
                            <button onClick={() => setSelectedRefund(null)} className="p-2 text-muted hover:text-main"><X size={18} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            {[
                                { label: tr('Order ID', 'رقم الطلب'), value: selectedRefund.orderId },
                                { label: tr('Type', 'النوع'), value: selectedRefund.type },
                                { label: tr('Status', 'الحالة'), value: statusLabel(selectedRefund.status) },
                                { label: tr('Reason', 'السبب'), value: selectedRefund.reason },
                                { label: tr('Category', 'التصنيف'), value: selectedRefund.reasonCategory },
                                { label: tr('Method', 'الطريقة'), value: selectedRefund.refundMethod },
                                { label: tr('Requested By', 'طالب الاسترداد'), value: selectedRefund.requestedByName || '—' },
                                { label: tr('Amount', 'المبلغ'), value: `${(selectedRefund.totalAmount || selectedRefund.customAmount || 0).toLocaleString()} ${currency}` },
                                { label: tr('Date', 'التاريخ'), value: new Date(selectedRefund.createdAt).toLocaleString() },
                                ...(selectedRefund.rejectionReason ? [{ label: tr('Rejection Reason', 'سبب الرفض'), value: selectedRefund.rejectionReason }] : []),
                                ...(selectedRefund.processedAt ? [{ label: tr('Processed At', 'وقت التنفيذ'), value: new Date(selectedRefund.processedAt).toLocaleString() }] : []),
                            ].map((field, i) => (
                                <div key={i} className="p-3 bg-app rounded-xl border border-border">
                                    <p className="text-[8px] font-black text-muted uppercase tracking-widest mb-0.5">{field.label}</p>
                                    <p className="text-xs font-bold text-main">{field.value}</p>
                                </div>
                            ))}

                            {selectedRefund.status === 'PENDING' && (
                                <div className="flex gap-3 pt-4">
                                    <button onClick={() => { handleApprove(selectedRefund.id); setSelectedRefund(null); }} disabled={Boolean(pendingAction)}
                                        className="flex-1 py-3 bg-emerald-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-50">{t.refund_approved}</button>
                                    <button onClick={() => { setRejectRefundId(selectedRefund.id); setRejectReason(''); }} disabled={Boolean(pendingAction)}
                                        className="flex-1 py-3 bg-rose-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-50">{t.refund_rejected}</button>
                                </div>
                            )}
                            {selectedRefund.status === 'APPROVED' && (
                                <button onClick={() => { handleProcess(selectedRefund.id); setSelectedRefund(null); }} disabled={Boolean(pendingAction)}
                                    className="w-full py-3 bg-blue-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-50">{t.refund_processed}</button>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {rejectRefundId && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={() => !pendingAction && setRejectRefundId(null)}>
                    <div className="w-full max-w-md rounded-3xl border border-border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
                            <div>
                                <h3 className="text-lg font-black text-main">{tr('Reject refund', 'رفض الاسترداد')}</h3>
                                <p className="mt-1 text-xs font-bold text-muted">{tr('Write a clear reason for audit visibility.', 'اكتب سبب واضح يظهر في المراجعة.')}</p>
                            </div>
                            <button onClick={() => setRejectRefundId(null)} disabled={Boolean(pendingAction)} className="p-2 text-muted hover:text-main disabled:opacity-50"><X size={18} /></button>
                        </div>
                        <div className="p-5">
                            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={4} maxLength={240} autoFocus className="w-full resize-none rounded-xl border border-border bg-app p-3 text-sm font-bold text-main outline-none focus:border-rose-500" />
                        </div>
                        <div className="flex gap-3 border-t border-border p-4">
                            <button onClick={() => setRejectRefundId(null)} disabled={Boolean(pendingAction)} className="flex-1 rounded-xl border border-border bg-app py-3 text-xs font-black text-muted disabled:opacity-50">{tr('Cancel', 'إلغاء')}</button>
                            <button onClick={submitReject} disabled={Boolean(pendingAction) || !rejectReason.trim()} className="flex-1 rounded-xl bg-rose-500 py-3 text-xs font-black text-white disabled:opacity-50">{t.refund_rejected}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RefundManager;
