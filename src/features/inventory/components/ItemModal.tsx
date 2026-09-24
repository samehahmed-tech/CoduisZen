import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Save, Package, Tag, Hash, DollarSign, Settings, Layers, Trash2, Plus, RefreshCw, Camera } from 'lucide-react';
import { InventoryItem, InventoryUnit, RecipeIngredient, Warehouse } from '@/types';
import BarcodeScanner from '@/components/common/BarcodeScanner';
import { useToast } from '@/components/common/ToastProvider';
import { barcodeApi } from '@/services/api';
import { generateInternalId } from '@/src/utils/idGenerator';

interface ItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (item: InventoryItem) => void;
    lang: 'en' | 'ar';
    warehouses: Warehouse[];
    existingItems: InventoryItem[]; // For BOM selection
    initialItem?: InventoryItem | null;
}

const ItemModal: React.FC<ItemModalProps> = ({ isOpen, onClose, onSave, lang, warehouses, existingItems, initialItem }) => {
    const { error: showError } = useToast();
    const [formData, setFormData] = useState<Partial<InventoryItem>>({
        name: '',
        nameAr: '',
        sku: '',
        barcode: '',
        unit: InventoryUnit.COUNT,
        purchaseUnit: InventoryUnit.COUNT,
        purchaseUnitFactor: 1,
        category: '',
        costPrice: 0,
        purchasePrice: 0,
        threshold: 0,
        isAudited: true,
        auditFrequency: 'DAILY',
        isComposite: false,
        bom: [],
        warehouseQuantities: []
    });

    const safeWarehouses = useMemo(
        () => (Array.isArray(warehouses) ? warehouses : []).filter((warehouse): warehouse is Warehouse => Boolean(warehouse?.id)),
        [warehouses],
    );
    const safeExistingItems = useMemo(
        () => (Array.isArray(existingItems) ? existingItems : []).filter((item): item is InventoryItem => Boolean(item?.id)),
        [existingItems],
    );

    const parseArray = (value: unknown): unknown[] => {
        if (Array.isArray(value)) return value;
        if (typeof value !== 'string') return [];
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    };

    const normalizeItem = (item: InventoryItem): InventoryItem => ({
        ...item,
        name: typeof item.name === 'string' ? item.name : '',
        nameAr: typeof item.nameAr === 'string' ? item.nameAr : '',
        unit: item.unit || InventoryUnit.COUNT,
        category: typeof item.category === 'string' ? item.category : '',
        threshold: Number.isFinite(Number(item.threshold)) ? Number(item.threshold) : 0,
        costPrice: Number.isFinite(Number(item.costPrice)) ? Number(item.costPrice) : 0,
        purchasePrice: Number.isFinite(Number(item.purchasePrice)) ? Number(item.purchasePrice) : 0,
        purchaseUnit: item.purchaseUnit || item.unit,
        purchaseUnitFactor: Number(item.purchaseUnitFactor || 1) > 0 ? Number(item.purchaseUnitFactor || 1) : 1,
        bom: parseArray(item.bom).filter((ingredient): ingredient is RecipeIngredient => Boolean(
            ingredient && typeof ingredient === 'object' && ('itemId' in ingredient || 'inventoryItemId' in ingredient)
        )).map((ingredient) => ({
            itemId: typeof ingredient.itemId === 'string' && ingredient.itemId
                ? ingredient.itemId
                : (typeof (ingredient as any).inventoryItemId === 'string' ? (ingredient as any).inventoryItemId : ''),
            quantity: Number.isFinite(Number(ingredient.quantity)) ? Number(ingredient.quantity) : 0,
            unit: typeof ingredient.unit === 'string' ? ingredient.unit : '',
        })),
        warehouseQuantities: parseArray(item.warehouseQuantities).filter((row: any): row is { warehouseId: string; quantity: number } => Boolean(
            row && typeof row === 'object' && typeof row.warehouseId === 'string' && row.warehouseId
        )).map((row) => ({
            warehouseId: row.warehouseId,
            quantity: Number.isFinite(Number(row.quantity)) ? Math.max(0, Number(row.quantity)) : 0,
        })),
    });

    useEffect(() => {
        if (initialItem) {
            setFormData(normalizeItem(initialItem));
        } else {
            setFormData({
                id: generateInternalId(),
                name: '',
                nameAr: '',
                sku: '',
                barcode: '',
                unit: InventoryUnit.COUNT,
                purchaseUnit: InventoryUnit.COUNT,
                purchaseUnitFactor: 1,
                category: '',
                costPrice: 0,
                purchasePrice: 0,
                threshold: 0,
                isAudited: true,
                auditFrequency: 'DAILY',
                isComposite: false,
                bom: [],
                warehouseQuantities: safeWarehouses.length === 1 ? [{ warehouseId: safeWarehouses[0].id, quantity: 0 }] : []
            });
        }
    }, [initialItem, safeWarehouses, isOpen]);

    const [scannerOpen, setScannerOpen] = useState(false);
    const [generatingBarcode, setGeneratingBarcode] = useState(false);

    const handleGenerateBarcode = useCallback(async () => {
        setGeneratingBarcode(true);
        try {
            const result = await barcodeApi.generate();
            setFormData(prev => ({ ...prev, barcode: result.barcode }));
        } catch {
            showError(lang === 'ar' ? 'تعذر إنشاء الباركود' : 'Failed to generate barcode');
        } finally {
            setGeneratingBarcode(false);
        }
    }, [lang, showError]);

    const handleBarcodeScan = useCallback((code: string) => {
        setFormData(prev => ({ ...prev, barcode: code }));
        setScannerOpen(false);
    }, []);

    const [saving, setSaving] = useState(false);

    if (!isOpen) return null;

    const handleAddIngredient = () => {
        setFormData({
            ...formData,
            bom: [...(formData.bom || []), { itemId: '', quantity: 0, unit: '' }]
        });
    };

    const handleRemoveIngredient = (index: number) => {
        const newBom = [...(formData.bom || [])];
        newBom.splice(index, 1);
        setFormData({ ...formData, bom: newBom });
    };

    const handleUpdateIngredient = (index: number, field: keyof RecipeIngredient, value: any) => {
        setFormData((prev) => {
            const newBom = [...(prev.bom || [])];
            newBom[index] = { ...newBom[index], [field]: value };
            return { ...prev, bom: newBom };
        });
    };

    const handleSelectIngredientItem = (index: number, itemId: string) => {
        const ref = safeExistingItems.find((i) => i.id === itemId);
        setFormData((prev) => {
            const newBom = [...(prev.bom || [])];
            newBom[index] = { ...newBom[index], itemId, unit: ref?.unit || newBom[index]?.unit || '' };
            return { ...prev, bom: newBom };
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (safeWarehouses.length > 0 && !formData.warehouseQuantities?.length) {
            showError(lang === 'ar' ? 'اختر مخزنًا واحدًا على الأقل للصنف' : 'Select at least one warehouse for the item');
            return;
        }
        setSaving(true);
        try {
            await onSave(formData as InventoryItem);
        } catch (error: any) {
            const errorCode = error?.code || error?.message;
            if (errorCode === 'INACTIVE_WAREHOUSE_ASSIGNMENT') {
                showError(lang === 'ar'
                    ? 'لا يمكن ربط الصنف بمخزن غير نشط. أزل الربط أو فعّل المخزن أولاً.'
                    : 'An item cannot be assigned to an inactive warehouse. Remove the link or reactivate the warehouse first.');
                return;
            }
            showError(error?.code === 'WAREHOUSE_STOCK_NOT_EMPTY' || error?.message === 'WAREHOUSE_STOCK_NOT_EMPTY'
                ? (lang === 'ar' ? 'انقل أو صفّر رصيد المخزن قبل إلغاء ربط الصنف به' : 'Transfer or zero this warehouse stock before removing the assignment')
                : (error?.message || (lang === 'ar' ? 'تعذر حفظ الصنف' : 'Failed to save item')));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[110] p-1.5 sm:p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-xl sm:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[98dvh] sm:max-h-[90vh] border border-slate-200 dark:border-slate-800">
                <div className="p-3 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                            <Package size={24} />
                        </div>
                        <div>
                            <h3 className="text-base sm:text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">
                                {lang === 'ar' ? (initialItem ? 'تعديل صنف' : 'إضافة صنف جديد') : (initialItem ? 'Edit Item' : 'Add New Item')}
                            </h3>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                {lang === 'ar' ? 'تعريف بيانات المخزون والشراء' : 'Define inventory and purchase data'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-8 space-y-5 sm:space-y-8 no-scrollbar">
                    {/* Basic Info */}
                    <section className="space-y-4">
                        <h4 className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-[0.2em] mb-4">
                            <Tag size={14} /> {lang === 'ar' ? 'المعلومات الأساسية' : 'Basic Information'}
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'اسم الصنف (EN)' : 'Item Name (EN)'}</label>
                                <input
                                    required
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold"
                                />
                            </div>
                            <div className="space-y-1.5" dir="rtl">
                                <label className="text-[10px] font-black text-slate-400 uppercase mr-1">{lang === 'ar' ? 'اسم الصنف (AR)' : 'Item Name (AR)'}</label>
                                <input
                                    required
                                    type="text"
                                    value={formData.nameAr}
                                    onChange={e => setFormData({ ...formData, nameAr: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold"
                                />
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">SKU / Code</label>
                                <input
                                    type="text"
                                    value={formData.sku}
                                    onChange={e => setFormData({ ...formData, sku: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'الباركود' : 'Barcode'}</label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <input
                                            type="text"
                                            value={formData.barcode}
                                            onChange={e => setFormData({ ...formData, barcode: e.target.value })}
                                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono pl-10"
                                            placeholder="Scan or enter barcode..."
                                        />
                                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setScannerOpen(true)}
                                        className="p-3 bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 rounded-xl hover:bg-indigo-100 transition-colors"
                                        title="Scan Barcode"
                                    >
                                        <Camera size={20} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleGenerateBarcode}
                                        disabled={generatingBarcode}
                                        className="p-3 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 rounded-xl hover:bg-slate-200 transition-colors"
                                        title="Generate Barcode"
                                    >
                                        <RefreshCw size={20} className={generatingBarcode ? 'animate-spin' : ''} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'الوحدة' : 'Unit'}</label>
                                <select
                                    value={formData.unit}
                                    onChange={e => setFormData({ ...formData, unit: e.target.value as InventoryUnit, purchaseUnit: formData.purchaseUnit || e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold appearance-none"
                                >
                                    {Object.values(InventoryUnit).map(u => (
                                        <option key={u} value={u}>{u}</option>
                                    ))}
                                    <option value="CUSTOM">{lang === 'ar' ? 'وحدة مخصصة' : 'Custom Unit'}</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'التصنيف' : 'Category'}</label>
                                <input
                                    type="text"
                                    value={formData.category}
                                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold"
                                    placeholder="e.g. Vegetables, Meat..."
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/10">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'وحدة الشراء' : 'Purchase Unit'}</label>
                                <select
                                    value={formData.purchaseUnit || formData.unit}
                                    onChange={e => setFormData({ ...formData, purchaseUnit: e.target.value })}
                                    className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold appearance-none"
                                >
                                    {Object.values(InventoryUnit).map(u => (
                                        <option key={u} value={u}>{u}</option>
                                    ))}
                                    <option value="CUSTOM">{lang === 'ar' ? 'وحدة مخصصة' : 'Custom Unit'}</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'معامل التحويل' : 'Conversion Factor'}</label>
                                <input
                                    type="number"
                                    min="0.001"
                                    step="0.001"
                                    value={formData.purchaseUnitFactor || 1}
                                    onChange={e => setFormData({ ...formData, purchaseUnitFactor: Math.max(0.001, Number(e.target.value || 1)) })}
                                    className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold"
                                />
                            </div>
                            <div className="flex items-end">
                                <p className="w-full px-4 py-3 rounded-xl bg-white/80 dark:bg-slate-800 text-xs font-black text-emerald-700 dark:text-emerald-300">
                                    1 {formData.purchaseUnit || formData.unit} = {Number(formData.purchaseUnitFactor || 1)} {formData.unit}
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Pricing & Threshold */}
                    <section className="space-y-4">
                        <h4 className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-[0.2em] mb-4">
                            <DollarSign size={14} /> {lang === 'ar' ? 'التسعير والمخزون' : 'Pricing & Inventory'}
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'سعر الشراء' : 'Purchase Price'}</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.purchasePrice}
                                    onChange={e => setFormData({ ...formData, purchasePrice: Number(e.target.value) })}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'تكلفة الوحدة' : 'Cost Price'}</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.costPrice}
                                    onChange={e => setFormData({ ...formData, costPrice: Number(e.target.value) })}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'حد التنبيه' : 'Alert Threshold'}</label>
                                <input
                                    type="number"
                                    value={formData.threshold}
                                    onChange={e => setFormData({ ...formData, threshold: Number(e.target.value) })}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-emerald-200 dark:border-emerald-900 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold"
                                />
                            </div>
                        </div>
                    </section>

                    {warehouses.length > 0 && (
                        <section className="space-y-4">
                            <h4 className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-[0.2em]">
                                <Package size={14} /> {lang === 'ar' ? 'توزيع الصنف على المخازن' : 'Warehouse assignment'}
                            </h4>
                            <p className="text-xs font-bold text-slate-500">
                                {lang === 'ar' ? 'حدد المخازن التي يتوفر بها الصنف، ثم أدخل رصيده في كل مخزن.' : 'Choose where this item is available, then enter its quantity in each warehouse.'}
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {safeWarehouses.map((warehouse) => {
                    const assignedRow = formData.warehouseQuantities?.find(row => row.warehouseId === warehouse.id);
                    const assigned = Boolean(assignedRow);
                    const inactive = warehouse.isActive === false;
                    return <div key={warehouse.id} className={`rounded-2xl border p-4 transition ${inactive ? 'border-amber-400/60 bg-amber-50/60 dark:bg-amber-950/20' : assigned ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/20' : 'border-slate-200 dark:border-slate-700'}`}>
                                        <label className="flex cursor-pointer items-center gap-3">
                                            <input
                                                type="checkbox"
                                                checked={assigned}
                                                onChange={(event) => setFormData(current => ({
                                                    ...current,
                                                    warehouseQuantities: event.target.checked
                                                        ? [...(current.warehouseQuantities || []), { warehouseId: warehouse.id, quantity: 0 }]
                                                        : (current.warehouseQuantities || []).filter(row => row.warehouseId !== warehouse.id),
                                                }))}
                                                className="h-5 w-5 accent-indigo-600"
                                            />
                                            <span className="text-sm font-black text-slate-700 dark:text-slate-200">{lang === 'ar' ? warehouse.nameAr || warehouse.name : warehouse.name}{inactive && <span className="ml-2 text-[10px] text-amber-600">({lang === 'ar' ? 'غير نشط' : 'Inactive'})</span>}</span>
                                        </label>
                                        {assigned && <label className="mt-3 block space-y-1.5">
                                            <span className="text-[10px] font-black text-slate-400 uppercase">
                                                {initialItem ? (lang === 'ar' ? 'الكمية الحالية' : 'Current quantity') : (lang === 'ar' ? 'الرصيد الافتتاحي' : 'Opening quantity')}
                                            </span>
                                            <input type="number" min="0" step="0.001" value={assignedRow?.quantity || 0} onChange={(event) => setFormData(current => ({
                                                ...current,
                                                warehouseQuantities: (current.warehouseQuantities || []).map(row => row.warehouseId === warehouse.id
                                                    ? { ...row, quantity: Math.max(0, Number(event.target.value || 0)) }
                                                    : row),
                                            }))} className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold" />
                                        </label>}
                                    </div>;
                                })}
                            </div>
                        </section>
                    )}

                    {/* Audit Settings */}
                    <section className="space-y-4">
                        <h4 className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-[0.2em] mb-4">
                            <Settings size={14} /> {lang === 'ar' ? 'إعدادات الجرد' : 'Audit Settings'}
                        </h4>
                        <div className="flex flex-wrap items-center gap-8 p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={formData.isAudited}
                                    onChange={e => setFormData({ ...formData, isAudited: e.target.checked })}
                                    className="hidden"
                                />
                                <div className={`w-12 h-6 rounded-full relative transition-colors ${formData.isAudited ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${formData.isAudited ? 'left-7' : 'left-1'}`} />
                                </div>
                                <span className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase">{lang === 'ar' ? 'خاضع للجرد' : 'Is Audited'}</span>
                            </label>

                            {formData.isAudited && (
                                <div className="flex items-center gap-4 flex-1">
                                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{lang === 'ar' ? 'تكرار الجرد:' : 'Cycle:'}</span>
                                    <div className="flex gap-2">
                                        {['DAILY', 'WEEKLY', 'MONTHLY'].map(freq => (
                                            <button
                                                key={freq}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, auditFrequency: freq as any })}
                                                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${formData.auditFrequency === freq
                                                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                                                    : 'bg-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                                    }`}
                                            >
                                                {freq}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Composite / BOM */}
                    <section className="space-y-4">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-[0.2em]">
                                <Layers size={14} /> {lang === 'ar' ? 'صنف مجمع (Recipe / BOM)' : 'Composite / BOM'}
                            </h4>
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.isComposite}
                                    onChange={e => setFormData({ ...formData, isComposite: e.target.checked })}
                                    className="hidden"
                                />
                                <div className={`w-10 h-5 rounded-full relative transition-colors ${formData.isComposite ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
                                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${formData.isComposite ? 'left-5.5' : 'left-0.5'}`} />
                                </div>
                                <span className="text-[10px] font-black text-slate-500 uppercase">{lang === 'ar' ? 'تفعيل' : 'Enable BOM'}</span>
                            </label>
                        </div>

                        {formData.isComposite && (
                            <div className="p-6 bg-violet-50 dark:bg-violet-950/20 rounded-2xl border border-violet-100 dark:border-violet-900/50 space-y-4">
                                <div className="space-y-3">
                                    {formData.bom?.map((ing, idx) => (
                                <div key={idx} className="grid grid-cols-[minmax(0,1fr)_5rem_auto] sm:flex gap-2 sm:gap-3 items-center">
                                            <select
                                                value={ing.itemId}
                                                onChange={e => handleSelectIngredientItem(idx, e.target.value)}
                                                className="flex-1 px-4 py-2.5 card-primary rounded-xl outline-none text-sm font-bold"
                                            >
                                                <option value="">{lang === 'ar' ? 'اختر صنف...' : 'Select item...'}</option>
                                                {safeExistingItems.filter(i => i.id !== formData.id && i.isActive !== false).map(item => (
                                                    <option key={item.id} value={item.id}>{lang === 'ar' ? item.nameAr || item.name : item.name}</option>
                                                ))}
                                            </select>
                                            <select
                                                value={ing.unit || safeExistingItems.find(i => i.id === ing.itemId)?.unit || ''}
                                                onChange={e => handleUpdateIngredient(idx, 'unit', e.target.value)}
                                                className="w-24 px-2 py-2.5 card-primary rounded-xl outline-none text-sm font-bold"
                                                title={lang === 'ar' ? 'وحدة المكون' : 'Ingredient unit'}
                                            >
                                                <option value="">{lang === 'ar' ? 'الوحدة' : 'Unit'}</option>
                                                {Object.values(InventoryUnit).map(u => (
                                                    <option key={u} value={u}>{u}</option>
                                                ))}
                                            </select>
                                            <input
                                                type="number"
                                                min="0.001"
                                                step="0.001"
                                                placeholder="0.000"
                                                defaultValue={ing.quantity}
                                                onBlur={e => {
                                                    const quantity = e.currentTarget.valueAsNumber;
                                                    handleUpdateIngredient(idx, 'quantity', Number.isFinite(quantity) && quantity >= 0.001 ? quantity : 0);
                                                }}
                                                className="w-24 px-4 py-2.5 card-primary rounded-xl outline-none text-sm font-bold"
                                            />
                                            <span className="hidden sm:block text-xs font-black text-slate-400 w-12">{safeExistingItems.find(i => i.id === ing.itemId)?.unit || '-'}</span>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveIngredient(idx)}
                                                className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    onClick={handleAddIngredient}
                                    className="w-full py-3 border-2 border-dashed border-violet-200 dark:border-violet-900 rounded-xl text-violet-600 font-black text-[10px] uppercase tracking-widest hover:bg-violet-50 dark:hover:bg-violet-900/10 flex items-center justify-center gap-2"
                                >
                                    <Plus size={16} /> {lang === 'ar' ? 'إضافة مكون' : 'Add Ingredient'}
                                </button>
                            </div>
                        )}
                    </section>
                </form>

                <div className="p-3 sm:p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex gap-2 sm:gap-4 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 py-4 card-primary text-slate-600 dark:text-slate-400 font-black text-xs uppercase tracking-widest rounded-2xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 transition-all"
                    >
                        {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                        disabled={saving}
                        onClick={handleSubmit}
                        className="flex-1 py-4 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-indigo-700 shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale transition-all"
                    >
                        <Save size={18} /> {saving ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ الصنف' : 'Save Item')}
                    </button>
                </div>
            </div>

            {/* Barcode Scanner Modal overlay */}
            {scannerOpen && (
                <BarcodeScanner
                    isOpen={scannerOpen}
                    onClose={() => setScannerOpen(false)}
                    onScan={handleBarcodeScan}
                />
            )}
        </div>
    );
};

export default ItemModal;
