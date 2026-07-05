import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Package, CheckCircle2, AlertTriangle, DollarSign, RefreshCw, Plus, X, Send, Hash } from 'lucide-react';
import { useInventoryStore } from '@/stores/useInventoryStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/common/ConfirmProvider';
import { purchaseOrdersApi } from '@/services/api/procurement';
import { PurchaseOrder } from '@/types';

type ProcurementSection = 'POs' | 'GRNs' | 'INVOICES';

interface ProcurementHubProps {
  lang: 'en' | 'ar';
}

export const ProcurementHub: React.FC<ProcurementHubProps> = ({ lang }) => {
    const {
        inventory,
        purchaseOrders,
        suppliers,
        warehouses,
        fetchInventory,
        fetchPurchaseOrders,
        fetchSuppliers,
        fetchWarehouses,
        createPurchaseOrderInDB,
    } = useInventoryStore();
    const currentUser = useAuthStore((state) => state.settings.currentUser);
    const activeBranchId = useAuthStore((state) => state.settings.activeBranchId);
    const branches = useAuthStore((state) => state.branches);
    const { showToast } = useToast();
    const { confirm } = useConfirm();

    const t = (en: string, ar: string) => lang === 'ar' ? ar : en;

    const [activeSection, setActiveSection] = useState<ProcurementSection>('POs');
    const [grns, setGrns] = useState<any[]>([]);
    const [invoices, setInvoices] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // Create PO form state
    const [showPOForm, setShowPOForm] = useState(false);
    const [poFormSupplierId, setPoFormSupplierId] = useState('');
    const [poFormItemId, setPoFormItemId] = useState('');
    const [poFormQty, setPoFormQty] = useState(1);
    const [poFormPrice, setPoFormPrice] = useState(0);
    const [poFormWarehouseId, setPoFormWarehouseId] = useState('');

    const refreshAll = useCallback(async () => {
        setLoading(true);
        try {
            await Promise.all([
                fetchPurchaseOrders(),
                fetchSuppliers(),
                fetchWarehouses(),
                fetchInventory(),
            ]);
            const [grnRows, invoiceRows] = await Promise.all([
                purchaseOrdersApi.getGRNs(),
                purchaseOrdersApi.getSupplierInvoices(),
            ]);
            setGrns(grnRows || []);
            setInvoices(invoiceRows || []);
        } catch (error: any) {
            showToast(error?.message || t('Failed to load procurement data', 'تعذر تحميل بيانات المشتريات'), 'error');
        } finally {
            setLoading(false);
        }
    }, [fetchPurchaseOrders, fetchSuppliers, fetchWarehouses, fetchInventory, showToast, lang]);

    useEffect(() => {
        refreshAll();
    }, [refreshAll]);

    const supplierNameById = useMemo(() => {
        return new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
    }, [suppliers]);

    const resolveWarehouseId = (branchId?: string) => {
        const branchWarehouse = warehouses.find((warehouse) => warehouse.branchId === branchId);
        return branchWarehouse?.id || warehouses[0]?.id;
    };

    const handleCreatePO = async () => {
        if (!poFormSupplierId || !poFormItemId || poFormQty <= 0 || poFormPrice <= 0) return;
        const item = inventory.find(i => i.id === poFormItemId);
        if (!item) return;
        const branchId = activeBranchId || branches[0]?.id;
        if (!branchId) {
            showToast(t('No active branch found', 'لا يوجد فرع نشط'), 'error');
            return;
        }
        setLoading(true);
        try {
            await createPurchaseOrderInDB({
                id: `po-${Date.now()}`,
                supplierId: poFormSupplierId,
                status: 'DRAFT',
                items: [{ itemId: poFormItemId, itemName: item.name, quantity: poFormQty, unitPrice: poFormPrice }],
                totalCost: poFormQty * poFormPrice,
                date: new Date(),
                targetWarehouseId: poFormWarehouseId || undefined,
                approvedById: undefined,
            }, branchId);
            showToast(t('Purchase order created', 'تم إنشاء أمر الشراء'), 'success');
            setPoFormSupplierId('');
            setPoFormItemId('');
            setPoFormQty(1);
            setPoFormPrice(0);
            setPoFormWarehouseId('');
            setShowPOForm(false);
            await fetchPurchaseOrders();
        } catch (error: any) {
            showToast(error?.message || t('Failed to create purchase order', 'تعذر إنشاء أمر الشراء'), 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleReceiveGRN = async (poId: string) => {
        setLoading(true);
        try {
            const po = await purchaseOrdersApi.getById(poId);
            const branchId = po.branchId || activeBranchId;
            const warehouseId = resolveWarehouseId(branchId);
            const items = (po.items || [])
                .map((item: any) => {
                    const orderedQty = Number(item.orderedQty || 0);
                    const receivedQty = Number(item.receivedQty || 0);
                    const remainingQty = orderedQty - receivedQty;
                    if (remainingQty <= 0) return null;
                    return {
                        itemId: item.itemId,
                        poItemId: item.id,
                        receivedQty: remainingQty,
                        unitPrice: Number(item.unitPrice || 0),
                        batchNumber: item.batchNumber || `${po.id}-${item.itemId}-${Date.now()}`,
                        expiryDate: item.expiryDate || null,
                    };
                })
                .filter(Boolean) as any[];

            if (!warehouseId) throw new Error(t('Create at least one warehouse before receiving stock', 'أنشئ مخزناً واحداً على الأقل قبل الاستلام'));
            if (!branchId) throw new Error(t('Purchase order branch is missing', 'الفرع الخاص بأمر الشراء غير موجود'));
            if (!items.length) throw new Error(t('This purchase order is already fully received', 'تم استلام هذا الأمر بالكامل'));

            await purchaseOrdersApi.createGRN({
                poId: po.id,
                supplierId: po.supplierId,
                branchId,
                warehouseId,
                referenceNumber: `GRN-${po.id}-${Date.now()}`,
                items,
                userId: currentUser?.id,
                notes: po.notes || null,
            });

            showToast(t('GRN created and stock updated', 'تم إنشاء إذن الاستلام وتحديث المخزون'), 'success');
            await refreshAll();
            setActiveSection('GRNs');
        } catch (error: any) {
            showToast(error?.message || t('Failed to receive GRN', 'تعذر استلام البضاعة'), 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateInvoice = async (grn: any) => {
        setLoading(true);
        try {
            const existingInvoice = invoices.find((invoice) => invoice.grnId === grn.id);
            if (existingInvoice) throw new Error(t('A supplier invoice already exists for this GRN', 'يوجد فاتورة مورد بالفعل لإذن الاستلام هذا'));

            const items = (grn.items || []).map((item: any) => ({
                itemId: item.itemId,
                qty: Number(item.receivedQty || 0),
                unitPrice: Number(item.unitPrice || 0),
                total: Number(item.receivedQty || 0) * Number(item.unitPrice || 0),
            }));
            const subtotal = items.reduce((sum: number, item: any) => sum + item.total, 0);
            // ponytail: invoice edit UI should own tax/discount adjustments; GRN conversion defaults clean.
            const tax = 0;
            const discount = 0;

            await purchaseOrdersApi.createSupplierInvoice({
                supplierId: grn.supplierId,
                grnId: grn.id,
                invoiceNumber: `SI-${grn.id}`,
                date: new Date().toISOString(),
                dueDate: null,
                subtotal,
                tax,
                discount,
                total: subtotal + tax - discount,
                items,
                userId: currentUser?.id,
                notes: grn.notes || null,
            });

            showToast(t('Supplier invoice saved to database', 'تم حفظ فاتورة المورد'), 'success');
            await refreshAll();
            setActiveSection('INVOICES');
        } catch (error: any) {
            showToast(error?.message || t('Failed to create supplier invoice', 'تعذر إنشاء فاتورة المورد'), 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleApproveInvoice = async (invoiceId: string) => {
        setLoading(true);
        try {
            await purchaseOrdersApi.approveSupplierInvoice(invoiceId, currentUser?.id);
            showToast(t('Invoice approved and journal posted', 'تم اعتماد الفاتورة وترحيل القيد'), 'success');
            await refreshAll();
        } catch (error: any) {
            showToast(error?.message || t('Failed to approve invoice', 'تعذر اعتماد الفاتورة'), 'error');
        } finally {
            setLoading(false);
        }
    };

    const invoiceByGrn = useMemo(() => {
        return new Map(invoices.filter((invoice) => invoice.grnId).map((invoice) => [invoice.grnId, invoice]));
    }, [invoices]);

    const renderPOForm = () => (
        <div className="bg-elevated/20 rounded-3xl border border-border/20 p-6 space-y-4 animate-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-widest text-indigo-400 flex items-center gap-2">
                    <Plus size={16} /> {t('New Purchase Order', 'أمر شراء جديد')}
                </h4>
                <button onClick={() => setShowPOForm(false)} className="p-1.5 text-muted hover:text-main rounded-lg hover:bg-elevated/60 transition-all">
                    <X size={18} />
                </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-muted uppercase ml-1">{t('Supplier', 'المورد')}</label>
                    <select value={poFormSupplierId} onChange={e => setPoFormSupplierId(e.target.value)} className="w-full px-4 py-3 bg-elevated/40 border border-border/30 rounded-2xl outline-none focus:border-indigo-500/50 transition-all font-bold text-sm appearance-none">
                        <option value="">{t('Select supplier...', 'اختر مورد...')}</option>
                        {suppliers.map(s => (
                            <option key={s.id} value={s.id}>{lang === 'ar' ? (s as any).nameAr || s.name : s.name}</option>
                        ))}
                    </select>
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-muted uppercase ml-1">{t('Item', 'الصنف')}</label>
                    <select value={poFormItemId} onChange={e => setPoFormItemId(e.target.value)} className="w-full px-4 py-3 bg-elevated/40 border border-border/30 rounded-2xl outline-none focus:border-indigo-500/50 transition-all font-bold text-sm appearance-none">
                        <option value="">{t('Select item...', 'اختر صنف...')}</option>
                        {inventory.map(i => (
                            <option key={i.id} value={i.id}>{lang === 'ar' ? i.nameAr || i.name : i.name}</option>
                        ))}
                    </select>
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-muted uppercase ml-1">{t('Warehouse (target)', 'المخزن المستهدف')}</label>
                    <select value={poFormWarehouseId} onChange={e => setPoFormWarehouseId(e.target.value)} className="w-full px-4 py-3 bg-elevated/40 border border-border/30 rounded-2xl outline-none focus:border-indigo-500/50 transition-all font-bold text-sm appearance-none">
                        <option value="">{t('Auto (branch default)', 'تلقائي')}</option>
                        {warehouses.map(w => (
                            <option key={w.id} value={w.id}>{lang === 'ar' ? w.nameAr || w.name : w.name}</option>
                        ))}
                    </select>
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-muted uppercase ml-1">{t('Quantity', 'الكمية')}</label>
                    <div className="relative">
                        <Hash size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
                        <input type="number" min="1" value={poFormQty} onChange={e => setPoFormQty(Number(e.target.value))} className="w-full pl-10 pr-4 py-3 bg-elevated/40 border border-border/30 rounded-2xl outline-none focus:border-indigo-500/50 transition-all font-bold text-sm tabular-nums" />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-muted uppercase ml-1">{t('Unit Price', 'سعر الوحدة')}</label>
                    <div className="relative">
                        <DollarSign size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
                        <input type="number" min="0" step="0.01" value={poFormPrice} onChange={e => setPoFormPrice(Number(e.target.value))} className="w-full pl-10 pr-4 py-3 bg-elevated/40 border border-border/30 rounded-2xl outline-none focus:border-indigo-500/50 transition-all font-bold text-sm tabular-nums" />
                    </div>
                </div>
                <div className="flex items-end">
                    <button onClick={handleCreatePO} disabled={loading || !poFormSupplierId || !poFormItemId || poFormQty <= 0 || poFormPrice <= 0} className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20">
                        <Send size={16} /> {loading ? t('Creating...', 'جاري الإنشاء...') : t('Create PO', 'إنشاء الأمر')}
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="p-8 animate-in fade-in slide-in-from-bottom-4 duration-150">
            <div className="flex items-center gap-3 mb-8">
                <div className="flex bg-card/60 rounded-[2rem] border border-border/30 p-2 overflow-x-auto w-fit shadow-sm">
                    {(['POs', 'GRNs', 'INVOICES'] as ProcurementSection[]).map((section) => (
                        <button
                            key={section}
                            onClick={() => setActiveSection(section)}
                            className={`px-6 py-3.5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all ${
                                activeSection === section ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-muted hover:text-main'
                            }`}
                        >
                            {section === 'POs' && <><FileText size={16} className="inline mr-2" />{t('Purchase Orders', 'أوامر الشراء')}</>}
                            {section === 'GRNs' && <><Package size={16} className="inline mr-2" />{t('Goods Receipts', 'إذن الاستلام')}</>}
                            {section === 'INVOICES' && <><DollarSign size={16} className="inline mr-2" />{t('AP Bills', 'فواتير الموردين')}</>}
                        </button>
                    ))}
                </div>
                <button
                    onClick={refreshAll}
                    disabled={loading}
                    className="px-4 py-3 rounded-xl border border-border/30 bg-card text-xs font-black uppercase tracking-wider hover:border-primary/30 disabled:opacity-60"
                >
                    <RefreshCw size={14} className={`inline mr-2 ${loading ? 'animate-spin' : ''}`} />
                    {t('Sync', 'مزامنة')}
                </button>
            </div>

            <div className="bg-app/40 rounded-[2.5rem] border border-border/30 overflow-hidden shadow-2xl p-8 min-h-[500px]">
                {activeSection === 'POs' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-main uppercase tracking-tighter">{t('Purchase Orders', 'أوامر الشراء')}</h3>
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-muted">{purchaseOrders.length} {t('records', 'سجل')}</span>
                                <button onClick={() => setShowPOForm(prev => !prev)} className="px-4 py-2.5 bg-indigo-500/10 text-indigo-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 hover:text-white transition-all border border-indigo-500/20 flex items-center gap-2 shadow-sm">
                                    <Plus size={14} /> {t('Create PO', 'أمر شراء جديد')}
                                </button>
                            </div>
                        </div>

                        {showPOForm && renderPOForm()}

                        {purchaseOrders.length === 0 ? (
                            <div className="text-center py-20 opacity-50">
                                <FileText size={48} className="mx-auto mb-4 text-muted" />
                                <p className="font-black uppercase tracking-widest text-sm">{t('No Purchase Orders', 'لا توجد أوامر شراء')}</p>
                                <p className="text-xs text-muted font-bold mt-2">{t('Click "Create PO" to start.', 'اضغط "أمر شراء جديد" للبدء.')}</p>
                            </div>
                        ) : (
                            <div className="responsive-table border border-border/10 rounded-3xl overflow-hidden shadow-sm">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-elevated/40 text-muted uppercase font-black text-[10px] tracking-widest">
                                        <tr>
                                            <th className="px-6 py-4">{t('PO Number', 'رقم الأمر')}</th>
                                            <th className="px-6 py-4">{t('Supplier', 'المورد')}</th>
                                            <th className="px-6 py-4">{t('Status', 'الحالة')}</th>
                                            <th className="px-6 py-4">{t('Items', 'البنود')}</th>
                                            <th className="px-6 py-4 text-right">{t('Actions', 'الإجراءات')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {purchaseOrders.map((po: any) => (
                                            <tr key={po.id} className="hover:bg-indigo-500/5 transition-colors group">
                                                <td className="px-6 py-4 font-mono font-black text-main">{po.id}</td>
                                                <td className="px-6 py-4 text-xs font-bold text-muted">{supplierNameById.get(po.supplierId) || po.supplierId}</td>
                                                <td className="px-6 py-4">
                                                    <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border text-indigo-500 border-indigo-500/20 bg-indigo-500/10">
                                                        {po.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-xs font-bold text-muted">{(po.items || []).length}</td>
                                                <td className="px-6 py-4 text-right">
                                                    <button
                                                        onClick={() => handleReceiveGRN(po.id)}
                                                        disabled={loading}
                                                        className="px-4 py-2 bg-emerald-500/10 text-emerald-500 rounded-lg text-[10px] font-black uppercase hover:bg-emerald-500 hover:text-white transition-all shadow-sm disabled:opacity-60"
                                                    >
                                                        {t('Receive GRN', 'استلام')}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {activeSection === 'GRNs' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-main uppercase tracking-tighter">{t('Goods Receipt Notes', 'إذن استلام')}</h3>
                            <span className="text-xs font-bold text-muted">{grns.length} {t('records', 'سجل')}</span>
                        </div>
                        {grns.length === 0 ? (
                            <div className="text-center py-20 bg-card/20 rounded-3xl border border-dashed border-border/30">
                                <Package size={48} className="mx-auto mb-4 text-emerald-500/50" />
                                <p className="font-black uppercase tracking-widest text-sm text-emerald-500">{t('No GRNs', 'لا توجد إذن استلام')}</p>
                                <p className="text-xs text-muted font-bold mt-2">{t('Receive a purchase order to generate a GRN.', 'استلم أمر شراء لإنشاء إذن استلام.')}</p>
                            </div>
                        ) : (
                            <div className="responsive-table border border-border/10 rounded-3xl overflow-hidden shadow-sm">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-elevated/40 text-muted uppercase font-black text-[10px] tracking-widest">
                                        <tr>
                                            <th className="px-6 py-4">{t('GRN', 'إذن الاستلام')}</th>
                                            <th className="px-6 py-4">{t('Supplier', 'المورد')}</th>
                                            <th className="px-6 py-4">{t('Items', 'البنود')}</th>
                                            <th className="px-6 py-4">{t('Status', 'الحالة')}</th>
                                            <th className="px-6 py-4 text-right">{t('Actions', 'الإجراءات')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {grns.map((grn) => {
                                            const linkedInvoice = invoiceByGrn.get(grn.id);
                                            return (
                                                <tr key={grn.id} className="hover:bg-emerald-500/5 transition-colors group">
                                                    <td className="px-6 py-4 font-mono font-black text-main">{grn.id}</td>
                                                    <td className="px-6 py-4 text-xs font-bold text-muted">{supplierNameById.get(grn.supplierId) || grn.supplierId}</td>
                                                    <td className="px-6 py-4 text-xs font-bold text-muted">{(grn.items || []).length}</td>
                                                    <td className="px-6 py-4">
                                                        <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border text-emerald-500 border-emerald-500/20 bg-emerald-500/10">
                                                            {grn.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        {linkedInvoice ? (
                                                            <span className="text-xs font-bold text-muted">{t('Invoice:', 'الفاتورة:')} {linkedInvoice.invoiceNumber || linkedInvoice.id}</span>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleCreateInvoice(grn)}
                                                                disabled={loading}
                                                                className="px-4 py-2 bg-rose-500/10 text-rose-500 rounded-lg text-[10px] font-black uppercase hover:bg-rose-500 hover:text-white transition-all shadow-sm disabled:opacity-60"
                                                            >
                                                                {t('Create AP Bill', 'إنشاء فاتورة')}
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {activeSection === 'INVOICES' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-main uppercase tracking-tighter">{t('AP Supplier Bills', 'فواتير الموردين')}</h3>
                            <span className="text-xs font-bold text-muted">{invoices.length} {t('records', 'سجل')}</span>
                        </div>
                        {invoices.length === 0 ? (
                            <div className="text-center py-20 bg-card/20 rounded-3xl border border-dashed border-border/30">
                                <AlertTriangle size={48} className="mx-auto mb-4 text-rose-500/50" />
                                <p className="font-black uppercase tracking-widest text-sm text-rose-500">{t('No AP Bills', 'لا توجد فواتير')}</p>
                                <p className="text-xs text-muted font-bold mt-2">{t('Create an invoice from a GRN to continue.', 'أنشئ فاتورة من إذن استلام للمتابعة')}</p>
                            </div>
                        ) : (
                            <div className="responsive-table border border-border/10 rounded-3xl overflow-hidden shadow-sm">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-elevated/40 text-muted uppercase font-black text-[10px] tracking-widest">
                                        <tr>
                                            <th className="px-6 py-4">{t('Bill ID', 'رقم الفاتورة')}</th>
                                            <th className="px-6 py-4">{t('Invoice Number', 'رقم الفاتورة')}</th>
                                            <th className="px-6 py-4">{t('Date', 'التاريخ')}</th>
                                            <th className="px-6 py-4">{t('Total', 'الإجمالي')}</th>
                                            <th className="px-6 py-4">{t('Status', 'الحالة')}</th>
                                            <th className="px-6 py-4 text-right">{t('Actions', 'الإجراءات')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {invoices.map((invoice) => (
                                            <tr key={invoice.id} className="hover:bg-rose-500/5 transition-colors group">
                                                <td className="px-6 py-4 font-mono font-black text-main">{invoice.id}</td>
                                                <td className="px-6 py-4 font-black uppercase text-xs">{invoice.invoiceNumber}</td>
                                                <td className="px-6 py-4 text-xs font-bold text-muted">{new Date(invoice.date).toLocaleDateString()}</td>
                                                <td className="px-6 py-4 font-black tabular-nums text-rose-500">{Number(invoice.total || 0).toLocaleString()}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                                                        invoice.status === 'APPROVED'
                                                            ? 'text-emerald-500 border-emerald-500/20 bg-emerald-500/10'
                                                            : 'text-rose-500 border-rose-500/20 bg-rose-500/10'
                                                    }`}>
                                                        {invoice.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    {invoice.status !== 'APPROVED' && invoice.status !== 'PAID' ? (
                                                        <button
                                                            onClick={async () => {
                                                                const ok = await confirm({
                                                                    title: t('Approve invoice', 'اعتماد الفاتورة'),
                                                                    message: t('Approve this invoice? This will post a journal entry.', 'اعتماد هذه الفاتورة؟ سيتم ترحيل قيد محاسبي.'),
                                                                    confirmText: t('Approve', 'اعتماد'),
                                                                    cancelText: t('Cancel', 'إلغاء'),
                                                                    variant: 'warning',
                                                                });
                                                                if (ok) handleApproveInvoice(invoice.id);
                                                            }}
                                                            disabled={loading}
                                                            className="px-4 py-2 bg-emerald-500 border border-emerald-600 text-white rounded-lg text-[10px] font-black uppercase hover:bg-emerald-600 transition-all shadow-lg active:scale-95 disabled:opacity-60"
                                                        >
                                                            {t('Override & Approve', 'اعتماد الفاتورة')}
                                                        </button>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-2 text-emerald-500 text-xs font-bold">
                                                            <CheckCircle2 size={14} />
                                                            {t('Posted', 'مرحلة')}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
