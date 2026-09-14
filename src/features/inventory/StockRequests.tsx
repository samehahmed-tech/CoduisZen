import React, { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
    PackagePlus, ClipboardList, Inbox, Send, CheckCircle2, Truck, PackageCheck,
    X, XCircle, Plus, Trash2, Search, ChevronDown, AlertTriangle, RefreshCw, Warehouse as WarehouseIcon,
} from 'lucide-react';
import { useInventoryStore } from '@/stores/useInventoryStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useConfirm } from '@/components/common/ConfirmProvider';
import { useToast } from '@/components/Toast';
import PageSkeleton from '@/components/common/PageSkeleton';

type TabKey = 'mine' | 'incoming';

const STATUS_META: Record<string, { ar: string; en: string; badge: string; dot: string }> = {
    REQUESTED: { ar: 'جديدة بانتظار المراجعة', en: 'Pending review', badge: 'text-amber-500 bg-amber-500/10 border-amber-500/25', dot: 'bg-amber-500' },
    RESERVED: { ar: 'معتمدة — جاهزة للصرف', en: 'Approved — ready to dispatch', badge: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/25', dot: 'bg-indigo-500' },
    DISPATCHED: { ar: 'تم صرفها — بانتظار الاستلام', en: 'Dispatched — awaiting receipt', badge: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/25', dot: 'bg-cyan-500' },
    RECEIVED: { ar: 'مستلمة ومقفلة', en: 'Received & closed', badge: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/25', dot: 'bg-emerald-500' },
    CANCELLED: { ar: 'ملغاة', en: 'Cancelled', badge: 'text-slate-500 bg-slate-500/10 border-slate-500/25', dot: 'bg-slate-500' },
};

const PRIORITY_META: Record<string, { ar: string; en: string; badge: string }> = {
    URGENT: { ar: 'عاجلة', en: 'Urgent', badge: 'text-rose-500 bg-rose-500/10 border-rose-500/25' },
    HIGH: { ar: 'عالية', en: 'High', badge: 'text-orange-500 bg-orange-500/10 border-orange-500/25' },
    NORMAL: { ar: 'عادية', en: 'Normal', badge: 'text-slate-500 bg-slate-500/10 border-slate-500/25' },
    LOW: { ar: 'منخفضة', en: 'Low', badge: 'text-slate-500 bg-slate-500/10 border-slate-500/25' },
};

const fmtDate = (value: any, lang: string) => {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        });
    } catch { return '—'; }
};

const inputCls = 'w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold';
const labelCls = 'text-[10px] font-black text-slate-400 uppercase ml-1';

