import React, { useState } from 'react';
import { X, Save, Undo2, Plus, Trash2 } from 'lucide-react';
import { InventoryItem, Warehouse, Supplier } from '@/types';

interface SupplierReturnModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: {
        warehouseId: string;
        supplierId?: string;
        reason: string;
        creditNoteRef?: string;
        items: { itemId: string; quantity: number; unitPrice?: number }[];
    }) => void | Promise<void>;
    lang: 'en' | 'ar';
    inventory: InventoryItem[];
    warehouses: Warehouse[];
    suppliers: Supplier[];
}

const SupplierReturnModal: React.FC<SupplierReturnModalProps> = ({ isOpen, onClose, onSave, lang, inventory, warehouses, suppliers }) => {
    const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
    const [selectedSupplierId, setSelectedSupplierId] = useState('');
    const [reason, setReason] = useState('');
    const [creditNoteRef, setCreditNoteRef] = useState('');
    const [returnItems, setReturnItems] = useState<{ itemId: string; quantity: number; unitPrice: number }[]>([]);
    const [saving, setSaving] = useState(false);
    const hasValidItems = returnItems.length > 0 && returnItems.every(item => (
        item.itemId && Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0
    ));
    const canSave = Boolean(selectedWarehouseId) && reason.trim().length >= 3 && hasValidItems && !saving;

    if (!isOpen) return null;

    const handleAddItem = () => {
        setReturnItems([...returnItems, { itemId: '', quantity: 1, unitPrice: 0 }]);
    };

    const handleRemoveItem = (index: number) => {
        const next = [...returnItems];
        next.splice(index, 1);
        setReturnItems(next);
    };

    const handleUpdateItem = (index: number, field: string, value: any) => {
        const next = [...returnItems];
        const item = { ...next[index], [field]: value };
        if (field === 'itemId') {
            const masterItem = inventory.find(i => i.id === value);
            if (masterItem) {
                item.unitPrice = masterItem.purchasePrice || masterItem.costPrice || 0;
            }
        }
        next[index] = item;
        setReturnItems(next);
    };

    const saveReturn = async () => {
        if (!canSave) return;
        setSaving(true);
        try {
            await onSave({
                warehouseId: selectedWarehouseId,
                supplierId: selectedSupplierId || undefined,
                reason: reason.trim(),
                creditNoteRef: creditNoteRef.trim() || undefined,
                items: returnItems,
            });
            setReturnItems([]);
            setSelectedSupplierId('');
            setReason('');
            setCreditNoteRef('');
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[110] p-4">
            <div className="card-primary w-full max-w-3xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-amber-50 dark:bg-amber-950/20">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-amber-600 text-white flex items-center justify-center">
                            <Undo2 size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">
                                {lang === 'ar' ? 'مرتجع مورد' : 'Supplier Return'}
                            </h3>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                {lang === 'ar' ? 'خصم من المخزن + إشعار دائن للمورد' : 'Deduct stock + supplier credit note'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-6 no-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'المخزن *' : 'Warehouse *'}</label>
                            <select
                                required
                                value={selectedWarehouseId}
                                onChange={e => setSelectedWarehouseId(e.target.value)}
                                className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none transition-all font-bold appearance-none"
                            >
                                <option value="">{lang === 'ar' ? 'اختر مخزن...' : 'Select warehouse...'}</option>
                                {warehouses.map(w => (
                                    <option key={w.id} value={w.id}>{lang === 'ar' ? w.nameAr || w.name : w.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'المورد' : 'Supplier'}</label>
                            <select
                                value={selectedSupplierId}
                                onChange={e => setSelectedSupplierId(e.target.value)}
                                className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none transition-all font-bold appearance-none"
                            >
                                <option value="">{lang === 'ar' ? 'اختر مورد...' : 'Select supplier...'}</option>
                                {suppliers.map(s => (
                                    <option key={s.id} value={s.id}>{lang === 'ar' ? (s as any).nameAr || s.name : s.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'سبب المرتجع *' : 'Return reason *'}</label>
                            <input
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                                placeholder={lang === 'ar' ? 'تالف / ناقص / خطأ توريد…' : 'Spoiled / short / wrong delivery…'}
                                className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none transition-all font-bold"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'مرجع إشعار دائن' : 'Credit note ref'}</label>
                            <input
                                value={creditNoteRef}
                                onChange={e => setCreditNoteRef(e.target.value)}
                                placeholder={lang === 'ar' ? 'اختياري' : 'Optional'}
                                className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none transition-all font-bold"
                            />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">{lang === 'ar' ? 'الأصناف المرتجعة' : 'Returned items'}</h4>
                            <button
                                type="button"
                                onClick={handleAddItem}
                                className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-amber-100 transition-all border border-amber-100 dark:border-amber-900"
                            >
                                <Plus size={16} /> {lang === 'ar' ? 'إضافة صنف' : 'Add Item'}
                            </button>
                        </div>

                        <div className="space-y-3">
                            {returnItems.map((item, idx) => (
                                <div key={idx} className="grid grid-cols-1 md:grid-cols-[1fr,120px,120px,40px] gap-3 items-end p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase">{lang === 'ar' ? 'الصنف' : 'Item'}</label>
                                        <select
                                            value={item.itemId}
                                            onChange={e => handleUpdateItem(idx, 'itemId', e.target.value)}
                                            className="w-full px-4 py-2 card-primary rounded-xl outline-none text-sm font-bold appearance-none"
                                        >
                                            <option value="">{lang === 'ar' ? 'اختر...' : 'Select...'}</option>
                                            {inventory.map(i => (
                                                <option key={i.id} value={i.id}>{lang === 'ar' ? i.nameAr || i.name : i.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase">{lang === 'ar' ? 'الكمية' : 'Qty'}</label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={item.quantity}
                                            onChange={e => handleUpdateItem(idx, 'quantity', Number(e.target.value))}
                                            className="w-full px-4 py-2 card-primary rounded-xl outline-none text-sm font-bold"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase">{lang === 'ar' ? 'السعر' : 'Price'}</label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={item.unitPrice}
                                            onChange={e => handleUpdateItem(idx, 'unitPrice', Number(e.target.value))}
                                            className="w-full px-4 py-2 card-primary rounded-xl outline-none text-sm font-bold"
                                        />
                                    </div>
                                    <button type="button" onClick={() => handleRemoveItem(idx)} className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-colors">
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
                    <button onClick={onClose} className="px-6 py-3 rounded-2xl border border-border/50 bg-elevated text-muted text-xs font-black uppercase tracking-widest">
                        {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                        onClick={saveReturn}
                        disabled={!canSave}
                        className="px-8 py-3 rounded-2xl bg-amber-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50 hover:opacity-90 flex items-center gap-2"
                    >
                        <Save size={16} /> {saving ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ المرتجع' : 'Save return')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SupplierReturnModal;
