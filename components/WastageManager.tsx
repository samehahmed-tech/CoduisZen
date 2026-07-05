import React, { useEffect, useMemo, useState } from 'react';
import {
    Trash2, DollarSign, AlertTriangle, Plus, X, Save, RefreshCw,
    Package, TrendingDown, BarChart3, Clock, Layers, Search
} from 'lucide-react';
import { wastageApi } from '../services/api/wastage';
import { useInventoryStore } from '../stores/useInventoryStore';
import { useAuthStore } from '../stores/useAuthStore';
import ExportButton from './common/ExportButton';
import { useToast } from './common/ToastProvider';

type WastageEntry = {
    id: string;
    itemId: string;
    itemName?: string;
    warehouseId: string;
    quantity: number;
    reason: string;
    notes?: string;
    performedBy?: string;
    costImpact?: number;
    createdAt: string;
};

type WastageTab = 'log' | 'record' | 'analytics';

const REASONS = ['Expired', 'Damaged', 'Overproduction', 'Spoiled', 'Spillage', 'Return', 'Quality Fail', 'Other'];
const reasonAr: Record<string, string> = {
    Expired: 'منتهي الصلاحية',
    Damaged: 'تالف',
    Overproduction: 'زيادة إنتاج',
    Spoiled: 'فساد',
    Spillage: 'انسكاب',
    Return: 'مرتجع',
    'Quality Fail': 'رفض جودة',
    Other: 'أخرى',
};

