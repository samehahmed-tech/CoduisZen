import React, { useState } from 'react';
import { X, ArrowRight, Package, Hash, Send } from 'lucide-react';
import { InventoryItem, Warehouse } from '@/types';

interface StockTransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (itemId: string, fromWarehouseId: string, toWarehouseId: string, quantity: number) => void;
    lang: 'en' | 'ar';
    items: InventoryItem[];
    warehouses: Warehouse[];
    initialItem?: InventoryItem | null;
    initialFromWarehouse?: Warehouse | null;
}

const StockTransferModal: React.FC<StockTransferModalProps> = ({ isOpen, onClose, onSave, lang, items, warehouses, initialItem, initialFromWarehouse }) => {
    const [selectedItemId, setSelectedItemId] = useState(initialItem?.id || '');
    const [fromWarehouseId, setFromWarehouseId] = useState(initialFromWarehouse?.id || '');
    const [toWarehouseId, setToWarehouseId] = useState('');
    const [quantity, setQuantity] = useState<number>(0);
    const [saving, setSaving] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedItemId || !fromWarehouseId || !toWarehouseId || quantity <= 0) return;
        setSaving(true);
        try {
            await onSave(selectedItemId, fromWarehouseId, toWarehouseId, quantity);
            onClose();
        } finally {
            setSaving(false);
        }
    };

    const selectedItem = items.find(i => i.id === selectedItemId);
    const currentQty = selectedItem?.warehouseQuantities.find(wq => wq.warehouseId === fromWarehouseId)?.quantity || 0;

    return (
        <div className="fixed inset-0 bg-slate-900/60  flex items-center justify-center z-[110] p-4">
            <div className="card-primary w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-indigo-50 dark:bg-indigo-950/20">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center">
                            <Send size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">
                                {lang === 'ar' ? 'تحويل مخزني' : 'Inventory Transfer'}
                            </h3>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                {lang === 'ar' ? 'نقل الأصناف بين المخازن' : 'Move items between warehouses'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={24} /></button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    <div className="space-y-6">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'الصنف المراد تحويله' : 'Item to Transfer'}</label>
                            <select
                                required
                                value={selectedItemId}
                                onChange={e => setSelectedItemId(e.target.value)}
                                className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold appearance-none"
                            >
                                <option value="">{lang === 'ar' ? 'اختر صنف...' : 'Select item...'}</option>
                                {items.map(i => (
                                    <option key={i.id} value={i.id}>{lang === 'ar' ? i.nameAr || i.name : i.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-[1fr,40px,1fr] items-center gap-2">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'من مخزن' : 'From'}</label>
                                <select
                                    required
                                    value={fromWarehouseId}
                                    onChange={e => setFromWarehouseId(e.target.value)}
                                    className="w-full px-4 py-3.5 bg-slate-100 dark:bg-slate-800 border-none rounded-2xl outline-none font-bold appearance-none"
                                >
                                    <option value="">{lang === 'ar' ? 'المصدر...' : 'Source...'}</option>
                                    {warehouses.map(w => (
                                        <option key={w.id} value={w.id}>{lang === 'ar' ? w.nameAr || w.name : w.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex justify-center pt-5">
                                <ArrowRight size={20} className="text-slate-300" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'إلى مخزن' : 'To'}</label>
                                <select
                                    required
                                    value={toWarehouseId}
                                    onChange={e => setToWarehouseId(e.target.value)}
                                    className="w-full px-4 py-3.5 bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-100 dark:border-indigo-900 rounded-2xl outline-none font-bold appearance-none text-indigo-600 dark:text-indigo-400"
                                >
                                    <option value="">{lang === 'ar' ? 'الوجهة...' : 'Destination...'}</option>
                                    {warehouses.filter(w => w.id !== fromWarehouseId).map(w => (
                                        <option key={w.id} value={w.id}>{lang === 'ar' ? w.nameAr || w.name : w.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {selectedItemId && fromWarehouseId && (
                            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 flex justify-between items-center animate-in slide-in-from-top-2">
                                <span className="text-xs font-black text-slate-400 uppercase">{lang === 'ar' ? 'رصيد المصدر المتاح:' : 'Available in Source:'}</span>
                                <span className="text-lg font-black text-slate-800 dark:text-white">{currentQty} {selectedItem?.unit}</span>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'الكمية المراد نقلها' : 'Quantity to Transfer'}</label>
                            <div className="relative">
                                <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    required
                                    type="number"
                                    step="0.001"
                                    max={currentQty}
                                    value={quantity}
                                    onChange={e => setQuantity(Number(e.target.value))}
                                    className="w-full pl-12 pr-4 py-4 card-primary border-2 border-indigo-100 dark:border-indigo-900 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-black text-xl text-center"
                                />
                            </div>
                            {quantity > currentQty && (
                                <p className="text-[10px] font-bold text-rose-500 flex items-center gap-1 mt-1">
                                    {lang === 'ar' ? '⚠️ تنبيه: الكمية المطلوبة أكبر من الرصيد المتاح' : '⚠️ Warning: Requested quantity exceeds source stock'}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex gap-4 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-200 transition-all"
                        >
                            {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                        </button>
                        <button
                            disabled={saving || quantity <= 0 || quantity > currentQty}
                            onClick={handleSubmit}
                            className="flex-1 py-4 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-indigo-700 shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale transition-all"
                        >
                            <Send size={18} /> {saving ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'إرسال الشحنة' : 'Execute Transfer')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default StockTransferModal;
