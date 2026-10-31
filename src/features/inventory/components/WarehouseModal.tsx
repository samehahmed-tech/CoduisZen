import React, { useState, useEffect } from 'react';
import { X, Save, Home, MapPin, Briefcase, GitBranch, ShieldCheck } from 'lucide-react';
import { Warehouse, WarehouseType, Branch } from '@/types';
import { generateInternalId } from '@/src/utils/idGenerator';

interface WarehouseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (warehouse: Warehouse) => void;
    lang: 'en' | 'ar';
    branches: Branch[];
    warehouses: Warehouse[]; // For parent selection
    initialWarehouse?: Warehouse | null;
}

const WarehouseModal: React.FC<WarehouseModalProps> = ({ isOpen, onClose, onSave, lang, branches, warehouses, initialWarehouse }) => {
    const [formData, setFormData] = useState<Partial<Warehouse>>({
        name: '',
        nameAr: '',
        branchId: '',
        type: WarehouseType.SUB,
        isActive: true,
        parentId: undefined
    });

    useEffect(() => {
        if (initialWarehouse) {
            setFormData(initialWarehouse);
        } else {
            setFormData({
                id: generateInternalId(),
                name: '',
                nameAr: '',
                branchId: '',
                type: WarehouseType.SUB,
                isActive: true,
                parentId: undefined
            });
        }
    }, [initialWarehouse, isOpen]);

    const [saving, setSaving] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await onSave(formData as Warehouse);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60  flex items-center justify-center z-[110] p-4">
            <div className="card-primary w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center">
                            <Home size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">
                                {lang === 'ar' ? (initialWarehouse ? 'تعديل مخزن' : 'إضافة مخزن جديد') : (initialWarehouse ? 'Edit Warehouse' : 'Add Warehouse')}
                            </h3>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                {lang === 'ar' ? 'تعيين فروع ومستويات المخازن' : 'Define branch and warehouse levels'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'اسم المخزن (EN)' : 'Warehouse Name (EN)'}</label>
                            <div className="relative">
                                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    required
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5" dir="rtl">
                            <label className="text-[10px] font-black text-slate-400 uppercase mr-1">{lang === 'ar' ? 'اسم المخزن (AR)' : 'Warehouse Name (AR)'}</label>
                            <input
                                required
                                type="text"
                                value={formData.nameAr}
                                onChange={e => setFormData({ ...formData, nameAr: e.target.value })}
                                className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'نوع المخزن' : 'Type'}</label>
                            <select
                                value={formData.type}
                                onChange={e => setFormData({ ...formData, type: e.target.value as WarehouseType })}
                                className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold appearance-none"
                            >
                                {Object.values(WarehouseType).map(t => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'الفرع التابع' : 'Associated Branch'}</label>
                            <select
                                value={formData.branchId}
                                onChange={e => setFormData({ ...formData, branchId: e.target.value })}
                                className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold appearance-none"
                            >
                                <option value="">{lang === 'ar' ? 'اختر فرع...' : 'Select branch...'}</option>
                                {branches.map(b => (
                                    <option key={b.id} value={b.id}>{lang === 'ar' ? (b as any).nameAr || b.name : b.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{lang === 'ar' ? 'المخزن الرئيسي (اختياري)' : 'Parent Warehouse (Optional)'}</label>
                        <div className="relative">
                            <GitBranch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <select
                                value={formData.parentId}
                                onChange={e => setFormData({ ...formData, parentId: e.target.value || undefined })}
                                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold appearance-none"
                            >
                                <option value="">{lang === 'ar' ? 'لا يوجد (مخزن مركزي)' : 'None (Master Warehouse)'}</option>
                                {warehouses.filter(w => w.id !== formData.id).map(w => (
                                    <option key={w.id} value={w.id}>{lang === 'ar' ? w.nameAr || w.name : w.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="pt-4 flex items-center gap-4">
                        <label className="flex items-center gap-3 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={formData.isActive}
                                onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                                className="hidden"
                            />
                            <div className={`w-12 h-6 rounded-full relative transition-colors ${formData.isActive ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${formData.isActive ? 'left-7' : 'left-1'}`} />
                            </div>
                            <div className="flex items-center gap-2">
                                <ShieldCheck size={16} className={formData.isActive ? 'text-emerald-500' : 'text-slate-400'} />
                                <span className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase">{lang === 'ar' ? 'نشط' : 'Is Active'}</span>
                            </div>
                        </label>
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
                            disabled={saving}
                            onClick={handleSubmit}
                            className="flex-1 py-4 bg-emerald-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-emerald-700 shadow-xl shadow-emerald-600/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale transition-all"
                        >
                            <Save size={18} /> {saving ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ المخزن' : 'Save Warehouse')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default WarehouseModal;
