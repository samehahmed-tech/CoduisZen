import React, { useEffect, useMemo, useState } from 'react';
import { Beef, Plus, X, RefreshCw, Package, ClipboardList, Layers, Search, AlertTriangle } from 'lucide-react';
import { butcheryApi, type ButcheryOutputPayload } from '../services/api/butchery';
import { useInventoryStore } from '../stores/useInventoryStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useToast } from './common/ToastProvider';

type Tab = 'list' | 'report' | 'templates';

const OUTPUT_TYPES = [
    { id: 'USABLE', en: 'Usable', ar: 'صالح للاستخدام' },
    { id: 'BY_PRODUCT', en: 'By-product', ar: 'منتج ثانوي' },
    { id: 'WASTE', en: 'Waste', ar: 'هالك' },
];

const WASTE_REASONS = ['Bone', 'Excess Fat', 'Damaged', 'Trim', 'Processing Loss', 'Other'];

const ButcheryManager: React.FC = () => {
    const { settings } = useAuthStore();
    const { inventory, warehouses, fetchInventory, fetchWarehouses } = useInventoryStore();
    const currency = settings.currencySymbol || 'LE';
    const { success, error: showError } = useToast();
    const isAr = settings.language === 'ar';
    const tr = (en: string, ar: string) => (isAr ? ar : en);

    const [tab, setTab] = useState<Tab>('list');
    const [ops, setOps] = useState<any[]>([]);
    const [report, setReport] = useState<any>(null);
    const [templates, setTemplates] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<any>(null);

    // Create / edit wizard state
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingStatus, setEditingStatus] = useState<string>('DRAFT');
    const [form, setForm] = useState({ sourceItemId: '', sourceQty: '20', warehouseId: '', notes: '' });
    const [outputs, setOutputs] = useState<ButcheryOutputPayload[]>([
        { itemId: '', quantity: 6, unit: 'KG', outputType: 'USABLE' },
    ]);

    const activeInventory = useMemo(() => inventory.filter((i: any) => i.isActive !== false), [inventory]);
    const activeWarehouses = useMemo(() => warehouses.filter((w: any) => w.isActive !== false), [warehouses]);
    const itemName = (id?: string) => {
        const it: any = activeInventory.find((i: any) => i.id === id);
        return it ? (isAr ? it.nameAr || it.name : it.name) : id || '—';
    };

    const load = async () => {
        setIsLoading(true);
        try {
            const [list, rep, tpl] = await Promise.all([
                butcheryApi.list(),
                butcheryApi.yieldReport().catch(() => null),
                butcheryApi.templates().catch(() => []),
            ]);
            setOps(list || []);
            setReport(rep);
            setTemplates(tpl || []);
        } catch (e: any) {
            showError(e.message || tr('Failed to load butchery data', 'تعذر تحميل بيانات التشريح'));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void fetchInventory();
        void fetchWarehouses();
    }, [fetchInventory, fetchWarehouses]);
    useEffect(() => {
        void load();
    }, []);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return ops;
        return ops.filter((o) => `${o.reference} ${o.sourceItemName} ${o.status}`.toLowerCase().includes(q));
    }, [ops, search]);

    const addOutputRow = () => setOutputs((p) => [...p, { itemId: '', quantity: 1, unit: 'KG', outputType: 'USABLE' }]);
    const updateRow = (idx: number, patch: Partial<ButcheryOutputPayload>) =>
        setOutputs((p) => p.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    const removeRow = (idx: number) => setOutputs((p) => p.filter((_, i) => i !== idx));

    const resetForm = () => {
        setEditingId(null);
        setEditingStatus('DRAFT');
        setForm({ sourceItemId: '', sourceQty: '20', warehouseId: '', notes: '' });
        setOutputs([{ itemId: '', quantity: 6, unit: 'KG', outputType: 'USABLE' }]);
    };

    const openCreate = () => {
        resetForm();
        setShowModal(true);
    };

    const openEdit = (op: any) => {
        setEditingId(op.id);
        setEditingStatus(op.status);
        setForm({
            sourceItemId: op.sourceItemId || '',
            sourceQty: String(op.sourceQty || ''),
            warehouseId: op.warehouseId || '',
            notes: op.notes || '',
        });
        setOutputs((op.outputs || []).map((o: any) => ({
            itemId: o.itemId || '',
            quantity: Number(o.quantity || 0),
            unit: o.unit || 'KG',
            outputType: o.outputType || 'USABLE',
            warehouseId: o.warehouseId || undefined,
            wasteReason: o.wasteReason || undefined,
        })));
        setShowModal(true);
    };

    const handleSave = async () => {
        const qty = Number(form.sourceQty);
        if (!form.sourceItemId || !form.warehouseId || !Number.isFinite(qty) || qty <= 0) {
            showError(tr('Select source item, warehouse and quantity.', 'اختر صنف المصدر والمخزن والكمية.'));
            return;
        }
        if (editingId && editingStatus === 'POSTED') {
            if (!window.confirm(tr(
                'This operation is already POSTED. Saving will reverse its stock effects and re-apply them with the corrected values in one transaction. Continue?',
                'هذه العملية معتمدة بالفعل. الحفظ سيعكس أثرها المخزني ويعيد تطبيقه بالقيم المصححة في عملية واحدة. متابعة؟',
            ))) return;
        }
        try {
            let saved;
            if (editingId) {
                saved = await butcheryApi.update(editingId, {
                    ...(editingStatus === 'DRAFT' ? { sourceItemId: form.sourceItemId } : {}),
                    sourceQty: qty,
                    outputs: outputs.map((o) => ({ ...o, itemId: o.itemId || undefined, quantity: Number(o.quantity) })),
                    notes: form.notes || undefined,
                });
            } else {
                saved = await butcheryApi.create({
                    sourceItemId: form.sourceItemId,
                    sourceQty: qty,
                    warehouseId: form.warehouseId,
                    notes: form.notes || undefined,
                    outputs: outputs.map((o) => ({ ...o, quantity: Number(o.quantity) })),
                });
            }
            setShowModal(false);
            resetForm();
            setSelected(saved);
            await useInventoryStore.getState().fetchInventory();
            await load();
            success(editingId
                ? tr('Operation updated (stock reversed & re-applied)', 'تم تحديث العملية (تم عكس المخزون وإعادة تطبيقه)')
                : tr('Butchery operation created as DRAFT', 'تم إنشاء عملية التشريح كمسودة'));
        } catch (e: any) {
            showError(e.message);
        }
    };

    const handlePost = async (id: string) => {
        try {
            const posted = await butcheryApi.post(id);
            setSelected(posted);
            await useInventoryStore.getState().fetchInventory();
            await load();
            success(tr('Butchery posted — inventory updated', 'تم اعتماد التشريح وتحديث المخزون'));
        } catch (e: any) {
            showError(e.message);
        }
    };

    const handleCancel = async (id: string) => {
        if (!window.confirm(tr('Cancel this operation? Posted operations will be reversed.', 'إلغاء هذه العملية؟ العمليات المعتمدة سيتم عكس قيدها.'))) return;
        try {
            await butcheryApi.cancel(id);
            setSelected(null);
            await useInventoryStore.getState().fetchInventory();
            await load();
            success(tr('Operation cancelled', 'تم إلغاء العملية'));
        } catch (e: any) {
            showError(e.message);
        }
    };

    const handleDelete = async (id: string, status: string) => {
        const posted = status === 'POSTED';
        const ok = window.confirm(posted
            ? tr(
                'PERMANENTLY delete this POSTED operation? Its stock effects will be reversed first (refused if outputs were already consumed). The audit trail is kept.',
                'حذف نهائي لهذه العملية المعتمدة؟ سيتم عكس أثرها المخزني أولًا (ويُرفض لو المخرجات اتستهلكت). سجل التدقيق محفوظ.',
            )
            : tr('Permanently delete this operation? This cannot be undone.', 'حذف نهائي لهذه العملية؟ لا يمكن التراجع.'));
        if (!ok) return;
        try {
            await butcheryApi.remove(id);
            setSelected(null);
            await useInventoryStore.getState().fetchInventory();
            await load();
            success(tr('Operation deleted', 'تم حذف العملية'));
        } catch (e: any) {
            showError(e.message);
        }
    };

    const statusColor = (s: string) =>
        s === 'POSTED' ? 'bg-emerald-500/15 text-emerald-500' : s === 'CANCELLED' ? 'bg-rose-500/15 text-rose-500' : 'bg-amber-500/15 text-amber-500';

    return (
        <div className="p-4 md:p-8 lg:p-10 bg-app min-h-screen pb-24">
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-8">
                <div>
                    <div className="flex items-center gap-4 mb-2">
                        <div className="w-14 h-14 rounded-[1.5rem] bg-gradient-to-br from-rose-700 to-amber-600 text-white flex items-center justify-center shadow-2xl shadow-rose-700/30">
                            <Beef size={28} />
                        </div>
                        <h2 className="text-3xl font-black text-main uppercase tracking-tighter">{tr('Butchery / Fabrication', 'التشريح والتقطيع')}</h2>
                    </div>
                    <p className="text-muted font-bold text-xs uppercase tracking-widest opacity-60">{tr('Transform · Yield · Cost', 'تحويل · yield · تكلفة')}</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={openCreate} className="bg-gradient-to-r from-rose-700 to-amber-600 text-white px-5 py-2.5 rounded-xl shadow-lg font-black uppercase text-[10px] tracking-widest flex items-center gap-2 hover:scale-105 transition-transform">
                        <Plus size={14} /> {tr('New Butchery', 'تشريح جديد')}
                    </button>
                    <button onClick={() => void load()} className="bg-slate-800 dark:bg-slate-700 text-white px-4 py-2.5 rounded-xl shadow-lg font-black uppercase text-[10px] tracking-widest flex items-center gap-2 hover:scale-105 transition-transform">
                        <RefreshCw size={14} />
                    </button>
                </div>
            </div>

            <div className="flex gap-2 mb-6">
                {[
                    { id: 'list' as Tab, label: tr('Operations', 'العمليات'), icon: ClipboardList },
                    { id: 'report' as Tab, label: tr('Yield Report', 'تقرير الـ Yield'), icon: Layers },
                    { id: 'templates' as Tab, label: tr('Templates', 'القوالب'), icon: Package },
                ].map((t) => (
                    <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 ${tab === t.id ? 'bg-rose-700 text-white' : 'bg-card text-muted'}`}>
                        <t.icon size={14} /> {t.label}
                    </button>
                ))}
            </div>

            {tab === 'list' && (
                <div className="bg-card rounded-2xl shadow overflow-hidden">
                    <div className="p-4 border-b border-default flex items-center gap-2">
                        <Search size={16} className="text-muted" />
                        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr('Search reference, item, status…', 'بحث برقم العملية أو الصنف…')} className="bg-transparent outline-none text-sm w-full text-main" />
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-muted text-[10px] uppercase tracking-widest border-b border-default">
                                    <th className="px-4 py-3 text-start">{tr('Reference', 'المرجع')}</th>
                                    <th className="px-4 py-3 text-start">{tr('Input', 'المدخل')}</th>
                                    <th className="px-4 py-3 text-start">{tr('Input Qty', 'كمية المدخل')}</th>
                                    <th className="px-4 py-3 text-start">{tr('Output Qty', 'كمية المخرجات')}</th>
                                    <th className="px-4 py-3 text-start">{tr('Yield %', 'نسبة الـ Yield')}</th>
                                    <th className="px-4 py-3 text-start">{tr('Status', 'الحالة')}</th>
                                    <th className="px-4 py-3 text-start">{tr('Actions', 'إجراءات')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading && <tr><td colSpan={7} className="px-6 py-12 text-center text-muted">{tr('Loading…', 'جارٍ التحميل…')}</td></tr>}
                                {!isLoading && filtered.length === 0 && <tr><td colSpan={7} className="px-6 py-12 text-center text-muted">{tr('No butchery operations.', 'لا توجد عمليات تشريح.')}</td></tr>}
                                {filtered.map((o) => (
                                    <tr key={o.id} className="border-b border-default hover:bg-hover">
                                        <td className="px-4 py-3 font-bold text-main">{o.reference}</td>
                                        <td className="px-4 py-3 text-main">{o.sourceItemName || o.sourceItemId}</td>
                                        <td className="px-4 py-3 text-main">{o.sourceQty} {o.sourceUnit}</td>
                                        <td className="px-4 py-3 text-main">{Number(o.totalOutputInSourceUnit || 0).toFixed(3)} {o.sourceUnit}</td>
                                        <td className="px-4 py-3 text-main font-black">{Number(o.usableYieldPct || 0).toFixed(1)}%</td>
                                        <td className="px-4 py-3"><span className={`px-2 py-1 rounded-lg text-[10px] font-black ${statusColor(o.status)}`}>{o.status}</span></td>
                                        <td className="px-4 py-3 flex gap-2">
                                            <button onClick={() => setSelected(o)} className="text-xs font-black text-sky-500 uppercase">{tr('View', 'عرض')}</button>
                                            {o.status === 'DRAFT' && <button onClick={() => void handlePost(o.id)} className="text-xs font-black text-emerald-500 uppercase">{tr('Post', 'اعتماد')}</button>}
                                            {o.status !== 'CANCELLED' && <button onClick={() => void handleCancel(o.id)} className="text-xs font-black text-rose-500 uppercase">{tr('Cancel', 'إلغاء')}</button>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {tab === 'report' && (
                <div className="bg-card rounded-2xl shadow p-6">
                    <h3 className="text-lg font-black text-main uppercase mb-4">{tr('Yield Report (posted operations)', 'تقرير الـ Yield (العمليات المعتمدة)')}</h3>
                    {!report || report.rows?.length === 0 ? (
                        <p className="text-muted text-sm">{tr('No posted operations yet.', 'لا توجد عمليات معتمدة بعد.')}</p>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                                {[
                                    { label: tr('Operations', 'العمليات'), value: report.totals?.count || 0 },
                                    { label: tr('Input Qty', 'إجمالي المدخلات'), value: Number(report.totals?.inputQty || 0).toFixed(2) },
                                    { label: tr('Output Qty', 'إجمالي المخرجات'), value: Number(report.totals?.outputQty || 0).toFixed(2) },
                                    { label: tr('Input Cost', 'تكلفة المدخلات'), value: `${Number(report.totals?.inputCost || 0).toFixed(2)} ${currency}` },
                                ].map((c) => (
                                    <div key={c.label} className="bg-app rounded-xl p-4">
                                        <div className="text-[10px] uppercase tracking-widest text-muted font-black">{c.label}</div>
                                        <div className="text-xl font-black text-main">{c.value}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-muted text-[10px] uppercase tracking-widest border-b border-default">
                                            <th className="px-4 py-3 text-start">{tr('Reference', 'المرجع')}</th>
                                            <th className="px-4 py-3 text-start">{tr('Input', 'المدخل')}</th>
                                            <th className="px-4 py-3 text-start">{tr('Yield %', 'Yield')}</th>
                                            <th className="px-4 py-3 text-start">{tr('Waste %', 'الهالك')}</th>
                                            <th className="px-4 py-3 text-start">{tr('Cost', 'التكلفة')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.rows.map((r: any) => (
                                            <tr key={r.id} className="border-b border-default">
                                                <td className="px-4 py-3 font-bold text-main">{r.reference}</td>
                                                <td className="px-4 py-3 text-main">{r.sourceQty} {r.sourceUnit}</td>
                                                <td className="px-4 py-3 text-main font-black">{Number(r.usableYieldPct || 0).toFixed(1)}%</td>
                                                <td className="px-4 py-3 text-main">{Number(r.wastePct || 0).toFixed(1)}%</td>
                                                <td className="px-4 py-3 text-main">{Number(r.sourceTotalCost || 0).toFixed(2)} {currency}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            )}

            {tab === 'templates' && (
                <div className="bg-card rounded-2xl shadow p-6">
                    <h3 className="text-lg font-black text-main uppercase mb-2">{tr('Yield Templates (expected %)', 'قوالب الـ Yield (النسب المتوقعة)')}</h3>
                    <p className="text-muted text-xs mb-4">{tr('Templates store expected yields only. Actual quantities are always recorded on the operation.', 'القوالب تحفظ النسب المتوقعة فقط. الكميات الفعلية تُسجل دائمًا على العملية.')}</p>
                    {templates.length === 0 ? (
                        <p className="text-muted text-sm">{tr('No templates yet. Create one from the API or a future release of this screen.', 'لا توجد قوالب بعد.')}</p>
                    ) : (
                        <div className="grid md:grid-cols-2 gap-3">
                            {templates.map((t: any) => (
                                <div key={t.id} className="bg-app rounded-xl p-4">
                                    <div className="font-black text-main">{t.name}</div>
                                    <div className="text-xs text-muted mb-2">{tr('Source', 'المصدر')}: {itemName(t.sourceItemId)}</div>
                                    {(t.lines || []).map((l: any) => (
                                        <div key={l.id} className="flex justify-between text-xs text-main py-1 border-b border-default">
                                            <span>{l.outputType === 'WASTE' ? tr('Waste', 'هالك') : itemName(l.itemId)} · {l.outputType}</span>
                                            <span className="font-black">{l.expectedPct}%</span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Detail drawer */}
            {selected && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
                    <div className="bg-card rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-black text-main">{selected.reference} · <span className={`px-2 py-1 rounded-lg text-[10px] ${statusColor(selected.status)}`}>{selected.status}</span></h3>
                            <button onClick={() => setSelected(null)} className="text-muted"><X size={18} /></button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                            {[
                                { label: tr('Input', 'المدخل'), value: `${selected.sourceQty} ${selected.sourceUnit}` },
                                { label: tr('Input Cost', 'تكلفة المدخل'), value: `${Number(selected.sourceTotalCost || 0).toFixed(2)} ${currency}` },
                                { label: tr('Usable Yield', 'Yield الصالح'), value: `${Number(selected.usableYieldPct || 0).toFixed(1)}%` },
                                { label: tr('Waste', 'الهالك'), value: `${Number(selected.wastePct || 0).toFixed(1)}%` },
                            ].map((c) => (
                                <div key={c.label} className="bg-app rounded-xl p-3">
                                    <div className="text-[10px] uppercase text-muted font-black">{c.label}</div>
                                    <div className="font-black text-main">{c.value}</div>
                                </div>
                            ))}
                        </div>
                        <table className="w-full text-sm mb-4">
                            <thead>
                                <tr className="text-muted text-[10px] uppercase border-b border-default">
                                    <th className="py-2 text-start">{tr('Output', 'المخرج')}</th>
                                    <th className="py-2 text-start">{tr('Qty', 'الكمية')}</th>
                                    <th className="py-2 text-start">{tr('Type', 'النوع')}</th>
                                    <th className="py-2 text-start">{tr('Yield', 'Yield')}</th>
                                    <th className="py-2 text-start">{tr('Cost', 'التكلفة')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(selected.outputs || []).map((o: any, i: number) => (
                                    <tr key={i} className="border-b border-default">
                                        <td className="py-2 text-main">{o.outputType === 'WASTE' ? `${tr('Waste', 'هالك')}${o.wasteReason ? ` (${o.wasteReason})` : ''}` : itemName(o.itemId)}</td>
                                        <td className="py-2 text-main">{o.quantity} {o.unit}</td>
                                        <td className="py-2 text-main text-xs">{o.outputType}</td>
                                        <td className="py-2 text-main">{Number(o.yieldPct || 0).toFixed(1)}%</td>
                                        <td className="py-2 text-main">{Number(o.totalAllocatedCost || 0).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {selected.variance && selected.variance.length > 0 && (
                            <div className="mb-4">
                                <h4 className="text-xs font-black uppercase text-muted mb-2">{tr('Expected vs Actual', 'المتوقع مقابل الفعلي')}</h4>
                                {selected.variance.map((v: any, i: number) => (
                                    <div key={i} className="flex justify-between text-xs text-main py-1 border-b border-default">
                                        <span>{itemName(v.itemId)}</span>
                                        <span>{v.expectedPct}% → {Number(v.actualPct).toFixed(1)}% (<span className={v.variancePct < 0 ? 'text-rose-500 font-black' : 'text-emerald-500 font-black'}>{v.variancePct > 0 ? '+' : ''}{v.variancePct}%</span>)</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {selected.status === 'DRAFT' && (
                            <div className="flex gap-2">
                                <button onClick={() => openEdit(selected)} className="flex-1 bg-sky-600 text-white py-2.5 rounded-xl font-black uppercase text-xs">{tr('Edit', 'تعديل')}</button>
                                <button onClick={() => void handlePost(selected.id)} className="flex-1 bg-emerald-600 text-white py-2.5 rounded-xl font-black uppercase text-xs">{tr('Post (update inventory)', 'اعتماد (تحديث المخزون)')}</button>
                                <button onClick={() => void handleDelete(selected.id, selected.status)} className="flex-1 bg-slate-600 text-white py-2.5 rounded-xl font-black uppercase text-xs">{tr('Delete', 'حذف')}</button>
                            </div>
                        )}
                        {selected.status === 'POSTED' && (
                            <div className="flex flex-col gap-2">
                                <div className="flex gap-2">
                                    <button onClick={() => openEdit(selected)} className="flex-1 bg-sky-600 text-white py-2.5 rounded-xl font-black uppercase text-xs">{tr('Edit (reverse & re-apply)', 'تعديل (عكس وإعادة تطبيق)')}</button>
                                    <button onClick={() => void handleDelete(selected.id, selected.status)} className="flex-1 bg-slate-600 text-white py-2.5 rounded-xl font-black uppercase text-xs">{tr('Delete', 'حذف')}</button>
                                </div>
                                <button onClick={() => void handleCancel(selected.id)} className="w-full bg-rose-600 text-white py-2.5 rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2">
                                    <AlertTriangle size={14} /> {tr('Reverse & Cancel (audit trail kept)', 'عكس وإلغاء (مع الاحتفاظ بسجل التدقيق)')}
                                </button>
                            </div>
                        )}
                        {selected.status === 'CANCELLED' && (
                            <button onClick={() => void handleDelete(selected.id, selected.status)} className="w-full bg-slate-600 text-white py-2.5 rounded-xl font-black uppercase text-xs">{tr('Delete permanently', 'حذف نهائي')}</button>
                        )}
                    </div>
                </div>
            )}

            {/* Create modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-card rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-black text-main uppercase">
                                {editingId
                                    ? (editingStatus === 'POSTED'
                                        ? tr('Edit Posted Operation', 'تعديل عملية معتمدة')
                                        : tr('Edit Draft', 'تعديل المسودة'))
                                    : tr('New Butchery Operation', 'عملية تشريح جديدة')}
                            </h3>
                            <button onClick={() => { setShowModal(false); resetForm(); }} className="text-muted"><X size={18} /></button>
                        </div>
                        {editingId && editingStatus === 'POSTED' && (
                            <p className="text-xs text-amber-500 font-bold mb-4">{tr('Saving will reverse the posted stock effects and re-apply them with the corrected values. Source item cannot be changed after posting.', 'الحفظ سيعكس الأثر المخزني المعتمد ويعيد تطبيقه بالقيم المصححة. لا يمكن تغيير صنف المصدر بعد الاعتماد.')}</p>
                        )}
                        <div className="grid md:grid-cols-3 gap-3 mb-4">
                            <label className="block">
                                <span className="text-[10px] font-black uppercase text-muted">{tr('Source Item', 'صنف المصدر')}</span>
                                <select value={form.sourceItemId} disabled={Boolean(editingId && editingStatus === 'POSTED')} onChange={(e) => {
                                    const it: any = activeInventory.find((i: any) => i.id === e.target.value);
                                    setForm((f) => ({ ...f, sourceItemId: e.target.value }));
                                    if (it) setOutputs((p) => p.map((r) => ({ ...r, unit: r.unit || it.unit })));
                                }} className="w-full bg-app border border-default rounded-xl px-3 py-2 text-sm text-main">
                                    <option value="">—</option>
                                    {activeInventory.map((i: any) => <option key={i.id} value={i.id}>{isAr ? i.nameAr || i.name : i.name} ({i.unit})</option>)}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-[10px] font-black uppercase text-muted">{tr('Quantity', 'الكمية')}</span>
                                <input value={form.sourceQty} onChange={(e) => setForm((f) => ({ ...f, sourceQty: e.target.value }))} type="number" min="0" step="0.001" className="w-full bg-app border border-default rounded-xl px-3 py-2 text-sm text-main" />
                            </label>
                            <label className="block">
                                <span className="text-[10px] font-black uppercase text-muted">{tr('Warehouse', 'المخزن')}</span>
                                <select value={form.warehouseId} disabled={Boolean(editingId)} onChange={(e) => setForm((f) => ({ ...f, warehouseId: e.target.value }))} className="w-full bg-app border border-default rounded-xl px-3 py-2 text-sm text-main">
                                    <option value="">—</option>
                                    {activeWarehouses.map((w: any) => <option key={w.id} value={w.id}>{isAr ? w.nameAr || w.name : w.name}</option>)}
                                </select>
                            </label>
                        </div>
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="text-xs font-black uppercase text-muted">{tr('Outputs (usable / by-product / waste)', 'المخرجات (صالح / ثانوي / هالك)')}</h4>
                            <button onClick={addOutputRow} className="text-xs font-black text-rose-500 uppercase flex items-center gap-1"><Plus size={12} /> {tr('Add row', 'إضافة صف')}</button>
                        </div>
                        {outputs.map((o, idx) => (
                            <div key={idx} className="grid grid-cols-12 gap-2 mb-2">
                                <select value={o.itemId || ''} onChange={(e) => updateRow(idx, { itemId: e.target.value || undefined })} disabled={o.outputType === 'WASTE'} className="col-span-4 bg-app border border-default rounded-xl px-2 py-2 text-xs text-main">
                                    <option value="">{o.outputType === 'WASTE' ? tr('Waste (no item)', 'هالك (بدون صنف)') : '—'}</option>
                                    {activeInventory.map((i: any) => <option key={i.id} value={i.id}>{isAr ? i.nameAr || i.name : i.name}</option>)}
                                </select>
                                <input value={String(o.quantity)} onChange={(e) => updateRow(idx, { quantity: Number(e.target.value) })} type="number" min="0" step="0.001" className="col-span-2 bg-app border border-default rounded-xl px-2 py-2 text-xs text-main" />
                                <input value={o.unit} onChange={(e) => updateRow(idx, { unit: e.target.value })} className="col-span-2 bg-app border border-default rounded-xl px-2 py-2 text-xs text-main" placeholder="KG" />
                                <select value={o.outputType} onChange={(e) => updateRow(idx, { outputType: e.target.value as any })} className="col-span-3 bg-app border border-default rounded-xl px-2 py-2 text-xs text-main">
                                    {OUTPUT_TYPES.map((t) => <option key={t.id} value={t.id}>{tr(t.en, t.ar)}</option>)}
                                </select>
                                <button onClick={() => removeRow(idx)} className="col-span-1 text-rose-500 flex items-center justify-center"><X size={14} /></button>
                                {o.outputType === 'WASTE' && (
                                    <select value={o.wasteReason || ''} onChange={(e) => updateRow(idx, { wasteReason: e.target.value || undefined })} className="col-span-12 bg-app border border-default rounded-xl px-2 py-2 text-xs text-main">
                                        <option value="">{tr('Waste reason…', 'سبب الهالك…')}</option>
                                        {WASTE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                )}
                            </div>
                        ))}
                        <label className="block mb-4">
                            <span className="text-[10px] font-black uppercase text-muted">{tr('Notes', 'ملاحظات')}</span>
                            <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="w-full bg-app border border-default rounded-xl px-3 py-2 text-sm text-main" />
                        </label>
                        <button onClick={() => void handleSave()} className="w-full bg-gradient-to-r from-rose-700 to-amber-600 text-white py-3 rounded-xl font-black uppercase text-xs">{editingId ? tr('Save Changes', 'حفظ التعديلات') : tr('Create Draft', 'إنشاء كمسودة')}</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ButcheryManager;
