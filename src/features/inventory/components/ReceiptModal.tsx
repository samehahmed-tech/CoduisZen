import React, { useState } from 'react';
import { X, Save, Truck, Plus, Trash2, Package } from 'lucide-react';
import { InventoryItem, Warehouse, Supplier } from '@/types';

interface ReceiptModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: {
        warehouseId: string;
        supplierId?: string;
        items: { itemId: string; quantity: number; costPrice?: number; purchaseUnit?: string }[];
    }) => void | Promise<void>;
    lang: 'en' | 'ar';
    inventory: InventoryItem[];
    warehouses: Warehouse[];
    suppliers: Supplier[];
}

const ReceiptModal: React.FC<ReceiptModalProps> = ({ isOpen, onClose, onSave, lang, inventory, warehouses, suppliers }) => {
    const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
    const [selectedSupplierId, setSelectedSupplierId] = useState('');
    const [receivedItems, setReceivedItems] = useState<{ itemId: string; quantity: number; costPrice: number; purchaseUnit: string }[]>([]);
    const [saving, setSaving] = useState(false);
    const hasValidItems = receivedItems.length > 0 && receivedItems.every(item => (
        item.itemId
        && Number.isFinite(Number(item.quantity))
        && Number(item.quantity) > 0
        && Number.isFinite(Number(item.costPrice))
        && Number(item.costPrice) > 0
    ));
    const canSave = Boolean(selectedWarehouseId) && hasValidItems && !saving;

    if (!isOpen) return null;

    const handleAddItem = () => {
        setReceivedItems([...receivedItems, { itemId: '', quantity: 1, costPrice: 0, purchaseUnit: '' }]);
    };

    const handleRemoveItem = (index: number) => {
        const newItems = [...receivedItems];
        newItems.splice(index, 1);
        setReceivedItems(newItems);
    };

    const handleUpdateItem = (index: number, field: string, value: any) => {
        const newItems = [...receivedItems];
        const item = { ...newItems[index], [field]: value };

        if (field === 'itemId') {
            const masterItem = inventory.find(i => i.id === value);
            if (masterItem) {
                item.costPrice = masterItem.purchasePrice || masterItem.costPrice || 0;
                item.purchaseUnit = masterItem.purchaseUnit || masterItem.unit || '';
            }
        }

        newItems[index] = item;
        setReceivedItems(newItems);
    };

    const saveReceipt = async () => {
        if (!canSave) return;

        setSaving(true);
        try {
            await onSave({
                warehouseId: selectedWarehouseId,
                supplierId: selectedSupplierId || undefined,
                items: receivedItems,
            });
            setReceivedItems([]);
            setSelectedSupplierId('');
            onClose();
        } finally {
            setSaving(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await saveReceipt();
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[110] p-4">
            <div className="card-primary w-full max-w-3xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-emerald-50 dark:bg-emerald-950/20">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center">
                            <Truck size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">
                                {lang === 'ar' ? 'إذن استلام أصناف' : 'Goods Receipt Note'}
                            </h3>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                {lang === 'ar' ? 'إضافة كميات جديدة للمخزن من المورد' : 'Add new stock quantities from supplier'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'المخزن المستلم' : 'Destination Warehouse'}</label>
                            <select
                                required
                                value={selectedWarehouseId}
                                onChange={e => setSelectedWarehouseId(e.target.value)}
                                className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold appearance-none"
                            >
                                <option value="">{lang === 'ar' ? 'اختر مخزن...' : 'Select warehouse...'}</option>
                                {warehouses.map(w => (
                                    <option key={w.id} value={w.id}>{lang === 'ar' ? w.nameAr || w.name : w.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'المورد (اختياري)' : 'Supplier (Optional)'}</label>
                            <select
                                value={selectedSupplierId}
                                onChange={e => setSelectedSupplierId(e.target.value)}
                                className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold appearance-none"
                            >
                                <option value="">{lang === 'ar' ? 'اختر مورد...' : 'Select supplier...'}</option>
                                {suppliers.map(s => (
                                    <option key={s.id} value={s.id}>{lang === 'ar' ? (s as any).nameAr || s.name : s.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">{lang === 'ar' ? 'الأصناف المستلمة' : 'Items Received'}</h4>
                            <button
                                type="button"
                                onClick={handleAddItem}
                                className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-100 transition-all border border-emerald-100 dark:border-emerald-900"
                            >
                                <Plus size={16} /> {lang === 'ar' ? 'إضافة صنف' : 'Add Item'}
                            </button>
                        </div>

                        <div className="space-y-3">
                            {receivedItems.map((item, idx) => (
                                <div key={idx} className="grid grid-cols-1 md:grid-cols-[1fr,120px,120px,140px,40px] gap-3 items-end p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 animate-in slide-in-from-left-2 transition-all">
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
                                        <label className="text-[9px] font-black text-slate-400 uppercase">{lang === 'ar' ? 'وحدة الشراء' : 'Buy Unit'}</label>
                                        <select
                                            value={item.purchaseUnit}
                                            onChange={e => handleUpdateItem(idx, 'purchaseUnit', e.target.value)}
                                            className="w-full px-4 py-2 card-primary rounded-xl outline-none text-sm font-bold appearance-none"
                                        >
                                            {(() => {
                                                const masterItem = inventory.find(i => i.id === item.itemId);
                                                const units = Array.from(new Set([masterItem?.purchaseUnit, masterItem?.unit].filter(Boolean) as string[]));
                                                return units.map(unit => <option key={unit} value={unit}>{unit}</option>);
                                            })()}
                                        </select>
                                        {(() => {
                                            const masterItem = inventory.find(i => i.id === item.itemId);
                                            const factor = Number(masterItem?.purchaseUnitFactor || 1);
                                            if (!masterItem || !item.purchaseUnit || item.purchaseUnit === masterItem.unit || factor <= 1) return null;
                                            return <p className="text-[9px] font-bold text-emerald-600">1 {item.purchaseUnit} = {factor} {masterItem.unit}</p>;
                                        })()}
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase">{lang === 'ar' ? 'الكمية' : 'Qty'}</label>
                                        <input
                                            type="number"
                                            step="0.001"
                                            min="0.001"
                                            value={item.quantity}
                                            onChange={e => handleUpdateItem(idx, 'quantity', Number(e.target.value))}
                                            className="w-full px-4 py-2 card-primary rounded-xl outline-none text-sm font-bold"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase">{lang === 'ar' ? 'سعر الشراء' : 'Purchase Price'}</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0.01"
                                            value={item.costPrice}
                                            onChange={e => handleUpdateItem(idx, 'costPrice', Number(e.target.value))}
                                            className="w-full px-4 py-2 card-primary rounded-xl outline-none text-sm font-bold"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveItem(idx)}
                                        className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl mb-0.5"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}

                            {receivedItems.length === 0 && (
                                <div className="text-center py-12 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-[2rem]">
                                    <Package size={48} className="mx-auto text-slate-200 dark:text-slate-800 mb-4" />
                                    <p className="text-sm font-black text-slate-400 tracking-widest uppercase">{lang === 'ar' ? 'قائمة الاستلام فارغة' : 'Receipt list is empty'}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </form>

                <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex gap-4 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-8 py-4 card-primary text-slate-600 dark:text-slate-400 font-black text-xs uppercase tracking-widest rounded-2xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 transition-all"
                    >
                        {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                        disabled={!canSave}
                        onClick={saveReceipt}
                        className="flex-1 py-4 bg-emerald-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-emerald-700 shadow-xl shadow-emerald-600/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale transition-all"
                    >
                        <Save size={18} /> {saving ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ إذن الاستلام' : 'Save Goods Receipt')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReceiptModal;