const WastageManager: React.FC = () => {
    const { settings } = useAuthStore();
    const { inventory, warehouses } = useInventoryStore();
    const currency = settings.currencySymbol || 'LE';
    const { success, error: showError } = useToast();
    const isAr = settings.language === 'ar';
    const tr = (en: string, ar: string) => isAr ? ar : en;
    const displayItemName = (item: any) => isAr ? (item.nameAr || item.name) : item.name;
    const displayWarehouseName = (wh: any) => isAr ? (wh.nameAr || wh.name) : wh.name;
    const displayReason = (reason: string) => isAr ? (reasonAr[reason] || reason) : reason;

    const [activeTab, setActiveTab] = useState<WastageTab>('log');
    const [entries, setEntries] = useState<WastageEntry[]>([]);
    const [report, setReport] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({ itemId: '', warehouseId: '', quantity: '1', reason: 'Expired', notes: '' });

    const load = async () => {
        setIsLoading(true);
        try {
            const [entries, rep] = await Promise.all([wastageApi.getRecent(100), wastageApi.getReport()]);
            setEntries(entries || []);
            setReport(rep);
        } catch { } finally { setIsLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const handleRecord = async () => {
        const quantity = Number(form.quantity);
        if (!form.itemId || !form.warehouseId || !Number.isFinite(quantity) || quantity <= 0) {
            showError(tr('Select item, warehouse, and a valid quantity.', 'اختر الصنف والمخزن وكمية صحيحة.'));
            return;
        }
        try {
            await wastageApi.record({
                itemId: form.itemId, warehouseId: form.warehouseId,
                quantity, reason: form.reason,
                notes: form.notes || undefined, performedBy: settings.currentUser?.name || undefined,
            });
            setShowModal(false);
            setForm({ itemId: '', warehouseId: '', quantity: '1', reason: 'Expired', notes: '' });
            await load();
            success(tr('Wastage recorded', 'تم تسجيل الهالك'));
        } catch (e: any) { showError(e.message); }
    };

    const totals = useMemo(() => ({
        totalEvents: entries.length,
        totalCost: entries.reduce((s, e) => s + (e.costImpact || 0), 0),
        totalQty: entries.reduce((s, e) => s + e.quantity, 0),
        topReason: (() => {
            const counts: Record<string, number> = {};
            entries.forEach(e => { counts[e.reason] = (counts[e.reason] || 0) + 1; });
            return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || tr('N/A', 'لا يوجد');
        })(),
    }), [entries, isAr]);

    return (
        <div className="p-4 md:p-8 lg:p-10 bg-app min-h-screen pb-24">
            {/* Header */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-8">
                <div>
                    <div className="flex items-center gap-4 mb-2">
                        <div className="w-14 h-14 rounded-[1.5rem] bg-gradient-to-br from-amber-600 to-red-600 text-white flex items-center justify-center shadow-2xl shadow-amber-600/30">
                            <Trash2 size={28} />
                        </div>
                        <h2 className="text-3xl font-black text-main uppercase tracking-tighter">{tr('Wastage Control', 'إدارة الهالك')}</h2>
                    </div>
                    <p className="text-muted font-bold text-xs uppercase tracking-widest opacity-60">{tr('Record · Analyze · Reduce', 'تسجيل · تحليل · تقليل')}</p>
                </div>
                <div className="flex gap-2">
                    <ExportButton data={entries} columns={[
                        { key: 'itemName', label: tr('Item', 'الصنف') },
                        { key: 'quantity', label: tr('Quantity', 'الكمية') },
                        { key: 'reason', label: tr('Reason', 'السبب') },
                        { key: 'notes', label: tr('Notes', 'ملاحظات') },
                        { key: 'performedBy', label: tr('Performed By', 'المسؤول') },
                        { key: 'costImpact', label: tr('Cost', 'التكلفة'), format: (v: any) => `${(v || 0).toLocaleString()} ${currency}` },
                        { key: 'createdAt', label: tr('Date', 'التاريخ'), format: (v: any) => v ? new Date(v).toLocaleDateString() : '' },
                    ]} filename="wastage" title={tr('Wastage Report', 'تقرير الهالك')} />
                    <button onClick={() => setShowModal(true)} className="bg-gradient-to-r from-amber-600 to-red-600 text-white px-5 py-2.5 rounded-xl shadow-lg font-black uppercase text-[10px] tracking-widest flex items-center gap-2 hover:scale-105 transition-transform"><Plus size={14} /> {tr('Record Wastage', 'تسجيل هالك')}</button>
                    <button onClick={load} aria-label={tr('Refresh wastage records', 'تحديث سجلات الهالك')} title={tr('Refresh', 'تحديث')} className="bg-slate-800 dark:bg-slate-700 text-white px-4 py-2.5 rounded-xl shadow-lg font-black uppercase text-[10px] tracking-widest flex items-center gap-2 hover:scale-105 transition-transform"><RefreshCw size={14} /></button>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[
                    { label: tr('Wastage Events', 'عمليات الهالك'), value: totals.totalEvents, icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10' },
                    { label: tr('Total Qty Lost', 'إجمالي الكمية المهدرة'), value: totals.totalQty, icon: Package, color: 'text-rose-500', bg: 'bg-rose-500/10' },
                    { label: tr('Cost Impact', 'أثر التكلفة'), value: `${totals.totalCost.toLocaleString()} ${currency}`, icon: TrendingDown, color: 'text-red-500', bg: 'bg-red-500/10' },
                    { label: tr('Top Reason', 'أكثر سبب'), value: displayReason(totals.topReason), icon: BarChart3, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
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
                {[
                    { id: 'log' as WastageTab, label: tr('Recent Log', 'آخر السجلات'), icon: Clock },
                    { id: 'analytics' as WastageTab, label: tr('Analytics', 'التحليلات'), icon: BarChart3 },
                ].map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-gradient-to-r from-amber-600 to-red-600 text-white shadow-lg' : 'text-muted hover:text-main hover:bg-elevated/60'}`}>
                        <tab.icon size={14} /> {tab.label}
                    </button>
                ))}
            </div>

            {/* LOG TAB */}
            {activeTab === 'log' && (
                <div className="card-primary border border-border rounded-[2.5rem] shadow-sm overflow-hidden animate-in slide-in-from-bottom-5 duration-150">
                    <div className="responsive-table">
                        <table className="w-full text-left">
                            <thead className="bg-app/50 text-[9px] font-black uppercase text-muted tracking-[0.2em]">
                                <tr>
                                    <th className="px-6 py-4">{tr('Item', 'الصنف')}</th>
                                    <th className="px-4 py-4">{tr('Qty', 'الكمية')}</th>
                                    <th className="px-4 py-4">{tr('Reason', 'السبب')}</th>
                                    <th className="px-4 py-4">{tr('Notes', 'ملاحظات')}</th>
                                    <th className="px-4 py-4">{tr('By', 'بواسطة')}</th>
                                    <th className="px-4 py-4 text-right">{tr('Cost', 'التكلفة')}</th>
                                    <th className="px-6 py-4">{tr('Date', 'التاريخ')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {isLoading && <tr><td colSpan={7} className="px-6 py-12 text-center text-muted text-sm">{tr('Loading...', 'جاري التحميل...')}</td></tr>}
                                {!isLoading && entries.length === 0 && <tr><td colSpan={7} className="px-6 py-12 text-center text-muted text-sm">{tr('No wastage records.', 'لا توجد سجلات هالك.')}</td></tr>}
                                {entries.map((e, i) => {
                                    const item = inventory.find(inv => inv.id === e.itemId);
                                    return (
                                        <tr key={e.id || i} className="hover:bg-elevated/20 transition-all">
                                            <td className="px-6 py-4 text-xs font-black text-main">{e.itemName || (item ? displayItemName(item) : e.itemId)}</td>
                                            <td className="px-4 py-4 font-mono text-xs font-black text-rose-500">{e.quantity}</td>
                                            <td className="px-4 py-4"><span className="px-2 py-1 rounded-lg bg-amber-500/10 text-amber-600 text-[9px] font-black uppercase">{displayReason(e.reason)}</span></td>
                                            <td className="px-4 py-4 text-[10px] text-muted truncate max-w-[150px]">{e.notes || '—'}</td>
                                            <td className="px-4 py-4 text-[10px] font-bold text-main">{e.performedBy || '—'}</td>
                                            <td className="px-4 py-4 text-right font-mono text-xs text-rose-500">{(e.costImpact || 0).toLocaleString()} {currency}</td>
                                            <td className="px-6 py-4 text-[10px] text-muted">{new Date(e.createdAt).toLocaleDateString()}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ANALYTICS TAB */}
            {activeTab === 'analytics' && report && (
                <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                    <div className="card-primary border border-border rounded-[2.5rem] p-6 shadow-sm">
                        <h3 className="text-lg font-black text-main uppercase tracking-tight mb-6">{tr('Wastage by Reason', 'الهالك حسب السبب')}</h3>
                        <div className="space-y-4">
                            {REASONS.map(reason => {
                                const count = entries.filter(e => e.reason === reason).length;
                                const maxCount = Math.max(...REASONS.map(r => entries.filter(e => e.reason === r).length), 1);
                                if (count === 0) return null;
                                return (
                                    <div key={reason} className="flex items-center gap-4">
                                        <p className="text-[10px] font-black text-muted w-28 truncate">{displayReason(reason)}</p>
                                        <div className="flex-1 h-5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-gradient-to-r from-amber-500 to-red-500 rounded-full transition-all" style={{ width: `${(count / maxCount) * 100}%` }} />
                                        </div>
                                        <p className="text-xs font-black text-main w-12 text-right">{count}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* RECORD MODAL */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60  z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
                    <div className="bg-card border border-border rounded-[2rem] w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-border flex items-center justify-between">
                            <h3 className="text-lg font-black text-main">{tr('Record Wastage', 'تسجيل هالك')}</h3>
                            <button onClick={() => setShowModal(false)} className="p-2 text-muted hover:text-main"><X size={18} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">{tr('Item', 'الصنف')}</label>
                                <select value={form.itemId} onChange={e => setForm({ ...form, itemId: e.target.value })}
                                    className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-amber-500 text-main">
                                    <option value="">{tr('Select item...', 'اختر الصنف...')}</option>
                                    {inventory.map(item => <option key={item.id} value={item.id}>{displayItemName(item)}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">{tr('Warehouse', 'المخزن')}</label>
                                <select value={form.warehouseId} onChange={e => setForm({ ...form, warehouseId: e.target.value })}
                                    className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-amber-500 text-main">
                                    <option value="">{tr('Select warehouse...', 'اختر المخزن...')}</option>
                                    {warehouses.map(wh => <option key={wh.id} value={wh.id}>{displayWarehouseName(wh)}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">{tr('Quantity', 'الكمية')}</label>
                                    <input type="number" min={1} value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })}
                                        className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-black outline-none focus:border-amber-500 text-main" />
                                </div>
                                <div>
                                    <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">{tr('Reason', 'السبب')}</label>
                                    <select value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
                                        className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-amber-500 text-main">
                                        {REASONS.map(r => <option key={r} value={r}>{displayReason(r)}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="text-[9px] font-black uppercase tracking-widest text-muted mb-1 block">{tr('Notes', 'ملاحظات')}</label>
                                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
                                    className="w-full px-4 py-3 bg-app border border-border rounded-xl text-xs font-bold outline-none focus:border-amber-500 text-main resize-none" />
                            </div>
                        </div>
                        <div className="p-6 border-t border-border flex gap-3">
                            <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 bg-app border border-border rounded-xl text-xs font-black text-muted uppercase tracking-widest">{tr('Cancel', 'إلغاء')}</button>
                            <button onClick={handleRecord} className="flex-1 px-4 py-3 bg-gradient-to-r from-amber-600 to-red-600 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"><Save size={14} /> {tr('Record', 'تسجيل')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WastageManager;
