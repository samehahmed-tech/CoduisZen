
import React from 'react';
import {
    Eye, EyeOff, Edit3, Copy, Archive, ArchiveRestore, Trash2,
    Flame, AlertTriangle, TrendingDown, Pencil, Check,
    CheckSquare, Square, Package, Layers
} from 'lucide-react';
import { MenuItem } from '../../types';
import { ItemImage, NoPhoto } from '../../src/features/pos/components/ItemImage';
import { ViewMode, DensityMode } from './MenuProfitCenter';

export type CardItem = MenuItem & { _categoryId: string; _categoryName: string; _categoryNameAr?: string };

interface Props {
    item: CardItem;
    viewMode: ViewMode;
    density: DensityMode;
    isSelected: boolean;
    multiSelectMode: boolean;
    onClick: (item: CardItem, e: React.MouseEvent) => void;
    onToggleAvailability: (item: CardItem) => void;
    onDuplicate: (item: CardItem) => void;
    onArchive: (item: CardItem) => void;
    onDelete: (item: CardItem) => void;
    onEdit: (item: CardItem) => void;
    /** Inline quick price edit from the card (optimistic, rolls back on failure). */
    onQuickPrice?: (item: CardItem, price: number) => void;
    lang: string;
    currency: string;
    index: number;
    dragHandleProps?: any;
    draggableContext?: boolean;
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

const ItemCard: React.FC<Props> = ({
    item, viewMode, density, isSelected, multiSelectMode,
    onClick, onToggleAvailability, onDuplicate, onArchive, onDelete, onEdit, onQuickPrice,
    lang, currency, index, dragHandleProps, draggableContext
}) => {
    const [editingPrice, setEditingPrice] = React.useState(false);
    const [priceDraft, setPriceDraft] = React.useState('');
    const commitPrice = () => {
        const next = Number(priceDraft);
        setEditingPrice(false);
        if (!Number.isFinite(next) || next < 0 || next === item.price) return;
        onQuickPrice?.(item, Number(next.toFixed(2)));
    };
    const margin = getMarginPercent(item);
    const sizeCount = item.sizes?.length || 0;
    const modCount = item.modifierGroups?.length || 0;
    const itemName = lang === 'ar' ? (item.nameAr || item.name) : item.name;
    const availabilityLabel = item.isAvailable
        ? (lang === 'ar' ? `إخفاء ${itemName}` : `Hide ${itemName}`)
        : (lang === 'ar' ? `إظهار ${itemName}` : `Show ${itemName}`);

    // Smart badge (only 1 max)
    const badge = (() => {
        if (item.tags?.includes('best-seller') || (item.salesData?.last30 || 0) > 50)
            return { icon: Flame, label: lang === 'ar' ? 'الأكثر مبيعاً' : 'Best Seller', color: 'text-orange-600 dark:text-orange-500 bg-orange-50 dark:bg-orange-500/10' };
        if (margin !== null && margin < 30)
            return { icon: AlertTriangle, label: lang === 'ar' ? 'هامش منخفض' : 'Low Margin', color: 'text-red-600 dark:text-rose-500 bg-red-50 dark:bg-rose-500/10' };
        if ((item.salesData?.last30 || 0) === 0 && item.isAvailable)
            return { icon: TrendingDown, label: lang === 'ar' ? 'لا يُباع' : 'Not Selling', color: 'text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-500/10' };
        return null;
    })();

    // Dietary Badges Map
    const dietaryBadgesMap: Record<string, { labelEn: string; labelAr: string; color: string }> = {
        'vegan': { labelEn: 'Vegan', labelAr: 'نباتي صرف', color: 'bg-green-500 text-white' },
        'vegetarian': { labelEn: 'Vegetarian', labelAr: 'نباتي', color: 'bg-emerald-500 text-white' },
        'gluten-free': { labelEn: 'GF', labelAr: 'بدون جلوتين', color: 'bg-amber-500 text-white' },
        'spicy': { labelEn: 'Spicy', labelAr: 'حار', color: 'bg-red-500 text-white' },
        'keto': { labelEn: 'Keto', labelAr: 'كيتو', color: 'bg-blue-500 text-white' },
        'new': { labelEn: 'New', labelAr: 'جديد', color: 'bg-indigo-500 text-white' },
    };

    // === LIST VIEW ===
    if (viewMode === 'list') {
        return (
            <div
                onClick={(e) => onClick(item, e)}
                className={`group flex items-center gap-4 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-white/[0.02] border-b border-gray-100 dark:border-white/[0.04] transition-colors cursor-default ${isSelected ? 'bg-blue-50 dark:bg-indigo-500/5' : ''
                    } ${!item.isAvailable ? 'opacity-50' : ''}`}
            >
                {multiSelectMode && (
                    <div className="shrink-0 cursor-pointer text-gray-400 hover:text-blue-600 dark:hover:text-indigo-400">
                        {isSelected ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}
                    </div>
                )}

                {item.image ? (
                    <ItemImage src={item.image} name={itemName} small className="w-9 h-9 rounded-md border border-gray-200 dark:border-border/30 shrink-0" />
                ) : (
                    <div className="w-9 h-9 rounded-md border border-gray-200 dark:border-border/30 shrink-0 relative overflow-hidden np-thumb-sm">
                        <NoPhoto name={itemName} />
                    </div>
                )}

                {/* Name & Category */}
                <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-800 dark:text-main truncate">{lang === 'ar' ? (item.nameAr || item.name) : item.name}</p>
                    <p className="text-[11px] text-gray-400 dark:text-muted/60 truncate">{item._categoryName}</p>
                </div>

                {/* Price */}
                <div className="text-right shrink-0 w-20">
                    <p className="text-[13px] font-medium text-gray-800 dark:text-main">{currency} {item.price.toFixed(2)}</p>
                    {item.cost ? <p className="text-[10px] text-gray-400 dark:text-muted/50">Cost: {currency}{item.cost.toFixed(2)}</p> : null}
                </div>

                {/* Margin */}
                <div className="shrink-0 w-14 text-right">
                    {margin !== null ? (
                        <span className={`text-[12px] font-medium ${getMarginColor(margin)}`}>{margin.toFixed(0)}%</span>
                    ) : (
                        <span className="text-[11px] text-gray-300 dark:text-muted/30">—</span>
                    )}
                </div>

                {/* 30D Sales */}
                {item.salesData && (
                    <div className="shrink-0 w-14 text-right">
                        <p className="text-[12px] font-medium text-gray-700 dark:text-main">{item.salesData.last30}</p>
                        <p className="text-[9px] text-gray-400 dark:text-muted/50">30D</p>
                    </div>
                )}

                {/* Status */}
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleAvailability(item); }}
                    className={`p-1.5 rounded transition-colors shrink-0 ${item.isAvailable ? 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10' : 'text-red-500 hover:bg-red-50 dark:hover:bg-rose-500/10'}`}
                    aria-label={availabilityLabel}
                    title={availabilityLabel}
                >
                    {item.isAvailable ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>

                {/* Actions */}
                <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); onEdit(item); }} className="p-1.5 rounded text-gray-400 hover:text-blue-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-elevated/40 transition-colors" aria-label={lang === 'ar' ? `تعديل ${itemName}` : `Edit ${itemName}`} title={lang === 'ar' ? 'تعديل' : 'Edit'}><Edit3 size={13} /></button>
                    <button onClick={(e) => { e.stopPropagation(); onDuplicate(item); }} className="p-1.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-main hover:bg-gray-100 dark:hover:bg-elevated/40 transition-colors" aria-label={lang === 'ar' ? `نسخ ${itemName}` : `Duplicate ${itemName}`} title={lang === 'ar' ? 'نسخ' : 'Duplicate'}><Copy size={13} /></button>
                    <button onClick={(e) => { e.stopPropagation(); onArchive(item); }} className="p-1.5 rounded text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-gray-100 dark:hover:bg-elevated/40 transition-colors" aria-label={item.archivedAt ? (lang === 'ar' ? `استرجاع ${itemName}` : `Restore ${itemName}`) : (lang === 'ar' ? `أرشفة ${itemName}` : `Archive ${itemName}`)} title={item.archivedAt ? (lang === 'ar' ? 'استرجاع' : 'Restore') : (lang === 'ar' ? 'أرشفة' : 'Archive')}>{item.archivedAt ? <ArchiveRestore size={13} /> : <Archive size={13} />}</button>
                </div>
            </div>
        );
    }

    // === GRID VIEW (Atelier card) ===
    const isCompact = density === 'compact';
    const cardNumber = String(index + 1).padStart(3, '0');

    return (
        <article
            onClick={(e) => onClick(item, e)}
            {...(draggableContext ? dragHandleProps : {})}
            className={`atelier-card ${isSelected ? 'is-selected' : ''} ${!item.isAvailable ? 'is-off' : ''}`}
        >
            <span className="atelier-card-no">
                {multiSelectMode || isSelected ? (
                    <span className="atelier-card-select" aria-hidden="true">{isSelected ? <CheckSquare size={16} /> : <Square size={16} />}</span>
                ) : (
                    <span className="atelier-num">{cardNumber}</span>
                )}
            </span>

            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleAvailability(item); }}
                className={`atelier-card-state ${item.isAvailable ? '' : 'is-off'}`}
                aria-label={availabilityLabel}
                title={availabilityLabel}
            >
                <i />
                <span>{item.isAvailable ? (lang === 'ar' ? 'متاح' : 'Available') : (lang === 'ar' ? 'غير متاح' : 'Unavailable')}</span>
            </button>

            <div className="atelier-card-media">
                {item.image ? <ItemImage src={item.image} name={itemName} /> : <div className="atelier-card-art"><Package size={34} /></div>}

                {item.dietaryBadges && item.dietaryBadges.length > 0 && (
                    <div className="atelier-card-badges">
                        {item.dietaryBadges.slice(0, 3).map(b => {
                            const bdg = dietaryBadgesMap[b];
                            if (!bdg) return null;
                            return (
                                <span key={b} className={`atelier-dietary ${bdg.color}`}>
                                    {lang === 'ar' ? bdg.labelAr : bdg.labelEn}
                                </span>
                            );
                        })}
                    </div>
                )}

                {badge && (
                    <div className={`atelier-card-flag ${badge.color}`}>
                        <badge.icon size={9} /> {badge.label}
                    </div>
                )}
                {!item.image && <span className="atelier-card-nophoto">{lang === 'ar' ? 'بلا صورة' : 'No photo'}</span>}
            </div>

            <div className="atelier-card-body">
                <h3>{itemName}</h3>
                <p className="atelier-card-sub">
                    <span>{lang === 'ar' ? (item._categoryNameAr || item._categoryName) : item._categoryName}</span>
                    {item.sku && <em className="latin">{item.sku}</em>}
                </p>

                {(sizeCount > 0 || modCount > 0) && (
                    <div className="atelier-card-chips">
                        {sizeCount > 0 && (
                            <span><Package size={10} /> {sizeCount} {lang === 'ar' ? 'أحجام' : 'Sizes'}</span>
                        )}
                        {modCount > 0 && (
                            <span><Layers size={10} /> {modCount} {lang === 'ar' ? 'إضافات' : 'Mods'}</span>
                        )}
                    </div>
                )}

                <div className="atelier-card-bottom">
                    <div className="atelier-card-price">
                        {editingPrice ? (
                            <span className="atelier-card-price-edit" onClick={(e) => e.stopPropagation()}>
                                <input
                                    autoFocus
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    value={priceDraft}
                                    onChange={(e) => setPriceDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') commitPrice();
                                        if (e.key === 'Escape') setEditingPrice(false);
                                    }}
                                    onBlur={commitPrice}
                                    aria-label={lang === 'ar' ? 'تعديل السعر' : 'Edit price'}
                                />
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); commitPrice(); }}
                                    aria-label={lang === 'ar' ? 'حفظ السعر' : 'Save price'}
                                >
                                    <Check size={13} />
                                </button>
                            </span>
                        ) : (
                            <p>
                                {currency} {item.price.toFixed(2)}
                                {onQuickPrice && (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setPriceDraft(String(item.price)); setEditingPrice(true); }}
                                        aria-label={lang === 'ar' ? 'تعديل سريع للسعر' : 'Quick edit price'}
                                        title={lang === 'ar' ? 'تعديل سريع للسعر' : 'Quick edit price'}
                                    >
                                        <Pencil size={11} />
                                    </button>
                                )}
                            </p>
                        )}
                        {item.cost && item.cost > 0 ? (
                            <small>{lang === 'ar' ? 'التكلفة' : 'Cost'}: {currency}{item.cost.toFixed(2)}</small>
                        ) : null}
                    </div>
                    {margin !== null && (
                        <span className={`atelier-card-margin ${margin >= 50 ? 'is-good' : margin >= 30 ? 'is-warn' : 'is-low'}`}>
                            <b>{margin.toFixed(0)}%</b>
                            <small>{margin >= 50 ? (lang === 'ar' ? 'هامش ممتاز' : 'Excellent') : margin >= 30 ? (lang === 'ar' ? 'هامش جيد' : 'Good') : (lang === 'ar' ? 'يحتاج مراجعة' : 'Review')}</small>
                        </span>
                    )}
                </div>

                {item.salesData && ((item.salesData.today || 0) > 0 || (item.salesData.revenue30 || 0) > 0) && (
                    <div className="atelier-card-sales">
                        {(item.salesData.today || 0) > 0 && <span>{item.salesData.today} {lang === 'ar' ? 'اليوم' : 'today'}</span>}
                        {(item.salesData.revenue30 || 0) > 0 && <span>{currency}{(item.salesData.revenue30 || 0) > 999 ? `${((item.salesData.revenue30 || 0) / 1000).toFixed(1)}K` : item.salesData.revenue30} / 30D</span>}
                    </div>
                )}
            </div>

            <div className="atelier-card-actions">
                <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(item); }} aria-label={lang === 'ar' ? `تعديل ${itemName}` : `Edit ${itemName}`} title={lang === 'ar' ? 'تعديل' : 'Edit'}><Edit3 size={14} /></button>
                <button type="button" onClick={(e) => { e.stopPropagation(); onToggleAvailability(item); }} aria-label={availabilityLabel} title={lang === 'ar' ? 'التوافر' : 'Availability'}>{item.isAvailable ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                <button type="button" onClick={(e) => { e.stopPropagation(); onDuplicate(item); }} aria-label={lang === 'ar' ? `نسخ ${itemName}` : `Duplicate ${itemName}`} title={lang === 'ar' ? 'نسخ' : 'Duplicate'}><Copy size={14} /></button>
                <button type="button" onClick={(e) => { e.stopPropagation(); onArchive(item); }} aria-label={item.archivedAt ? (lang === 'ar' ? `استرجاع ${itemName}` : `Restore ${itemName}`) : (lang === 'ar' ? `أرشفة ${itemName}` : `Archive ${itemName}`)} title={item.archivedAt ? (lang === 'ar' ? 'استرجاع' : 'Restore') : (lang === 'ar' ? 'أرشفة' : 'Archive')}>{item.archivedAt ? <ArchiveRestore size={14} /> : <Archive size={14} />}</button>
                <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(item); }} aria-label={lang === 'ar' ? `حذف ${itemName}` : `Delete ${itemName}`} title={lang === 'ar' ? 'حذف' : 'Delete'}><Trash2 size={14} /></button>
            </div>
        </article>
    );
};

