import React, { useEffect, useState } from 'react';
import {
    CheckCircle2, XCircle, Clock, Shield, RefreshCw, Key, Wallet,
    RotateCcw, ShoppingCart, Calendar, AlertTriangle, Eye, X
} from 'lucide-react';
import { approvalApi } from '../services/api/approval';
import { useAuthStore } from '../stores/useAuthStore';
import ExportButton from './common/ExportButton';
import { useToast } from './common/ToastProvider';

type Approval = {
    id: string;
    type: string;
    referenceId: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    details?: any;
    createdAt: string;
    resolvedAt?: string;
    resolvedBy?: string;
};

const TYPE_META: Record<string, { label: string; labelAr: string; icon: any; color: string }> = {
    REFUND: { label: 'Refund', labelAr: 'مرتجع', icon: RotateCcw, color: 'text-rose-500' },
    PURCHASE_ORDER: { label: 'Purchase Order', labelAr: 'أمر شراء', icon: ShoppingCart, color: 'text-blue-500' },
    LEAVE: { label: 'Leave Request', labelAr: 'طلب إجازة', icon: Calendar, color: 'text-emerald-500' },
    OVERTIME: { label: 'Overtime', labelAr: 'عمل إضافي', icon: Clock, color: 'text-amber-500' },
    VOID: { label: 'Void Order', labelAr: 'إلغاء طلب', icon: XCircle, color: 'text-red-500' },
    DISCOUNT: { label: 'Discount Override', labelAr: 'تجاوز خصم', icon: AlertTriangle, color: 'text-violet-500' },
    EXPENSE: { label: 'Expense', labelAr: 'مصروف', icon: Wallet, color: 'text-amber-500' },
    WASTAGE: { label: 'Wastage', labelAr: 'هالك وهدر', icon: AlertTriangle, color: 'text-rose-500' },
};

const STATUS_META = {
    PENDING: { en: 'Pending', ar: 'معلق' },
    APPROVED: { en: 'Approved', ar: 'معتمد' },
    REJECTED: { en: 'Rejected', ar: 'مرفوض' },
};

