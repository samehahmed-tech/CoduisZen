import React, { useState, useEffect } from 'react';
import { X, Save, Trash2, Printer, Target, Globe, Smartphone } from 'lucide-react';
import { MenuCategory, Printer as PrinterType, Branch, DeliveryPlatform, OrderType } from '../../types';

interface Props {
    category: MenuCategory;
    mode: 'ADD' | 'EDIT';
    menuId: string;
    printers: PrinterType[];
    branches: Branch[];
    platforms: DeliveryPlatform[];
    onSave: (cat: MenuCategory) => void;
    onClose: () => void;
    onDelete?: () => void;
    lang: string;
}

const CategoryDrawer: React.FC<Props> = ({
    category, mode, menuId, printers, branches, platforms,
    onSave, onClose, onDelete, lang
}) => {
    const [formData, setFormData] = useState<MenuCategory>(category);

    useEffect(() => {
        setFormData(category);
    }, [category]);

    const handleSave = () => {
        if (!formData.name.trim()) return;
        const toSave = { ...formData };
        if (mode === 'ADD' && !toSave.menuIds.includes(menuId)) {
            toSave.menuIds = [...toSave.menuIds, menuId];
        }
        onSave(toSave);
    };

    const togglePrinter = (printerId: string) => {
        setFormData(prev => {
            const current = prev.printerIds || [];
            if (current.includes(printerId)) {
                return { ...prev, printerIds: current.filter(id => id !== printerId) };
            }
            return { ...prev, printerIds: [...current, printerId] };
        });
    };

    const toggleTarget = (key: 'targetBranches' | 'targetPlatforms' | 'targetOrderTypes', id: string) => {
        setFormData(prev => {
            const current = (prev[key] || []) as string[];
            if (current.includes(id as any)) {
                return { ...prev, [key]: current.filter(x => x !== id) };
            }
            return { ...prev, [key]: [...current, id] };
        });
    };

    return (
        <div className="fixed inset-0 z-[250] flex justify-end">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-[400px] bg-white dark:bg-card shadow-2xl border-l border-gray-100 dark:border-white/[0.04] flex flex-col animate-slide-in h-full">
                {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-white/[0.04]">
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-main">
                    {mode === 'ADD'
                        ? (lang === 'ar' ? 'إضافة قسم جديد' : 'Add New Category')
                        : (lang === 'ar' ? 'تعديل قسم' : 'Edit Category')}
                </h2>
                <div className="flex items-center gap-2">
                    {mode === 'EDIT' && onDelete && (
                        <button
                            onClick={onDelete}
                            className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-rose-500/10 rounded-md transition-colors"
                            title={lang === 'ar' ? 'حذف القسم' : 'Delete Category'}
                        >
                            <Trash2 size={16} />
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-main hover:bg-gray-100 dark:hover:bg-elevated/40 rounded-md transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Names */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-[12px] font-medium text-gray-700 dark:text-main mb-1.5">
                            {lang === 'ar' ? 'الاسم (إنجليزي) *' : 'Name (English) *'}
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                            className="w-full bg-gray-50 dark:bg-elevated border border-gray-200 dark:border-border/30 rounded-md px-3 py-2 text-[13px] text-gray-900 dark:text-main focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                            placeholder="e.g. Hot Drinks"
                            autoFocus
                        />
                    </div>
                    <div dir="rtl">
                        <label className="block text-[12px] font-medium text-gray-700 dark:text-main mb-1.5">
                            {lang === 'ar' ? 'الاسم (عربي)' : 'Name (Arabic)'}
                        </label>
                        <input
                            type="text"
                            value={formData.nameAr || ''}
                            onChange={(e) => setFormData(p => ({ ...p, nameAr: e.target.value }))}
                            className="w-full bg-gray-50 dark:bg-elevated border border-gray-200 dark:border-border/30 rounded-md px-3 py-2 text-[13px] text-gray-900 dark:text-main focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all text-right"
                            placeholder="مثال: مشروبات ساخنة"
                        />
                    </div>
                </div>

                {/* Status */}
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-elevated/50 rounded-lg border border-gray-200 dark:border-border/20">
                    <div>
                        <p className="text-[13px] font-medium text-gray-800 dark:text-main">{lang === 'ar' ? 'مفعل' : 'Active'}</p>
                        <p className="text-[11px] text-gray-500 dark:text-muted/60">
                            {lang === 'ar' ? 'إظهار القسم في الكاشير' : 'Show category on POS'}
                        </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={formData.isActive !== false}
                            onChange={(e) => setFormData(p => ({ ...p, isActive: e.target.checked }))}
                        />
                        <div className="w-11 h-6 bg-gray-200 dark:bg-elevated/60 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 dark:peer-checked:bg-indigo-500"></div>
                    </label>
                </div>

                {/* Targets Multi-Select */}
                <div className="space-y-4 pt-2 border-t border-gray-100 dark:border-border/10">
                    <div>
                        <h3 className="text-[12px] font-bold text-gray-800 dark:text-main flex items-center gap-2 mb-2">
                            <Target size={14} className="text-gray-400" />
                            {lang === 'ar' ? 'أنواع الطلبات المتاحة' : 'Available Order Types'}
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {Object.values(OrderType).map(type => {
                                const isSelected = (formData.targetOrderTypes || []).includes(type);
                                return (
                                    <button
                                        key={type}
                                        onClick={() => toggleTarget('targetOrderTypes', type)}
                                        className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all ${isSelected ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-transparent text-muted border-border/30 hover:border-indigo-500/50'}`}
                                    >
                                        {type}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {branches.length > 0 && (
                        <div>
                            <h3 className="text-[12px] font-bold text-gray-800 dark:text-main flex items-center gap-2 mb-2">
                                <Globe size={14} className="text-gray-400" />
                                {lang === 'ar' ? 'مخصص لفروع محددة' : 'Target Branches'}
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {branches.map(branch => {
                                    const isSelected = (formData.targetBranches || []).includes(branch.id);
                                    return (
                                        <button
                                            key={branch.id}
                                            onClick={() => toggleTarget('targetBranches', branch.id)}
                                            className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all ${isSelected ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/30' : 'bg-transparent text-muted border-border/30 hover:border-indigo-500/50'}`}
                                        >
                                            {lang === 'ar' ? branch.nameAr || branch.name : branch.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {platforms.length > 0 && (
                        <div>
                            <h3 className="text-[12px] font-bold text-gray-800 dark:text-main flex items-center gap-2 mb-2">
                                <Smartphone size={14} className="text-gray-400" />
                                {lang === 'ar' ? 'مخصص لمنصات توصيل' : 'Target Platforms'}
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {platforms.map(plat => {
                                    const isSelected = (formData.targetPlatforms || []).includes(plat.id);
                                    return (
                                        <button
                                            key={plat.id}
                                            onClick={() => toggleTarget('targetPlatforms', plat.id)}
                                            className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all ${isSelected ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/30' : 'bg-transparent text-muted border-border/30 hover:border-indigo-500/50'}`}
                                        >
                                            {plat.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Printer Routing */}
                <div>
                    <h3 className="text-[13px] font-medium text-gray-800 dark:text-main flex items-center gap-2 mb-3">
                        <Printer size={16} className="text-gray-400" />
                        {lang === 'ar' ? 'توجيه الطابعات (المطبخ)' : 'Printer Routing (Kitchen)'}
                    </h3>
                    {printers.length === 0 ? (
                        <p className="text-[12px] text-gray-500 dark:text-muted/60 p-3 bg-gray-50 dark:bg-elevated/30 rounded-lg">
                            {lang === 'ar' ? 'لا توجد طابعات مضافة.' : 'No printers configured.'}
                        </p>
                    ) : (
                        <div className="grid grid-cols-2 gap-2">
                            {printers.map(printer => {
                                const isSelected = (formData.printerIds || []).includes(printer.id);
                                return (
                                    <button
                                        key={printer.id}
                                        onClick={() => togglePrinter(printer.id)}
                                        className={`flex items-center justify-between p-2.5 rounded-lg border text-left transition-colors ${isSelected
                                                ? 'bg-blue-50 dark:bg-indigo-500/10 border-blue-200 dark:border-indigo-500/30 text-blue-700 dark:text-indigo-400'
                                                : 'bg-white dark:bg-card border-gray-200 dark:border-border/30 text-gray-600 dark:text-muted hover:border-blue-300 dark:hover:border-indigo-500/50'
                                            }`}
                                    >
                                        <div className="truncate pr-2">
                                            <p className="text-[12px] font-medium truncate">{printer.name}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-gray-100 dark:border-white/[0.04] bg-gray-50 dark:bg-elevated/30 flex justify-end gap-2">
                <button
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg text-[13px] font-medium text-gray-600 dark:text-muted hover:bg-gray-200 dark:hover:bg-elevated/60 transition-colors"
                >
                    {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                    onClick={handleSave}
                    disabled={!formData.name.trim()}
                    className="px-4 py-2 rounded-lg text-[13px] font-medium bg-blue-600 dark:bg-indigo-500 text-white hover:bg-blue-700 dark:hover:bg-indigo-600 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                    <Save size={16} />
                    {lang === 'ar' ? 'حفظ' : 'Save'}
                </button>
                </div>
            </div>
        </div>
    );
};

export default CategoryDrawer;
