import React, { useState, useEffect, useRef } from 'react';
import {
    Eye, EyeOff, Edit3, Copy, Archive, Trash2,
    CheckSquare, Square, AlertTriangle, TrendingDown, Flame, Package, Layers
} from 'lucide-react';
import { MenuItem } from '../../types';
import { ItemImage } from '../../src/features/pos/components/ItemImage';

interface Props {
    items: (MenuItem & { _categoryId: string; _categoryName: string; _categoryNameAr?: string })[];
    selectedItemIds: Set<string>;
    multiSelectMode: boolean;
    onToggleSelection: (id: string, shiftKey: boolean) => void;
    onSelectAll: () => void;
    onToggleAvailability: (item: any) => void;
    onDuplicate: (item: any) => void;
    onArchive: (item: any) => void;
    onDelete: (item: any) => void;
    onEdit: (item: any) => void;
    onInlineUpdate: (categoryId: string, updatedItem: MenuItem) => void;
    lang: string;
    currency: string;
}

const getMarginPercent = (item: MenuItem) => {
    if (!item.cost || item.price <= 0) return null;
    return ((item.price - item.cost) / item.price) * 100;
};

const getMarginColor = (margin: number | null) => {
    if (margin === null) return 'text-gray-400 dark:text-muted';
    if (margin >= 50) return 'text-emerald-600 dark:text-emerald-500';
    if (margin >= 30) return 'text-amber-600 dark:text-amber-500';
    return 'text-red-600 dark:text-rose-500';
};

const InlineInput: React.FC<{
    value: string | number;
    type?: 'text' | 'number';
    onChange: (val: string | number) => void;
    className?: string;
    placeholder?: string;
}> = ({ value, type = 'text', onChange, className = '', placeholder }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [localValue, setLocalValue] = useState(value);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { setLocalValue(value); }, [value]);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            if (type === 'text') inputRef.current.select();
        }
    }, [isEditing, type]);

    const handleBlur = () => {
        setIsEditing(false);
        if (localValue !== value) {
            onChange(type === 'number' ? parseFloat(localValue as string) || 0 : localValue);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleBlur();
        if (e.key === 'Escape') {
            setLocalValue(value);
            setIsEditing(false);
        }
    };

    if (isEditing) {
        return (
            <input
                ref={inputRef}
                type={type}
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className={`w-full bg-white dark:bg-card px-2 py-1 rounded border border-blue-500 outline-none shadow-sm ${className}`}
            />
        );
    }

    return (
        <div
            onClick={() => setIsEditing(true)}
            className={`cursor-text hover:bg-gray-100 dark:hover:bg-elevated/40 px-2 py-1 rounded border border-transparent hover:border-gray-200 dark:hover:border-border/30 transition-colors truncate ${className}`}
        >
            {value === '' && placeholder ? <span className="text-gray-400">{placeholder}</span> : value}
        </div>
    );
};

// Dietary Badges Map
const dietaryBadgesMap: Record<string, { labelEn: string; labelAr: string; color: string }> = {
    'vegan': { labelEn: 'Vegan', labelAr: 'نباتي صرف', color: 'bg-green-500 text-white' },
    'vegetarian': { labelEn: 'Vegetarian', labelAr: 'نباتي', color: 'bg-emerald-500 text-white' },
    'gluten-free': { labelEn: 'GF', labelAr: 'بدون جلوتين', color: 'bg-amber-500 text-white' },
    'spicy': { labelEn: 'Spicy', labelAr: 'حار', color: 'bg-red-500 text-white' },
    'keto': { labelEn: 'Keto', labelAr: 'كيتو', color: 'bg-blue-500 text-white' },
    'new': { labelEn: 'New', labelAr: 'جديد', color: 'bg-indigo-500 text-white' },
};