const ApprovalCenter: React.FC = () => {
    const { settings } = useAuthStore();
    const lang = settings.language || 'en';
    const { success, error: showError } = useToast();
    const st = (s: string) => lang === 'ar' ? (STATUS_META as any)[s]?.ar || s : (STATUS_META as any)[s]?.en || s;

    const [approvals, setApprovals] = useState<Approval[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null);
    const [pinModal, setPinModal] = useState<{ approvalId: string } | null>(null);
    const [rejectModal, setRejectModal] = useState<{ approvalId: string } | null>(null);
    const [pin, setPin] = useState('');
    const [pinError, setPinError] = useState('');
    const [rejectReason, setRejectReason] = useState('');

    const load = async () => {
        setIsLoading(true);
        try {
            setApprovals(await approvalApi.getAll(settings.activeBranchId));
        } catch (error: any) {
            showError(error.message || (lang === 'ar' ? 'تعذر تحميل طلبات الاعتماد' : 'Failed to load approvals'));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const filtered = statusFilter === 'ALL' ? approvals : approvals.filter(a => a.status === statusFilter);
    const pending = approvals.filter(a => a.status === 'PENDING').length;
    const formatDetailLabel = (key: string) => {
        const labels: Record<string, { en: string; ar: string }> = {
            status: { en: 'Status', ar: 'الحالة' },
            referenceId: { en: 'Reference', ar: 'المرجع' },
            description: { en: 'Description', ar: 'الوصف' },
            amount: { en: 'Amount', ar: 'المبلغ' },
            debitAccountCode: { en: 'Expense account', ar: 'حساب المصروف' },
            creditAccountCode: { en: 'Payment account', ar: 'حساب الدفع' },
            requestedBy: { en: 'Requested by', ar: 'طالب الاعتماد' },
            requestedAt: { en: 'Requested at', ar: 'وقت الطلب' },
            rejectedReason: { en: 'Rejection reason', ar: 'سبب الرفض' },
            resolvedByName: { en: 'Resolved by', ar: 'تم بواسطة' },
            itemName: { en: 'Item', ar: 'الصنف' },
            warehouseName: { en: 'Warehouse', ar: 'المخزن' },
            quantity: { en: 'Quantity', ar: 'الكمية' },
            unit: { en: 'Unit', ar: 'الوحدة' },
            reason: { en: 'Reason', ar: 'السبب' },
            notes: { en: 'Notes', ar: 'ملاحظات' },
            costImpact: { en: 'Cost impact', ar: 'أثر التكلفة' },
            movementId: { en: 'Stock movement', ar: 'حركة المخزون' },
        };
        return lang === 'ar' ? (labels[key]?.ar || key) : (labels[key]?.en || key);
    };
    const detailEntries = (details?: any) => Object.entries(details || {})
        .filter(([key]) => !['backfilled'].includes(key))
        .map(([key, value]) => ({
            key,
            label: formatDetailLabel(key),
            value: value == null ? '-' : typeof value === 'object' ? JSON.stringify(value) : String(value),
        }));

    const handleVerifyPin = async () => {
        if (!pinModal || !pin) return;
        setIsVerifying(true); setPinError('');
        try {
            await approvalApi.verifyPin({ pin, approvalId: pinModal.approvalId, branchId: settings.activeBranchId });
            success(lang === 'ar' ? 'تم اعتماد الطلب بنجاح' : 'Approval verified successfully');
            setPinModal(null); setPin('');
            await load();
        } catch (e: any) {
            const msg = e.message || (lang === 'ar' ? 'PIN غير صحيح' : 'Invalid PIN');
            setPinError(msg);
            showError(msg);
        } finally { setIsVerifying(false); }
    };

    const handleReject = async () => {
        if (!rejectModal) return;
        setIsVerifying(true);
        try {
            await approvalApi.reject(rejectModal.approvalId, { reason: rejectReason || undefined });
            success(lang === 'ar' ? 'تم رفض الطلب' : 'Approval rejected');
            setRejectModal(null);
            setRejectReason('');
            await load();
        } catch (e: any) {
            showError(e.message || (lang === 'ar' ? 'تعذر رفض الطلب' : 'Failed to reject approval'));
        } finally {
            setIsVerifying(false);
        }
    };

    const tr = (key: string, fallback: string) => {
        const labels: Record<string, { en: string; ar: string }> = {
            'Pending': { en: 'Pending', ar: 'معلق' },
            'Approved': { en: 'Approved', ar: 'معتمد' },
            'Rejected': { en: 'Rejected', ar: 'مرفوض' },
            'Approval Center': { en: 'Approval Center', ar: 'مركز الموافقات' },
            'Centralized Approval Workflow': { en: 'Centralized Approval Workflow', ar: 'موافقات مركزية لجميع العمليات' },
            'Refresh': { en: 'Refresh', ar: 'تحديث' },
            'Total': { en: 'Total', ar: 'الإجمالي' },
            'Type': { en: 'Type', ar: 'النوع' },
            'Reference': { en: 'Reference', ar: 'المرجع' },
            'Status': { en: 'Status', ar: 'الحالة' },
            'Date': { en: 'Date', ar: 'التاريخ' },
            'Actions': { en: 'Actions', ar: 'الإجراءات' },
            'Manager PIN Required': { en: 'Manager PIN Required', ar: 'PIN المشرف مطلوب' },
            'Enter your PIN to approve this request.': { en: 'Enter your PIN to approve this request.', ar: 'أدخل رقم PIN للموافقة على هذا الطلب' },
            'Cancel': { en: 'Cancel', ar: 'إلغاء' },
            'Verify': { en: 'Verify', ar: 'تحقق' },
            'Reject': { en: 'Reject', ar: 'رفض' },
            'Reject Approval': { en: 'Reject Approval', ar: 'رفض الطلب' },
            'Rejection Reason': { en: 'Rejection reason', ar: 'سبب الرفض' },
            'Approval Details': { en: 'Approval Details', ar: 'تفاصيل الموافقة' },
            'Created': { en: 'Created', ar: 'تاريخ الإنشاء' },
            'Resolved': { en: 'Resolved', ar: 'تاريخ الاعتماد' },
            'Resolved By': { en: 'Resolved By', ar: 'تم بواسطة' },
            'Details': { en: 'Details', ar: 'التفاصيل' },
            'Details of request': { en: 'Details of request', ar: 'تفاصيل الطلب' },
            'All': { en: 'All', ar: 'الكل' },
            'Export': { en: 'Export', ar: 'تصدير' },
        };
        return labels[key] ? (lang === 'ar' ? labels[key].ar : labels[key].en) : fallback;
    };

    return (
        <div className="p-4 md:p-8 lg:p-10 bg-app min-h-screen pb-24">
            {/* Header */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-8">
                <div>
                    <div className="flex items-center gap-4 mb-2">
                        <div className="w-14 h-14 rounded-[1.5rem] bg-gradient-to-br from-emerald-600 to-teal-600 text-white flex items-center justify-center shadow-2xl shadow-emerald-600/30">
                            <Shield size={28} />
                        </div>
                        <h2 className="text-3xl font-black text-main uppercase tracking-tighter">{tr('Approval Center', 'Approval Center')}</h2>
                        {pending > 0 && <span className="px-3 py-1 bg-rose-500 text-white rounded-full text-xs font-black">{pending}</span>}
                    </div>
                    <p className="text-muted font-bold text-xs uppercase tracking-widest opacity-60">{tr('Centralized Approval Workflow', 'Centralized Approval Workflow')}</p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton data={filtered.map(a => ({ ...a, typeLabel: lang === 'ar' ? TYPE_META[a.type]?.labelAr || a.type : TYPE_META[a.type]?.label || a.type }))} columns={[
                        { key: 'typeLabel', label: tr('Type', 'Type') },
                        { key: 'referenceId', label: tr('Reference', 'Reference') },
                        { key: 'status', label: tr('Status', 'Status') },
                        { key: 'createdAt', label: tr('Date', 'Date'), format: (v: any) => v ? new Date(v).toLocaleDateString() : '' },
                        { key: 'resolvedBy', label: tr('Resolved By', 'Resolved By') },
                    ]} filename="approvals" title="Approval Report" />
                    <button onClick={load} className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-5 py-2.5 rounded-xl shadow-lg font-black uppercase text-[10px] tracking-widest flex items-center gap-2 hover:scale-105 transition-transform"><RefreshCw size={14} /> {tr('Refresh', 'Refresh')}</button>
                </div>
            </div>

            {/* KPI */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[
                    { label: tr('Pending', 'Pending'), value: pending, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
                    { label: tr('Approved', 'Approved'), value: approvals.filter(a => a.status === 'APPROVED').length, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                    { label: tr('Rejected', 'Rejected'), value: approvals.filter(a => a.status === 'REJECTED').length, icon: XCircle, color: 'text-rose-500', bg: 'bg-rose-500/10' },
                    { label: tr('Total', 'Total'), value: approvals.length, icon: Shield, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
                ].map((s, i) => (
                    <div key={i} className="card-primary border border-border p-5 rounded-[2rem] shadow-sm">
                        <div className={`w-9 h-9 rounded-xl ${s.bg} ${s.color} flex items-center justify-center mb-3`}><s.icon size={16} /></div>
                        <p className="text-[8px] font-black text-muted uppercase tracking-widest mb-0.5">{s.label}</p>
                        <h4 className="text-xl font-black text-main">{s.value}</h4>
                    </div>
                ))}
            </div>

            {/* Filter */}
            <div className="flex gap-1 mb-6 bg-elevated/40 p-1 rounded-xl border border-border w-fit">
                {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map(s => (
                    <button key={s} onClick={() => setStatusFilter(s)}
                        className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${statusFilter === s ? 'bg-card text-main shadow-sm' : 'text-muted hover:text-main'}`}>
                        {s === 'ALL' ? tr('All', 'ALL') : st(s)}
                    </button>
                ))}
            </div>

            {/* Table */}
            <div className="card-primary border border-border rounded-[2.5rem] shadow-sm overflow-hidden">
                <div className="responsive-table">
                    <table className="w-full text-left">
                        <thead className="bg-app/50 text-[9px] font-black uppercase text-muted tracking-[0.2em]">
                            <tr>
                                <th className="px-6 py-4">{tr('Type', 'Type')}</th>
                                <th className="px-4 py-4">{tr('Reference', 'Reference')}</th>
                                <th className="px-4 py-4">{tr('Status', 'Status')}</th>
                                <th className="px-4 py-4">{tr('Date', 'Date')}</th>
                                <th className="px-6 py-4 text-center">{tr('Actions', 'Actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {isLoading && <tr><td colSpan={5} className="px-6 py-12 text-center text-muted text-sm">{lang === 'ar' ? 'جارٍ التحميل...' : 'Loading...'}</td></tr>}
                            {!isLoading && filtered.length === 0 && <tr><td colSpan={5} className="px-6 py-12 text-center text-muted text-sm">{lang === 'ar' ? 'لا توجد طلبات موافقة.' : 'No approval requests.'}</td></tr>}
                            {filtered.map(a => {
                                const meta = TYPE_META[a.type] || { label: a.type, labelAr: a.type, icon: Shield, color: 'text-slate-500' };
                                return (
                                    <tr key={a.id} className="hover:bg-elevated/20 transition-all">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <meta.icon size={14} className={meta.color} />
                                                <span className="text-xs font-black text-main">{lang === 'ar' ? meta.labelAr : meta.label}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-[10px] font-mono font-bold text-muted">{a.referenceId?.slice(-10) || '—'}</td>
                                        <td className="px-4 py-4">
                                            <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${a.status === 'PENDING' ? 'bg-amber-500/10 text-amber-500' : a.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>{st(a.status)}</span>
                                        </td>
                                        <td className="px-4 py-4 text-[10px] text-muted">{new Date(a.createdAt).toLocaleDateString()}</td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex items-center justify-center gap-1.5">
                                                {a.status === 'PENDING' && (
                                                    <>
                                                        <button onClick={() => { setPinModal({ approvalId: a.id }); }} className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors" title={lang === 'ar' ? 'اعتماد' : 'Approve'}><Key size={14} /></button>
                                                        <button onClick={() => { setRejectModal({ approvalId: a.id }); setRejectReason(''); }} className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-colors" title={tr('Reject', 'Reject')}><XCircle size={14} /></button>
                                                    </>
                                                )}
                                                <button onClick={() => setSelectedApproval(a)} className="p-1.5 rounded-lg bg-slate-500/10 text-slate-500 hover:bg-slate-500/20 transition-colors" title={lang === 'ar' ? 'تفاصيل' : 'Details'}><Eye size={14} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* PIN Modal */}
            {pinModal && (
                <div className="fixed inset-0 bg-black/60  z-50 flex items-center justify-center p-4" onClick={() => setPinModal(null)}>
                    <div className="bg-card border border-border rounded-[2rem] w-full max-w-sm shadow-2xl text-center p-8" onClick={e => e.stopPropagation()}>
                        <Key size={40} className="text-emerald-500 mx-auto mb-4" />
                        <h3 className="text-lg font-black text-main mb-2">{tr('Manager PIN Required', 'Manager PIN Required')}</h3>
                        <p className="text-xs text-muted mb-6">{tr('Enter your PIN to approve this request.', 'Enter your PIN to approve this request.')}</p>
                        {pinError && <p className="text-[10px] font-black text-rose-500 mb-2">{pinError}</p>}
                        <input type="password" maxLength={6} value={pin} onChange={e => { setPin(e.target.value); setPinError(''); }} autoFocus
                            className="w-full px-6 py-4 bg-app border border-border rounded-xl text-2xl font-black text-main text-center tracking-[0.5em] outline-none focus:border-emerald-500 mb-4" placeholder="••••" disabled={isVerifying} />
                        <div className="flex gap-3">
                            <button onClick={() => setPinModal(null)} className="flex-1 py-3 bg-app border border-border rounded-xl text-xs font-black text-muted uppercase">{tr('Cancel', 'Cancel')}</button>
                            <button onClick={handleVerifyPin} disabled={isVerifying} className="flex-1 py-3 bg-emerald-500 text-white rounded-xl text-xs font-black uppercase">{isVerifying ? '...' : tr('Verify', 'Verify')}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reject Modal */}
            {rejectModal && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setRejectModal(null)}>
                    <div className="bg-card border border-border rounded-[2rem] w-full max-w-md shadow-2xl p-8" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-11 h-11 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                                <XCircle size={22} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-main">{tr('Reject Approval', 'Reject Approval')}</h3>
                                <p className="text-xs text-muted font-bold">{lang === 'ar' ? 'اكتب سبب الرفض ليظهر في سجل الموافقات.' : 'Add a rejection reason for the approval log.'}</p>
                            </div>
                        </div>
                        <textarea
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            className="w-full min-h-[110px] resize-none px-4 py-3 bg-app border border-border rounded-xl text-sm font-bold text-main outline-none focus:border-rose-500 mb-4"
                            placeholder={tr('Rejection Reason', 'Rejection reason')}
                            disabled={isVerifying}
                        />
                        <div className="flex gap-3">
                            <button onClick={() => setRejectModal(null)} className="flex-1 py-3 bg-app border border-border rounded-xl text-xs font-black text-muted uppercase">{tr('Cancel', 'Cancel')}</button>
                            <button onClick={handleReject} disabled={isVerifying} className="flex-1 py-3 bg-rose-500 text-white rounded-xl text-xs font-black uppercase">{isVerifying ? '...' : tr('Reject', 'Reject')}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Detail Drawer */}
            {selectedApproval && (
                <div className="fixed inset-0 bg-black/60  z-50 flex justify-end" onClick={() => setSelectedApproval(null)}>
                    <div className="w-full max-w-md bg-card h-full shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-border flex items-center justify-between sticky top-0 bg-card z-10">
                            <h3 className="text-lg font-black text-main">{tr('Approval Details', 'Approval Details')}</h3>
                            <button onClick={() => setSelectedApproval(null)} className="p-2 text-muted hover:text-main"><X size={18} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            {[
                                { label: tr('Type', 'Type'), value: lang === 'ar' ? (TYPE_META[selectedApproval.type]?.labelAr || selectedApproval.type) : (TYPE_META[selectedApproval.type]?.label || selectedApproval.type) },
                                { label: tr('Reference', 'Reference'), value: selectedApproval.referenceId },
                                { label: tr('Status', 'Status'), value: st(selectedApproval.status) },
                                { label: tr('Created', 'Created'), value: new Date(selectedApproval.createdAt).toLocaleString() },
                                ...(selectedApproval.resolvedAt ? [{ label: tr('Resolved', 'Resolved'), value: new Date(selectedApproval.resolvedAt).toLocaleString() }] : []),
                                ...(selectedApproval.resolvedBy ? [{ label: tr('Resolved By', 'Resolved By'), value: selectedApproval.resolvedBy }] : []),
                            ].map((f, i) => (
                                <div key={i} className="p-3 bg-app rounded-xl border border-border">
                                    <p className="text-[8px] font-black text-muted uppercase tracking-widest mb-0.5">{f.label}</p>
                                    <p className="text-xs font-bold text-main">{f.value}</p>
                                </div>
                            ))}
                            {selectedApproval.details && (
                                <div className="p-3 bg-app rounded-xl border border-border">
                                    <p className="text-[8px] font-black text-muted uppercase tracking-widest mb-1">{tr('Details', 'Details')}</p>
                                    <div className="space-y-2">
                                        {detailEntries(selectedApproval.details).map((item) => (
                                            <div key={item.key} className="flex items-start justify-between gap-4 rounded-lg bg-card/70 px-3 py-2">
                                                <span className="text-[10px] font-black text-muted">{item.label}</span>
                                                <span className="text-[11px] font-bold text-main text-end break-words">{item.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ApprovalCenter;
