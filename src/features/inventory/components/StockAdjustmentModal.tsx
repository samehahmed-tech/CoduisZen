import React, { useEffect, useState } from 'react';
import { X, Save, AlertTriangle, Calculator, ArrowRight } from 'lucide-react';
import { InventoryItem, Warehouse } from '@/types';
import { getStockAdjustmentPreview } from '@/services/stockAdjustment';

interface StockAdjustmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (itemId: string, warehouseId: string, quantity: number, reason: string) => void;
    lang: 'en' | 'ar';
    items: InventoryItem[];
    warehouses: Warehouse[];
    initialItem?: InventoryItem | null;
    initialWarehouse?: Warehouse | null;
}

const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({ isOpen, onClose, onSave, lang, items, warehouses, initialItem, initialWarehouse }) => {
    const [selectedItemId, setSelectedItemId] = useState(initialItem?.id || '');
    const [selectedWarehouseId, setSelectedWarehouseId] = useState(initialWarehouse?.id || '');
    const [quantityInput, setQuantityInput] = useState('');
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setSelectedItemId(initialItem?.id || '');
        setSelectedWarehouseId(initialWarehouse?.id || '');
        setReason('');
    }, [isOpen, initialItem?.id, initialWarehouse?.id]);

    const selectedItem = items.find(i => i.id === selectedItemId);
    const currentQty = Number(selectedItem?.warehouseQuantities.find(wq => wq.warehouseId === selectedWarehouseId)?.quantity || 0);

    useEffect(() => {
        if (!isOpen || !selectedItemId || !selectedWarehouseId) {
            setQuantityInput('');
            return;
        }
        setQuantityInput(String(Number.isFinite(currentQty) ? currentQty : 0));
    }, [isOpen, selectedItemId, selectedWarehouseId, currentQty]);

    if (!isOpen) return null;

    const preview = getStockAdjustmentPreview(currentQty, quantityInput);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedItemId || !selectedWarehouseId || preview.newQuantity === null) return;
        setSaving(true);
        try {
            await onSave(selectedItemId, selectedWarehouseId, preview.newQuantity, reason);
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60  flex items-center justify-center z-[110] p-4">
            <div className="card-primary w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-amber-50 dark:bg-amber-950/20">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center">
                            <AlertTriangle size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">
                                {lang === 'ar' ? 'تسوية مخزون (جرد)' : 'Stock Adjustment'}
                            </h3>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                {lang === 'ar' ? 'تعديل الكمية الفعلية للصنف' : 'Adjust physical item quantity'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={24} /></button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'الصنف' : 'Item'}</label>
                            <select
                                required
                                value={selectedItemId}
                                onChange={e => setSelectedItemId(e.target.value)}
                                className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none transition-all font-bold appearance-none"
                            >
                                <option value="">{lang === 'ar' ? 'اختر صنف...' : 'Select item...'}</option>
                                {items.map(i => (
                                    <option key={i.id} value={i.id}>{lang === 'ar' ? i.nameAr || i.name : i.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'المخزن' : 'Warehouse'}</label>
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

                        {selectedItemId && selectedWarehouseId && (
                            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 flex justify-between items-center">
                                <span className="text-xs font-black text-slate-400 uppercase">{lang === 'ar' ? 'الكمية الحالية:' : 'Current Qty:'}</span>
                                <span className="text-lg font-black text-slate-800 dark:text-white">{currentQty} {selectedItem?.unit}</span>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'الكمية الفعلية' : 'New Quantity'}</label>
                                <div className="relative">
                                    <Calculator className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input
                                        required
                                        type="number"
                                        min="0"
                                        step="0.001"
                                        value={quantityInput}
                                        onChange={e => setQuantityInput(e.target.value)}
                                        aria-invalid={!preview.isValid}
                                        className="w-full pl-12 pr-4 py-3.5 card-primary border border-amber-200 dark:border-amber-900 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none transition-all font-bold"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'الفرق' : 'Difference'}</label>
                                <div className={`px-4 py-3.5 rounded-2xl font-black flex items-center justify-center text-lg ${(preview.delta ?? 0) >= 0 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30' : 'bg-rose-50 text-rose-600 dark:bg-rose-950/30'}`}>
                                    {preview.delta === null ? '—' : `${preview.delta > 0 ? '+' : ''}${preview.delta}`}
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-200 dark:border-amber-900 flex items-center justify-between" aria-live="polite">
                            <div>
                                <p className="text-[10px] font-black text-amber-700 dark:text-amber-300 uppercase">
                                    {lang === 'ar' ? 'الكمية بعد الحفظ' : 'Quantity after saving'}
                                </p>
                                <p className="text-xs font-bold text-slate-500">{currentQty} {selectedItem?.unit}</p>
                            </div>
                            <ArrowRight className={lang === 'ar' ? 'rotate-180' : ''} size={20} />
                            <span className="text-xl font-black text-amber-700 dark:text-amber-300">
                                {preview.newQuantity === null ? '—' : preview.newQuantity} {selectedItem?.unit}
                            </span>
                        </div>
                        {!preview.isValid && quantityInput !== '' && (
                            <p className="text-xs font-bold text-rose-600">
                                {lang === 'ar' ? 'أدخل كمية صحيحة تساوي صفر أو أكبر.' : 'Enter a finite quantity greater than or equal to zero.'}
                            </p>
                        )}

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'السبب' : 'Reason'}</label>
                            <textarea
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                                className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none transition-all font-medium text-sm min-h-[100px]"
                                placeholder={lang === 'ar' ? 'مثال: جرد شهري، كسر، تلف...' : 'e.g. Monthly audit, waste, damage...'}
                            />
                        </div>
                    </div>

                    <div className="flex gap-4 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-200 transition-all"
                        >
                            {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                        </button>
                        <button
                            disabled={saving || !selectedItemId || !selectedWarehouseId || !preview.isValid}
                            type="submit"
                            className="flex-1 py-4 bg-amber-500 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-amber-600 shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale transition-all"
                        >
                            <Save size={18} /> {saving ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'تأكيد التسوية' : 'Confirm Adjustment')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default StockAdjustmentModal;