const ItemTable: React.FC<Props> = ({
    items, selectedItemIds, multiSelectMode,
    onToggleSelection, onSelectAll, onToggleAvailability,
    onDuplicate, onArchive, onDelete, onEdit, onInlineUpdate,
    lang, currency
}) => {
    const allSelected = items.length > 0 && selectedItemIds.size === items.length;
    const labelFor = (item: MenuItem & { _categoryId: string; _categoryName: string; _categoryNameAr?: string }) =>
        lang === 'ar' ? (item.nameAr || item.name) : item.name;

    return (
        <div className="w-full bg-white dark:bg-card rounded-lg border border-gray-200 dark:border-white/[0.06] shadow-sm overflow-hidden flex flex-col h-full">
            <div className="overflow-x-auto min-h-[400px]">
                <table className="w-full text-left whitespace-nowrap">
                    <thead className="bg-gray-50 dark:bg-elevated/50 border-b border-gray-200 dark:border-white/[0.06] text-[11px] font-semibold text-gray-500 dark:text-muted uppercase tracking-wider sticky top-0 z-10">
                        <tr>
                            <th className="px-4 py-3 w-10 text-center">
                                {multiSelectMode && (
                                    <button
                                        onClick={onSelectAll}
                                        className="text-gray-400 hover:text-blue-600 transition-colors"
                                        aria-label={allSelected ? (lang === 'ar' ? 'إلغاء تحديد كل الأصناف' : 'Clear all item selections') : (lang === 'ar' ? 'تحديد كل الأصناف' : 'Select all items')}
                                        title={allSelected ? (lang === 'ar' ? 'إلغاء تحديد الكل' : 'Clear selection') : (lang === 'ar' ? 'تحديد الكل' : 'Select all')}
                                    >
                                        {allSelected ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}
                                    </button>
                                )}
                            </th>
                            <th className="px-4 py-3 w-14">IMG</th>
                            <th className="px-4 py-3">{lang === 'ar' ? 'الاسم (عربي)' : 'Name (AR)'}</th>
                            <th className="px-4 py-3">{lang === 'ar' ? 'الاسم (إنجليزي)' : 'Name (EN)'}</th>
                            <th className="px-4 py-3">{lang === 'ar' ? 'السعر' : 'Price'}</th>
                            <th className="px-4 py-3">{lang === 'ar' ? 'التكلفة' : 'Cost'}</th>
                            <th className="px-4 py-3">{lang === 'ar' ? 'الهامش' : 'Margin'}</th>
                            <th className="px-4 py-3">30D</th>
                            <th className="px-4 py-3 text-center">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                            <th className="px-4 py-3 text-right">{lang === 'ar' ? 'إجراءات' : 'Actions'}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                        {items.map(item => {
                            const isSelected = selectedItemIds.has(item.id);
                            const margin = getMarginPercent(item);

                            return (
                                <tr
                                    key={item.id}
                                    className={`group hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors ${isSelected ? 'bg-blue-50/50 dark:bg-indigo-500/10' : ''} ${!item.isAvailable ? 'opacity-60' : ''}`}
                                    onClick={(e) => {
                                        if (multiSelectMode) {
                                            onToggleSelection(item.id, e.shiftKey);
                                        }
                                    }}
                                >
                                    <td className="px-4 py-2 text-center">
                                        {(multiSelectMode || isSelected) && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onToggleSelection(item.id, e.shiftKey); }}
                                                className="text-gray-400 hover:text-blue-600 transition-colors inline-flex"
                                                aria-label={isSelected ? (lang === 'ar' ? `إلغاء تحديد ${labelFor(item)}` : `Deselect ${labelFor(item)}`) : (lang === 'ar' ? `تحديد ${labelFor(item)}` : `Select ${labelFor(item)}`)}
                                                title={isSelected ? (lang === 'ar' ? 'إلغاء التحديد' : 'Deselect') : (lang === 'ar' ? 'تحديد' : 'Select')}
                                            >
                                                {isSelected ? <CheckSquare size={16} className="text-blue-600 dark:text-indigo-500" /> : <Square size={16} />}
                                            </button>
                                        )}
                                    </td>
                                    <td className="px-4 py-2">
                                        <ItemImage src={item.image} name={labelFor(item)} small className="w-8 h-8 rounded border border-gray-200 dark:border-border/30" />
                                    </td>
                                    <td className="px-4 py-2" dir="rtl">
                                        <InlineInput
                                            value={item.nameAr || ''}
                                            onChange={(val) => onInlineUpdate(item._categoryId, { ...item, nameAr: val as string })}
                                            className="text-[13px] font-medium text-gray-800 dark:text-main text-right min-w-[120px]"
                                            placeholder="الاسم بالعربي"
                                        />
                                        <div className="text-[10px] text-gray-400 px-2 mt-0.5">{item._categoryNameAr || item._categoryName}</div>
                                    </td>
                                    <td className="px-4 py-2">
                                        <InlineInput
                                            value={item.name}
                                            onChange={(val) => onInlineUpdate(item._categoryId, { ...item, name: val as string })}
                                            className="text-[13px] font-medium text-gray-800 dark:text-main min-w-[120px]"
                                        />
                                        {(item.dietaryBadges?.length || 0) > 0 || (item.sizes?.length || 0) > 0 || (item.modifierGroups?.length || 0) > 0 ? (
                                            <div className="flex flex-wrap gap-1 px-2 mt-1">
                                                {item.dietaryBadges?.map(b => {
                                                    const bdg = dietaryBadgesMap[b];
                                                    if (!bdg) return null;
                                                    return (
                                                        <span key={b} className={`px-1 rounded text-[9px] font-medium uppercase tracking-wider ${bdg.color}`}>
                                                            {lang === 'ar' ? bdg.labelAr : bdg.labelEn}
                                                        </span>
                                                    );
                                                })}
                                                {(item.sizes?.length || 0) > 0 && (
                                                    <span className="flex items-center gap-1 bg-blue-50/50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1 py-0.5 rounded text-[9px] font-medium border border-blue-100 dark:border-blue-500/20">
                                                        <Package size={9} /> {item.sizes?.length} {lang === 'ar' ? 'أحجام' : 'Sizes'}
                                                    </span>
                                                )}
                                                {(item.modifierGroups?.length || 0) > 0 && (
                                                    <span className="flex items-center gap-1 bg-purple-50/50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 px-1 py-0.5 rounded text-[9px] font-medium border border-purple-100 dark:border-purple-500/20">
                                                        <Layers size={9} /> {item.modifierGroups?.length} {lang === 'ar' ? 'إضافات' : 'Mods'}
                                                    </span>
                                                )}
                                            </div>
                                        ) : null}
                                    </td>
                                    <td className="px-4 py-2">
                                        <div className="flex items-center gap-1">
                                            <span className="text-[11px] text-gray-400">{currency}</span>
                                            <InlineInput
                                                type="number"
                                                value={item.price}
                                                onChange={(val) => onInlineUpdate(item._categoryId, { ...item, price: val as number })}
                                                className="text-[13px] font-semibold text-emerald-600 dark:text-emerald-500 w-20"
                                            />
                                        </div>
                                    </td>
                                    <td className="px-4 py-2">
                                        <div className="flex items-center gap-1">
                                            <span className="text-[11px] text-gray-400">{currency}</span>
                                            <InlineInput
                                                type="number"
                                                value={item.cost || ''}
                                                onChange={(val) => onInlineUpdate(item._categoryId, { ...item, cost: val as number })}
                                                className="text-[13px] text-gray-500 dark:text-muted w-20"
                                                placeholder="0"
                                            />
                                        </div>
                                    </td>
                                    <td className="px-4 py-2">
                                        {margin !== null ? (
                                            <span className={`text-[12px] font-semibold ${getMarginColor(margin)}`}>{margin.toFixed(0)}%</span>
                                        ) : (
                                            <span className="text-gray-300">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2">
                                        <span className="text-[12px] text-gray-700 dark:text-main font-medium">{item.salesData?.last30 || 0}</span>
                                    </td>
                                    <td className="px-4 py-2 text-center">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onToggleAvailability(item); }}
                                            className={`p-1.5 rounded transition-colors inline-flex ${item.isAvailable ? 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10' : 'text-red-500 hover:bg-red-50 dark:hover:bg-rose-500/10'}`}
                                            aria-label={item.isAvailable ? (lang === 'ar' ? `إخفاء ${labelFor(item)}` : `Hide ${labelFor(item)}`) : (lang === 'ar' ? `إظهار ${labelFor(item)}` : `Show ${labelFor(item)}`)}
                                            title={item.isAvailable ? (lang === 'ar' ? 'إخفاء' : 'Hide') : (lang === 'ar' ? 'إظهار' : 'Show')}
                                        >
                                            {item.isAvailable ? <Eye size={14} /> : <EyeOff size={14} />}
                                        </button>
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={(e) => { e.stopPropagation(); onEdit(item); }} className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-elevated/40 transition-colors" aria-label={lang === 'ar' ? `تعديل ${labelFor(item)}` : `Edit ${labelFor(item)}`} title={lang === 'ar' ? 'تعديل' : 'Edit'}><Edit3 size={14} /></button>
                                            <button onClick={(e) => { e.stopPropagation(); onDuplicate(item); }} className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-elevated/40 transition-colors" aria-label={lang === 'ar' ? `نسخ ${labelFor(item)}` : `Duplicate ${labelFor(item)}`} title={lang === 'ar' ? 'نسخ' : 'Duplicate'}><Copy size={14} /></button>
                                            <button onClick={(e) => { e.stopPropagation(); onArchive(item); }} className="p-1.5 rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-elevated/40 transition-colors" aria-label={lang === 'ar' ? `أرشفة ${labelFor(item)}` : `Archive ${labelFor(item)}`} title={lang === 'ar' ? 'أرشفة' : 'Archive'}><Archive size={14} /></button>
                                            <button onClick={(e) => { e.stopPropagation(); onDelete(item); }} className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-elevated/40 transition-colors" aria-label={lang === 'ar' ? `حذف ${labelFor(item)}` : `Delete ${labelFor(item)}`} title={lang === 'ar' ? 'حذف' : 'Delete'}><Trash2 size={14} /></button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ItemTable;