const areEqual = (prev: Props, next: Props) => {
    const a = prev.item as any;
    const b = next.item as any;
    return (
        prev.isSelected === next.isSelected &&
        prev.multiSelectMode === next.multiSelectMode &&
        prev.viewMode === next.viewMode &&
        prev.density === next.density &&
        prev.lang === next.lang &&
        prev.currency === next.currency &&
        prev.draggableContext === next.draggableContext &&
        prev.onClick === next.onClick &&
        prev.onToggleAvailability === next.onToggleAvailability &&
        prev.onDuplicate === next.onDuplicate &&
        prev.onArchive === next.onArchive &&
        prev.onDelete === next.onDelete &&
        prev.onEdit === next.onEdit &&
        a.id === b.id &&
        a.name === b.name &&
        a.nameAr === b.nameAr &&
        a.price === b.price &&
        a.cost === b.cost &&
        a.image === b.image &&
        a.isAvailable === b.isAvailable &&
        a.archivedAt === b.archivedAt &&
        a.sortOrder === b.sortOrder &&
        a.status === b.status &&
        a._categoryId === b._categoryId &&
        a._categoryName === b._categoryName &&
        a._categoryNameAr === b._categoryNameAr &&
        (a.tags || []).join('|') === (b.tags || []).join('|') &&
        (a.sizes?.length || 0) === (b.sizes?.length || 0) &&
        (a.modifierGroups?.length || 0) === (b.modifierGroups?.length || 0) &&
        (a.dietaryBadges || []).join('|') === (b.dietaryBadges || []).join('|') &&
        (a.salesData?.last30 || 0) === (b.salesData?.last30 || 0) &&
        (a.salesData?.today || 0) === (b.salesData?.today || 0) &&
        (a.salesData?.revenue30 || 0) === (b.salesData?.revenue30 || 0)
    );
};

export default React.memo(ItemCard, areEqual);