const StockRequests: React.FC = () => {
    const { settings, branches } = useAuthStore(
        useShallow((s) => ({ settings: s.settings, branches: s.branches })),
    );
    const lang = settings.language === 'ar' ? 'ar' : 'en';
    const activeBranchId = settings.activeBranchId;
    const { confirm } = useConfirm();
    const toast = useToast();

    const {
        inventory, warehouses, transferRequests,
        fetchInventory, fetchWarehouses,
        fetchTransferRequests, fetchIncomingTransferRequests,
        createTransferRequest, approveTransferRequest,
        dispatchTransferRequest, receiveTransferRequest, cancelTransferRequest,
    } = useInventoryStore(
        useShallow((s) => ({
            inventory: s.inventory,
            warehouses: s.warehouses,
            transferRequests: s.transferRequests,
            fetchInventory: s.fetchInventory,
            fetchWarehouses: s.fetchWarehouses,
            fetchTransferRequests: s.fetchTransferRequests,
            fetchIncomingTransferRequests: s.fetchIncomingTransferRequests,
            createTransferRequest: s.createTransferRequest,
            approveTransferRequest: s.approveTransferRequest,
            dispatchTransferRequest: s.dispatchTransferRequest,
            receiveTransferRequest: s.receiveTransferRequest,
            cancelTransferRequest: s.cancelTransferRequest,
        })),
    );

    const [tab, setTab] = useState<TabKey>('mine');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showNewModal, setShowNewModal] = useState(false);
    const [reviewId, setReviewId] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const warehouseById = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);
    const branchById = useMemo(() => new Map((branches || []).map((b: any) => [b.id, b])), [branches]);
    const warehouseName = (id?: string | null) => {
        if (!id) return lang === 'ar' ? 'يحددها المخزن' : 'To be assigned';
        const w = warehouseById.get(id);
        return w ? (lang === 'ar' ? w.nameAr || w.name : w.name) : `—`;
    };
    const branchName = (id?: string | null) => {
        if (!id) return '—';
        const b: any = branchById.get(id);
        return b ? (lang === 'ar' ? b.nameAr || b.name : b.name) : id;
    };

    const load = React.useCallback(async () => {
        setLoading(true);
        try {
            await Promise.all([
                fetchInventory().catch(() => {}),
                fetchWarehouses().catch(() => {}),
                tab === 'mine'
                    ? fetchTransferRequests({ branchId: activeBranchId }).catch(() => {})
                    : fetchIncomingTransferRequests().catch(() => {}),
            ]);
        } finally {
            setLoading(false);
        }
    }, [tab, activeBranchId]);

    useEffect(() => { load(); }, [load]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (transferRequests || []).filter((r: any) => {
            if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
            if (!q) return true;
            const hay = `${r.id} ${branchName(r.branchId)} ${warehouseName(r.destinationWarehouseId)} ${(r.items || []).map((i: any) => i.itemName).join(' ')}`.toLowerCase();
            return hay.includes(q);
        });
    }, [transferRequests, statusFilter, search]);

    const counts = useMemo(() => {
        const c: Record<string, number> = { ALL: (transferRequests || []).length };
        for (const r of transferRequests || []) c[r.status] = (c[r.status] || 0) + 1;
        return c;
    }, [transferRequests]);

    const runAction = async (id: string, fn: () => Promise<any>, okMsg: string) => {
        setBusyId(id);
        try {
            await fn();
            toast.success(okMsg);
            await load();
        } catch (e: any) {
            const raw = String(e?.message || e?.error || '');
            const friendly = raw.includes('INSUFFICIENT_STOCK')
                ? (lang === 'ar' ? 'الرصيد غير كافٍ في مخزن الصرف — خفّض الكميات المعتمدة' : 'Insufficient stock in source warehouse — lower approved quantities')
                : raw.includes('ALL_LINES_REJECTED')
                    ? (lang === 'ar' ? 'تم رفض كل الأصناف — استخدم إلغاء الطلبية بدلاً من ذلك' : 'All lines rejected — cancel the request instead')
                    : (lang === 'ar' ? 'فشلت العملية' : 'Action failed');
            toast.error(friendly);
        } finally {
            setBusyId(null);
        }
    };

    const handleCancel = (r: any) => {
        confirm({
            title: lang === 'ar' ? 'إلغاء الطلبية' : 'Cancel request',
            message: lang === 'ar' ? `إلغاء الطلبية ${r.id}؟ سيتم تحرير أي كميات محجوزة.` : `Cancel request ${r.id}? Reserved quantities will be released.`,
            confirmText: lang === 'ar' ? 'إلغاء الطلبية' : 'Cancel request',
            cancelText: lang === 'ar' ? 'تراجع' : 'Back',
            variant: 'danger',
        }).then((ok) => {
            if (ok) runAction(r.id, () => cancelTransferRequest(r.id), lang === 'ar' ? 'تم إلغاء الطلبية' : 'Request cancelled');
        });
    };

    const reviewRequest = transferRequests.find((r: any) => r.id === reviewId) || null;

    if (loading && (transferRequests || []).length === 0) return <PageSkeleton type="table" rows={6} />;

    return (
        <div className="px-4 md:px-8 lg:px-10 py-6 space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg">
                        <ClipboardList size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl md:text-2xl font-black text-main tracking-tight">
                            {lang === 'ar' ? 'الطلبيات المخزنية' : 'Stock Requests'}
                        </h1>
                        <p className="text-[11px] font-bold text-muted">
                            {lang === 'ar' ? 'الفروع تطلب من المخزن المركزي — مراجعة وتعديل وصرف واستلام' : 'Branches order from central warehouse — review, adjust, dispatch, receive'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={load} className="p-2.5 rounded-xl border border-border text-muted hover:text-main transition-colors" title={lang === 'ar' ? 'تحديث' : 'Refresh'}>
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={() => setShowNewModal(true)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-black shadow-lg transition-all active:scale-95"
                    >
                        <PackagePlus size={18} />
                        {lang === 'ar' ? 'طلبية جديدة' : 'New request'}
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-2 p-1 rounded-2xl border border-border bg-card/60 w-fit">
                {([
                    { key: 'mine' as TabKey, label: lang === 'ar' ? 'طلبات فرعي' : 'My branch', icon: Send },
                    { key: 'incoming' as TabKey, label: lang === 'ar' ? 'الوارد للمراجعة' : 'Inbox to review', icon: Inbox },
                ]).map((t) => (
                    <button
                        key={t.key}
                        onClick={() => { setTab(t.key); setStatusFilter('ALL'); setExpandedId(null); }}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all ${tab === t.key ? 'bg-indigo-600 text-white shadow' : 'text-muted hover:text-main'}`}
                    >
                        <t.icon size={16} />
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                    <Search size={16} className="absolute top-1/2 -translate-y-1/2 right-3 text-muted" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={lang === 'ar' ? 'بحث برقم الطلبية / صنف...' : 'Search by ID / item...'}
                        className="pl-4 pr-9 py-2.5 rounded-xl border border-border bg-card text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 w-64"
                    />
                </div>
                {['ALL', 'REQUESTED', 'RESERVED', 'DISPATCHED', 'RECEIVED', 'CANCELLED'].map((s) => (
                    <button
                        key={s}
                        onClick={() => setStatusFilter(s)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-black border transition-all ${statusFilter === s ? 'bg-main text-white border-transparent' : 'border-border text-muted hover:text-main'}`}
                        style={statusFilter === s ? { background: 'rgb(var(--text-main))', color: 'rgb(var(--bg-app))' } : undefined}
                    >
                        {s === 'ALL' ? (lang === 'ar' ? 'الكل' : 'All') : STATUS_META[s]?.[lang] || s}
                        <span className="ml-1 opacity-60 tabular-nums">({counts[s] || 0})</span>
                    </button>
                ))}
            </div>

            {/* List */}
            {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 opacity-40">
                    <ClipboardList size={48} className="text-muted" />
                    <p className="mt-4 font-black text-muted">{lang === 'ar' ? 'لا توجد طلبيات مطابقة' : 'No matching requests'}</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map((r: any) => {
                        const meta = STATUS_META[r.status] || STATUS_META.REQUESTED;
                        const pr = PRIORITY_META[r.priority] || PRIORITY_META.NORMAL;
                        const expanded = expandedId === r.id;
                        const busy = busyId === r.id;
                        return (
                            <div key={r.id} className="rounded-2xl border border-border bg-card overflow-hidden">
                                <div className="p-4 flex flex-wrap items-center gap-3">
                                    <button onClick={() => setExpandedId(expanded ? null : r.id)} className="flex items-center gap-3 flex-1 min-w-0 text-right">
                                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${meta.dot}`} />
                                        <span className="min-w-0">
                                            <span className="block font-black text-main text-sm truncate" dir="ltr">{r.id}</span>
                                            <span className="block text-[11px] font-bold text-muted truncate">
                                                {tab === 'incoming' ? branchName(r.branchId) : warehouseName(r.destinationWarehouseId)}
                                                {' • '}{(r.items || []).length}{lang === 'ar' ? ' أصناف' : ' items'}
                                                {' • '}{fmtDate(r.requestedAt, lang)}
                                            </span>
                                        </span>
                                        <ChevronDown size={16} className={`text-muted shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                                    </button>
                                    <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border ${pr.badge}`}>{pr[lang]}</span>
                                    <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border ${meta.badge}`}>{meta[lang]}</span>
                                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                        {r.status === 'REQUESTED' && tab === 'incoming' && (
                                            <button
                                                disabled={busy}
                                                onClick={() => setReviewId(r.id)}
                                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black transition-all disabled:opacity-50"
                                            >
                                                <Search size={14} />
                                                {lang === 'ar' ? 'مراجعة وقبول' : 'Review'}
                                            </button>
                                        )}
                                        {r.status === 'RESERVED' && (
                                            <button
                                                disabled={busy}
                                                onClick={() => runAction(r.id, () => dispatchTransferRequest(r.id), lang === 'ar' ? 'تم صرف الطلبية' : 'Request dispatched')}
                                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-black transition-all disabled:opacity-50"
                                            >
                                                <Truck size={14} />
                                                {lang === 'ar' ? 'صرف' : 'Dispatch'}
                                            </button>
                                        )}
                                        {r.status === 'DISPATCHED' && (
                                            <button
                                                disabled={busy}
                                                onClick={() => runAction(r.id, () => receiveTransferRequest(r.id), lang === 'ar' ? 'تم استلام الطلبية' : 'Request received')}
                                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition-all disabled:opacity-50"
                                            >
                                                <PackageCheck size={14} />
                                                {lang === 'ar' ? 'استلام' : 'Receive'}
                                            </button>
                                        )}
                                        {['REQUESTED', 'RESERVED'].includes(r.status) && (
                                            <button
                                                disabled={busy}
                                                onClick={() => handleCancel(r)}
                                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 text-xs font-black transition-all disabled:opacity-50"
                                            >
                                                <XCircle size={14} />
                                                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {expanded && (
                                    <div className="border-t border-border px-4 py-3 bg-slate-50/50 dark:bg-slate-900/30">
                                        {(r.notes) && (
                                            <p className="text-xs font-bold text-muted mb-3">📝 {r.notes}</p>
                                        )}
                                        <div className="overflow-x-auto rounded-xl border border-border">
                                            <table className="w-full text-sm min-w-[560px]">
                                                <thead>
                                                    <tr className="bg-slate-100 dark:bg-slate-800 text-[10px] uppercase text-muted">
                                                        <th className="text-right px-3 py-2 font-black">{lang === 'ar' ? 'الصنف' : 'Item'}</th>
                                                        <th className="px-3 py-2 font-black">{lang === 'ar' ? 'المطلوب' : 'Requested'}</th>
                                                        <th className="px-3 py-2 font-black">{lang === 'ar' ? 'المعتمد' : 'Approved'}</th>
                                                        <th className="px-3 py-2 font-black">{lang === 'ar' ? 'المصروف' : 'Dispatched'}</th>
                                                        <th className="px-3 py-2 font-black">{lang === 'ar' ? 'المستلم' : 'Received'}</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(r.items || []).map((it: any) => (
                                                        <tr key={it.id} className="border-t border-border/50">
                                                            <td className="px-3 py-2 font-bold text-main">{it.itemName || it.itemId}<span className="text-muted text-[11px]"> ({it.unit || ''})</span></td>
                                                            <td className="px-3 py-2 text-center font-black tabular-nums">{it.requestedQty}</td>
                                                            <td className={`px-3 py-2 text-center font-black tabular-nums ${it.approvedQty !== null && it.approvedQty !== it.requestedQty ? 'text-indigo-500' : ''}`}>
                                                                {it.approvedQty ?? '—'}
                                                            </td>
                                                            <td className="px-3 py-2 text-center tabular-nums">{it.dispatchedQty ?? '—'}</td>
                                                            <td className="px-3 py-2 text-center tabular-nums">{it.receivedQty ?? '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-bold text-muted">
                                            <span>{lang === 'ar' ? 'من مخزن:' : 'Source:'} {warehouseName(r.sourceWarehouseId)}</span>
                                            <span>{lang === 'ar' ? 'إلى مخزن:' : 'Dest:'} {warehouseName(r.destinationWarehouseId)}</span>
                                            {tab === 'mine' && r.branchId && <span>{lang === 'ar' ? 'الفرع:' : 'Branch:'} {branchName(r.branchId)}</span>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {showNewModal && (
                <NewRequestModal
                    lang={lang}
                    branchId={activeBranchId}
                    warehouses={warehouses}
                    inventory={inventory}
                    onClose={() => setShowNewModal(false)}
                    onSubmit={async (payload) => {
                        await runAction('new', () => createTransferRequest(payload), lang === 'ar' ? 'تم إرسال الطلبية للمخزن' : 'Request sent to warehouse');
                        setShowNewModal(false);
                        setTab('mine');
                    }}
                />
            )}
            {reviewRequest && (
                <ReviewModal
                    lang={lang}
                    request={reviewRequest}
                    warehouses={warehouses}
                    inventory={inventory}
                    branchName={branchName(rSafe(reviewRequest)?.branchId)}
                    onClose={() => setReviewId(null)}
                    onApprove={async (sourceWarehouseId, lines) => {
                        await runAction(reviewRequest.id, () => approveTransferRequest(reviewRequest.id, sourceWarehouseId, lines), lang === 'ar' ? 'تم قبول الطلبية وحجز الكميات' : 'Request approved and reserved');
                        setReviewId(null);
                    }}
                    onCancelRequest={async () => {
                        await runAction(reviewRequest.id, () => cancelTransferRequest(reviewRequest.id), lang === 'ar' ? 'تم رفض الطلبية وإلغاؤها' : 'Request rejected');
                        setReviewId(null);
                    }}
                />
            )}
        </div>
    );
};

const rSafe = (r: any) => r;

// ---------- New request modal ----------
const NewRequestModal: React.FC<{
    lang: string; branchId?: string; warehouses: any[]; inventory: any[];
    onClose: () => void; onSubmit: (payload: any) => Promise<void>;
}> = ({ lang, branchId, warehouses, inventory, onClose, onSubmit }) => {
    const myWarehouses = useMemo(
        () => (warehouses || []).filter((w) => w.isActive !== false && (!branchId || w.branchId === branchId)),
        [warehouses, branchId],
    );
    const [destId, setDestId] = useState(myWarehouses[0]?.id || '');
    const [priority, setPriority] = useState('NORMAL');
    const [notes, setNotes] = useState('');
    const [lines, setLines] = useState<Array<{ itemId: string; quantity: number }>>([{ itemId: '', quantity: 1 }]);
    const [itemSearch, setItemSearch] = useState('');
    const [saving, setSaving] = useState(false);

    const activeItems = useMemo(
        () => (inventory || []).filter((i: any) => i.isActive !== false),
        [inventory],
    );
    const searchedItems = useMemo(() => {
        const q = itemSearch.trim().toLowerCase();
        if (!q) return activeItems.slice(0, 60);
        return activeItems.filter((i: any) => `${i.name} ${i.nameAr || ''} ${i.sku || ''}`.toLowerCase().includes(q)).slice(0, 60);
    }, [activeItems, itemSearch]);

    const valid = destId && lines.some((l) => l.itemId && l.quantity > 0);

    const submit = async () => {
        if (!valid || saving) return;
        setSaving(true);
        try {
            await onSubmit({
                branchId,
                destinationWarehouseId: destId,
                priority,
                notes: notes.trim() || undefined,
                items: lines.filter((l) => l.itemId && l.quantity > 0).map((l) => {
                    const item = activeItems.find((i: any) => i.id === l.itemId);
                    return { itemId: l.itemId, quantity: l.quantity, unit: item?.unit };
                }),
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[110] p-4" onClick={onClose}>
            <div className="card-primary w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-indigo-50 dark:bg-indigo-950/20">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center"><PackagePlus size={22} /></div>
                        <div>
                            <h3 className="text-lg font-black text-slate-800 dark:text-white">{lang === 'ar' ? 'طلبية مخزنية جديدة' : 'New stock request'}</h3>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{lang === 'ar' ? 'من الفرع إلى المخزن المركزي' : 'From branch to central warehouse'}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={22} /></button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className={labelCls}>{lang === 'ar' ? 'مخزن الاستلام (فرعي)' : 'Receiving warehouse'}</label>
                            <select value={destId} onChange={(e) => setDestId(e.target.value)} className={inputCls}>
                                <option value="">{lang === 'ar' ? 'اختر المخزن...' : 'Select warehouse...'}</option>
                                {myWarehouses.map((w: any) => (
                                    <option key={w.id} value={w.id}>{lang === 'ar' ? w.nameAr || w.name : w.name} ({w.type})</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelCls}>{lang === 'ar' ? 'الأولوية' : 'Priority'}</label>
                            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
                                {Object.entries(PRIORITY_META).map(([k, v]) => (
                                    <option key={k} value={k}>{v[lang as 'ar' | 'en']}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className={labelCls}>{lang === 'ar' ? 'ملاحظات للمراجِع' : 'Notes for reviewer'}</label>
                        <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder={lang === 'ar' ? 'مثال: قبل نهاية الأسبوع...' : 'e.g. needed before weekend...'} />
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className={labelCls}>{lang === 'ar' ? 'الأصناف المطلوبة' : 'Requested items'}</label>
                            <div className="relative w-52">
                                <Search size={14} className="absolute top-1/2 -translate-y-1/2 right-2.5 text-muted" />
                                <input value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder={lang === 'ar' ? 'بحث...' : 'Search...'} className="w-full pl-3 pr-8 py-2 text-sm rounded-xl border border-border bg-card font-bold outline-none" />
                            </div>
                        </div>
                        {lines.map((line, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                                <select
                                    value={line.itemId}
                                    onChange={(e) => setLines((prev) => prev.map((l, i) => i === idx ? { ...l, itemId: e.target.value } : l))}
                                    className={`${inputCls} flex-1`}
                                >
                                    <option value="">{lang === 'ar' ? 'اختر صنف...' : 'Select item...'}</option>
                                    {searchedItems.map((i: any) => (
                                        <option key={i.id} value={i.id}>{lang === 'ar' ? i.nameAr || i.name : i.name} ({i.unit})</option>
                                    ))}
                                </select>
                                <input
                                    type="number" min={0} step="any"
                                    value={line.quantity}
                                    onChange={(e) => setLines((prev) => prev.map((l, i) => i === idx ? { ...l, quantity: Number(e.target.value) } : l))}
                                    className={`${inputCls} w-28 tabular-nums`}
                                    placeholder="Qty"
                                />
                                <button
                                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                                    disabled={lines.length === 1}
                                    className="p-3 rounded-xl border border-border text-muted hover:text-rose-500 disabled:opacity-30"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                        <button
                            onClick={() => setLines((prev) => [...prev, { itemId: '', quantity: 1 }])}
                            className="flex items-center gap-1.5 text-xs font-black text-indigo-500 hover:text-indigo-400 px-1"
                        >
                            <Plus size={14} /> {lang === 'ar' ? 'إضافة صنف' : 'Add item'}
                        </button>
                    </div>
                </div>
                <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-border text-sm font-black text-muted hover:text-main">{lang === 'ar' ? 'تراجع' : 'Back'}</button>
                    <button
                        onClick={submit}
                        disabled={!valid || saving}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-black shadow transition-all disabled:opacity-50"
                    >
                        <Send size={16} />
                        {saving ? (lang === 'ar' ? 'جارٍ الإرسال...' : 'Sending...') : (lang === 'ar' ? 'إرسال للمخزن' : 'Send to warehouse')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ---------- Review / approve modal (warehouse side) ----------
const ReviewModal: React.FC<{
    lang: string; request: any; warehouses: any[]; inventory: any[]; branchName: string;
    onClose: () => void;
    onApprove: (sourceWarehouseId: string, lines: Array<{ itemId: string; approvedQty: number }>) => Promise<void>;
    onCancelRequest: () => Promise<void>;
}> = ({ lang, request, warehouses, inventory, branchName, onClose, onApprove, onCancelRequest }) => {
    const candidates = useMemo(() => {
        const list = (warehouses || []).filter((w: any) => w.isActive !== false && w.branchId !== request.branchId);
        return [...list].sort((a: any, b: any) => (a.type === 'MAIN' ? -1 : 0) - (b.type === 'MAIN' ? -1 : 0));
    }, [warehouses, request.branchId]);
    const [sourceId, setSourceId] = useState(candidates.find((w: any) => w.type === 'MAIN')?.id || candidates[0]?.id || '');
    const [edits, setEdits] = useState<Record<string, number>>(() =>
        Object.fromEntries((request.items || []).map((it: any) => [it.itemId, it.requestedQty])),
    );
    const [saving, setSaving] = useState(false);
    const [rejecting, setRejecting] = useState(false);

    const stockOf = (itemId: string) => {
        const item = (inventory || []).find((i: any) => i.id === itemId);
        return Number(item?.warehouseQuantities?.find((wq: any) => wq.warehouseId === sourceId)?.quantity || 0);
    };

    const lines = (request.items || []).map((it: any) => ({ itemId: it.itemId, approvedQty: Number(edits[it.itemId] ?? it.requestedQty) }));
    const totalApproved = lines.reduce((s: number, l: any) => s + (l.approvedQty > 0 ? l.approvedQty : 0), 0);
    const shortfalls = lines.filter((l: any) => l.approvedQty > stockOf(l.itemId));

    const submit = async (asIs: boolean) => {
        if (!sourceId || saving) return;
        setSaving(true);
        try {
            const payload = asIs
                ? (request.items || []).map((it: any) => ({ itemId: it.itemId, approvedQty: it.requestedQty }))
                : lines;
            await onApprove(sourceId, payload);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[110] p-4" onClick={onClose}>
            <div className="card-primary w-full max-w-3xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-indigo-50 dark:bg-indigo-950/20">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center"><WarehouseIcon size={22} /></div>
                        <div>
                            <h3 className="text-lg font-black text-slate-800 dark:text-white">{lang === 'ar' ? 'مراجعة الطلبية' : 'Review request'}</h3>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest" dir="ltr">{request.id} • {branchName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={22} /></button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto">
                    {request.notes && (
                        <p className="text-xs font-bold text-amber-600 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2">📝 {request.notes}</p>
                    )}
                    <div className="space-y-1.5">
                        <label className={labelCls}>{lang === 'ar' ? 'مخزن الصرف (المركزي)' : 'Source warehouse'}</label>
                        <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className={inputCls}>
                            <option value="">{lang === 'ar' ? 'اختر مخزن الصرف...' : 'Select source...'}</option>
                            {candidates.map((w: any) => (
                                <option key={w.id} value={w.id}>{lang === 'ar' ? w.nameAr || w.name : w.name} ({w.type})</option>
                            ))}
                        </select>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-border">
                        <table className="w-full text-sm min-w-[560px]">
                            <thead>
                                <tr className="bg-slate-100 dark:bg-slate-800 text-[10px] uppercase text-muted">
                                    <th className="text-right px-3 py-2 font-black">{lang === 'ar' ? 'الصنف' : 'Item'}</th>
                                    <th className="px-3 py-2 font-black">{lang === 'ar' ? 'المطلوب' : 'Requested'}</th>
                                    <th className="px-3 py-2 font-black">{lang === 'ar' ? 'المتاح' : 'Available'}</th>
                                    <th className="px-3 py-2 font-black">{lang === 'ar' ? 'المعتمد ✏️' : 'Approved ✏️'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(request.items || []).map((it: any) => {
                                    const avail = stockOf(it.itemId);
                                    const val = edits[it.itemId] ?? it.requestedQty;
                                    const short = val > avail;
                                    return (
                                        <tr key={it.id} className="border-t border-border/50">
                                            <td className="px-3 py-2 font-bold text-main">{it.itemName || it.itemId}<span className="text-muted text-[11px]"> ({it.unit || ''})</span></td>
                                            <td className="px-3 py-2 text-center font-black tabular-nums">{it.requestedQty}</td>
                                            <td className={`px-3 py-2 text-center font-black tabular-nums ${avail < it.requestedQty ? 'text-rose-500' : 'text-emerald-500'}`}>{avail}</td>
                                            <td className="px-3 py-2">
                                                <input
                                                    type="number" min={0} step="any"
                                                    value={val}
                                                    onChange={(e) => setEdits((prev) => ({ ...prev, [it.itemId]: Number(e.target.value) }))}
                                                    className={`${inputCls} !py-2 text-center tabular-nums ${short ? '!border-rose-500' : ''}`}
                                                />
                                                {short && (
                                                    <p className="text-[10px] font-bold text-rose-500 mt-1 flex items-center gap-1"><AlertTriangle size={10} />{lang === 'ar' ? 'أعلى من المتاح' : 'Exceeds stock'}</p>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-[11px] font-bold text-muted">
                        {lang === 'ar'
                            ? 'صفر في خانة المعتمد = حذف الصنف من الطلبية. القبول يحجز الكميات فوراً من مخزن الصرف.'
                            : 'Zero approved = drop the line. Approving instantly reserves quantities from the source warehouse.'}
                    </p>
                </div>
                <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap justify-between gap-2">
                    <button
                        onClick={async () => {
                            if (!rejecting && window.confirm(lang === 'ar' ? 'رفض وإلغاء الطلبية؟' : 'Reject and cancel the request?')) {
                                setRejecting(true);
                                try { await onCancelRequest(); } finally { setRejecting(false); }
                            }
                        }}
                        disabled={saving || rejecting}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 text-sm font-black disabled:opacity-50"
                    >
                        <XCircle size={16} /> {lang === 'ar' ? 'رفض الطلبية' : 'Reject'}
                    </button>
                    <div className="flex gap-2">
                        <button
                            onClick={() => submit(true)}
                            disabled={!sourceId || saving}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-indigo-500/40 text-indigo-500 hover:bg-indigo-500/10 text-sm font-black disabled:opacity-50"
                        >
                            <CheckCircle2 size={16} /> {lang === 'ar' ? 'قبول كما هي' : 'Accept as-is'}
                        </button>
                        <button
                            onClick={() => submit(false)}
                            disabled={!sourceId || saving || totalApproved === 0 || shortfalls.length > 0}
                            title={shortfalls.length > 0 ? (lang === 'ar' ? 'كميات أعلى من المتاح' : 'Quantities exceed stock') : undefined}
                            className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-black shadow disabled:opacity-50"
                        >
                            <CheckCircle2 size={16} />
                            {saving ? (lang === 'ar' ? 'جارٍ الحجز...' : 'Reserving...') : (lang === 'ar' ? 'اعتماد الكميات' : 'Approve')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StockRequests;
