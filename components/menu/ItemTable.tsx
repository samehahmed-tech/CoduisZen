import React, { useState, useEffect, useRef } from 'react';
import {
    Eye, EyeOff, Edit3, Copy, Archive, ArchiveRestore, Trash2,
    CheckSquare, Square, Package, Layers
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

const marginTone = (margin: number | null) => {
    if (margin === null) return 'is-none';
    if (margin >= 50) return 'is-good';
    if (margin >= 30) return 'is-warn';
    return 'is-low';
};

const marginLabel = (margin: number | null, lang: string) => {
    if (margin === null) return lang === 'ar' ? 'بدون تكلفة' : 'No cost';
    if (margin >= 50) return lang === 'ar' ? 'هامش ممتاز' : 'Excellent';
    if (margin >= 30) return lang === 'ar' ? 'هامش جيد' : 'Good';
    return lang === 'ar' ? 'يحتاج مراجعة' : 'Review';
};

const padNumber = (index: number) => String(index + 1).padStart(3, '0');

const InlineInput: React.FC<{
    value: string | number;
    type?: 'text' | 'number';
    onChange: (val: string | number) => void;
    className?: string;
    placeholder?: string;
    dir?: 'rtl' | 'ltr';
}> = ({ value, type = 'text', onChange, className = '', placeholder, dir }) => {
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
                dir={dir}
                value={localValue}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setLocalValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className={`atelier-inline-input ${className}`}
            />
        );
    }

    return (
        <div
            dir={dir}
            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
            className={`atelier-inline-value ${className}`}
        >
            {value === '' && placeholder ? <span className="atelier-inline-placeholder">{placeholder}</span> : value}
        </div>
    );
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
        <div className="atelier-items">
            <div className="atelier-list-head">
                <span className="atelier-row-no">
                    {multiSelectMode ? (
                        <button
                            type="button"
                            onClick={onSelectAll}
                            aria-label={allSelected ? (lang === 'ar' ? 'إلغاء تحديد كل الأصناف' : 'Clear all item selections') : (lang === 'ar' ? 'تحديد كل الأصناف' : 'Select all items')}
                        >
                            {allSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                        </button>
                    ) : (lang === 'ar' ? 'رقم' : 'No.')}
                </span>
                <span>{lang === 'ar' ? 'الصنف' : 'Item'}</span>
                <span>{lang === 'ar' ? 'السعر' : 'Price'}</span>
                <span>{lang === 'ar' ? 'الهامش' : 'Margin'}</span>
                <span>{lang === 'ar' ? 'الحالة' : 'Status'}</span>
                <span>{lang === 'ar' ? 'إجراء' : 'Actions'}</span>
            </div>

            {items.map((item, index) => {
                const isSelected = selectedItemIds.has(item.id);
                const margin = getMarginPercent(item);
                const localizedName = lang === 'ar' ? (item.nameAr || '') : item.name;
                const secondaryName = lang === 'ar' ? item.name : (item.nameAr || '');
                const nameDirection = lang === 'ar' ? 'rtl' : 'ltr';

                return (
                    <article
                        key={item.id}
                        className={`atelier-row ${isSelected ? 'is-selected' : ''} ${!item.isAvailable ? 'is-off' : ''}`}
                        onClick={(e) => {
                            if (multiSelectMode) onToggleSelection(item.id, e.shiftKey);
                            else onEdit(item);
                        }}
                    >
                        <span className="atelier-row-no">
                            {multiSelectMode || isSelected ? (
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); onToggleSelection(item.id, e.shiftKey); }}
                                    aria-label={isSelected ? (lang === 'ar' ? `إلغاء تحديد ${labelFor(item)}` : `Deselect ${labelFor(item)}`) : (lang === 'ar' ? `تحديد ${labelFor(item)}` : `Select ${labelFor(item)}`)}
                                >
                                    {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                                </button>
                            ) : (
                                <span className="atelier-num">{padNumber(index)}</span>
                            )}
                        </span>

                        <div className="atelier-row-title">
                            <div className="atelier-row-art">
                                {item.image ? (
                                    <ItemImage src={item.image} name={labelFor(item)} />
                                ) : (
                                    <Package size={28} />
                                )}
                            </div>
                            <div className="atelier-row-copy">
                                <div className="atelier-row-name" dir={nameDirection}>
                                    <InlineInput
                                        value={localizedName}
                                        dir={nameDirection}
                                        onChange={(val) => onInlineUpdate(item._categoryId, lang === 'ar' ? { ...item, nameAr: val as string } : { ...item, name: val as string })}
                                        className="atelier-name-main"
                                        placeholder={lang === 'ar' ? 'اسم الصنف' : 'Item name'}
                                    />
                                </div>
                                <div className="atelier-row-sub" dir={nameDirection}>
                                    <InlineInput
                                        value={secondaryName}
                                        dir={nameDirection}
                                        onChange={(val) => onInlineUpdate(item._categoryId, lang === 'ar' ? { ...item, name: val as string } : { ...item, nameAr: val as string })}
                                        className="atelier-name-sub"
                                        placeholder={lang === 'ar' ? 'الاسم الثانوي' : 'Secondary name'}
                                    />
                                </div>
                                <p className="atelier-row-tags">
                                    <span>{lang === 'ar' ? (item._categoryNameAr || item._categoryName) : item._categoryName}</span>
                                    {item.sku && <em className="latin">{item.sku}</em>}
                                    {item.barcode && <em className="latin">{item.barcode}</em>}
                                    {(item.sizes?.length || 0) > 0 && <em>{item.sizes?.length} {lang === 'ar' ? 'أحجام' : 'sizes'}</em>}
                                    {(item.modifierGroups?.length || 0) > 0 && <em><Layers size={10} />{item.modifierGroups?.length} {lang === 'ar' ? 'إضافات' : 'mods'}</em>}
                                    {(item.tags || []).includes('best-seller') && <em className="is-hot">{lang === 'ar' ? 'الأكثر مبيعاً' : 'Best seller'}</em>}
                                </p>
                            </div>
                        </div>

                        <div className="atelier-row-price">
                            <span>{currency}</span>
                            <InlineInput
                                type="number"
                                value={item.price}
                                onChange={(val) => onInlineUpdate(item._categoryId, { ...item, price: val as number })}
                                className="atelier-price-input"
                            />
                        </div>

                        <div className="atelier-row-meta">
                            <b className={marginTone(margin)}>{margin === null ? '—' : `${margin.toFixed(0)}%`}</b>
                            <small>{marginLabel(margin, lang)}</small>
                            <small className="atelier-row-cost">
                                {lang === 'ar' ? 'التكلفة' : 'Cost'}:
                                <InlineInput
                                    type="number"
                                    value={item.cost || ''}
                                    onChange={(val) => onInlineUpdate(item._categoryId, { ...item, cost: val as number })}
                                    className="atelier-cost-input"
                                    placeholder="0"
                                />
                            </small>
                        </div>

                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onToggleAvailability(item); }}
                            className={`atelier-row-state ${item.isAvailable ? '' : 'is-off'}`}
                            aria-label={item.isAvailable ? (lang === 'ar' ? `إخفاء ${labelFor(item)}` : `Hide ${labelFor(item)}`) : (lang === 'ar' ? `إظهار ${labelFor(item)}` : `Show ${labelFor(item)}`)}
                        >
                            <i />
                            <span>{item.isAvailable ? (lang === 'ar' ? 'متاح' : 'Available') : (lang === 'ar' ? 'غير متاح' : 'Unavailable')}</span>
                        </button>

                        <div className="atelier-row-actions">
                            <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(item); }} aria-label={lang === 'ar' ? `تعديل ${labelFor(item)}` : `Edit ${labelFor(item)}`} title={lang === 'ar' ? 'تعديل' : 'Edit'}><Edit3 size={15} /></button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); onToggleAvailability(item); }} aria-label={item.isAvailable ? (lang === 'ar' ? `إخفاء ${labelFor(item)}` : `Hide ${labelFor(item)}`) : (lang === 'ar' ? `إظهار ${labelFor(item)}` : `Show ${labelFor(item)}`)} title={lang === 'ar' ? 'التوافر' : 'Availability'}>{item.isAvailable ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); onDuplicate(item); }} aria-label={lang === 'ar' ? `نسخ ${labelFor(item)}` : `Duplicate ${labelFor(item)}`} title={lang === 'ar' ? 'نسخ' : 'Duplicate'}><Copy size={15} /></button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); onArchive(item); }} aria-label={item.archivedAt ? (lang === 'ar' ? `استرجاع ${labelFor(item)}` : `Restore ${labelFor(item)}`) : (lang === 'ar' ? `أرشفة ${labelFor(item)}` : `Archive ${labelFor(item)}`)} title={item.archivedAt ? (lang === 'ar' ? 'استرجاع' : 'Restore') : (lang === 'ar' ? 'أرشفة' : 'Archive')}>{item.archivedAt ? <ArchiveRestore size={15} /> : <Archive size={15} />}</button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(item); }} aria-label={lang === 'ar' ? `حذف ${labelFor(item)}` : `Delete ${labelFor(item)}`} title={lang === 'ar' ? 'حذف' : 'Delete'}><Trash2 size={15} /></button>
                        </div>
                    </article>
                );
            })}
        </div>
    );
};

export default ItemTable;
