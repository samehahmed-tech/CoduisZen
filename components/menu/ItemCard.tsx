
import React from 'react';
import {
    Eye, EyeOff, Edit3, Copy, Archive, ArchiveRestore, Trash2,
    Flame, AlertTriangle, TrendingDown,
    CheckSquare, Square, Package, Layers
} from 'lucide-react';
import { MenuItem } from '../../types';
import { ItemImage } from '../../src/features/pos/components/ItemImage';
import { ViewMode, DensityMode } from './MenuProfitCenter';

interface Props {
    item: MenuItem & { _categoryId: string; _categoryName: string; _categoryNameAr?: string };
    viewMode: ViewMode;
    density: DensityMode;
    isSelected: boolean;
    multiSelectMode: boolean;
    onClick: (e: React.MouseEvent) => void;
    onToggleAvailability: () => void;
    onDuplicate: () => void;
    onArchive: () => void;
    onDelete: () => void;
    onEdit: () => void;
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
    onClick, onToggleAvailability, onDuplicate, onArchive, onDelete, onEdit,
    lang, currency, index, dragHandleProps, draggableContext
}) => {
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
                onClick={onClick}
                className={`group flex items-center gap-4 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-white/[0.02] border-b border-gray-100 dark:border-white/[0.04] transition-colors cursor-default ${isSelected ? 'bg-blue-50 dark:bg-indigo-500/5' : ''
                    } ${!item.isAvailable ? 'opacity-50' : ''}`}
            >
                {multiSelectMode && (
                    <div className="shrink-0 cursor-pointer text-gray-400 hover:text-blue-600 dark:hover:text-indigo-400">
                        {isSelected ? <CheckSquare size={16} className="text-blue-600 dark:text-indigo-500" /> : <Square size={16} />}
                    </div>
                )}

                <ItemImage src={item.image} name={itemName} small className="w-9 h-9 rounded-md border border-gray-200 dark:border-border/30 shrink-0" />

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
                    onClick={(e) => { e.stopPropagation(); onToggleAvailability(); }}
                    className={`p-1.5 rounded transition-colors shrink-0 ${item.isAvailable ? 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10' : 'text-red-500 hover:bg-red-50 dark:hover:bg-rose-500/10'}`}
                    aria-label={availabilityLabel}
                    title={availabilityLabel}
                >
                    {item.isAvailable ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>

                {/* Actions */}
                <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-1.5 rounded text-gray-400 hover:text-blue-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-elevated/40 transition-colors" aria-label={lang === 'ar' ? `تعديل ${itemName}` : `Edit ${itemName}`} title={lang === 'ar' ? 'تعديل' : 'Edit'}><Edit3 size={13} /></button>
                    <button onClick={(e) => { e.stopPropagation(); onDuplicate(); }} className="p-1.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-main hover:bg-gray-100 dark:hover:bg-elevated/40 transition-colors" aria-label={lang === 'ar' ? `نسخ ${itemName}` : `Duplicate ${itemName}`} title={lang === 'ar' ? 'نسخ' : 'Duplicate'}><Copy size={13} /></button>
                    <button onClick={(e) => { e.stopPropagation(); onArchive(); }} className="p-1.5 rounded text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-gray-100 dark:hover:bg-elevated/40 transition-colors" aria-label={item.archivedAt ? (lang === 'ar' ? `استرجاع ${itemName}` : `Restore ${itemName}`) : (lang === 'ar' ? `أرشفة ${itemName}` : `Archive ${itemName}`)} title={item.archivedAt ? (lang === 'ar' ? 'استرجاع' : 'Restore') : (lang === 'ar' ? 'أرشفة' : 'Archive')}>{item.archivedAt ? <ArchiveRestore size={13} /> : <Archive size={13} />}</button>
                </div>
            </div>
        );
    }

    // === GRID VIEW (Clean White Card) ===
    const isCompact = density === 'compact';

    return (
        <div
            onClick={onClick}
            {...(draggableContext ? dragHandleProps : {})}
            className={`group relative bg-white dark:bg-card rounded-lg border shadow-sm transition-all duration-150 flex flex-col cursor-default overflow-hidden ${isSelected
                ? 'border-blue-400 dark:border-indigo-500/50 ring-1 ring-blue-200 dark:ring-indigo-500/20'
                : 'border-gray-200 dark:border-white/[0.06] hover:border-gray-300 dark:hover:border-border/40 hover:shadow-md'
                } ${!item.isAvailable ? 'opacity-60' : ''}`}
        >
            {multiSelectMode && (
                <div className="absolute top-2 left-2 z-20 cursor-pointer">
                    {isSelected ? <CheckSquare size={16} className="text-blue-600 dark:text-indigo-500" /> : <Square size={16} className="text-gray-400" />}
                </div>
            )}

            {/* TOP: Image + Status */}
            <div className={`relative ${isCompact ? 'h-20' : 'h-28'} bg-gray-100 dark:bg-elevated/20 border-b border-gray-100 dark:border-white/[0.04] shrink-0 overflow-hidden`}>
                <ItemImage src={item.image} name={itemName} />

                {/* Dietary Badges overlay */}
                {item.dietaryBadges && item.dietaryBadges.length > 0 && (
                    <div className="absolute top-2 right-2 flex flex-col gap-1 z-10">
                        {item.dietaryBadges.slice(0, 3).map(b => {
                            const bdg = dietaryBadgesMap[b];
                            if (!bdg) return null;
                            return (
                                <span key={b} className={`px-1.5 py-0.5 rounded text-[9px] font-bold shadow-sm ${bdg.color}`}>
                                    {lang === 'ar' ? bdg.labelAr : bdg.labelEn}
                                </span>
                            );
                        })}
                    </div>
                )}

                {/* Category label */}
                <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-white/80 dark:bg-black/50 text-[9px] font-medium text-gray-600 dark:text-white/80 ">
                    {lang === 'ar' ? (item._categoryNameAr || item._categoryName) : item._categoryName}
                </div>

                {/* Status dot */}
                <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${item.isAvailable ? 'bg-emerald-500' : 'bg-red-400'}`} />

                {/* Badge */}
                {badge && (
                    <div className={`absolute bottom-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium ${badge.color}`}>
                        <badge.icon size={9} /> {isCompact ? '' : badge.label}
                    </div>
                )}
            </div>

            {/* MIDDLE: Name + Price + Cost + Margin */}
            <div className={`flex flex-col h-full ${isCompact ? 'px-3 pt-2.5 pb-2' : 'px-3.5 pt-3 pb-2'}`}>
                <h3 className={`font-medium text-gray-800 dark:text-main leading-snug line-clamp-2 mb-1.5 ${isCompact ? 'text-[12px]' : 'text-[13px]'}`}>
                    {lang === 'ar' ? (item.nameAr || item.name) : item.name}
                </h3>

                {(sizeCount > 0 || modCount > 0) && (
                    <div className="flex flex-wrap gap-1.5 mb-2.5">
                        {sizeCount > 0 && (
                            <span className="flex items-center gap-1 bg-blue-50/50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded text-[10px] font-medium border border-blue-100 dark:border-blue-500/20">
                                <Package size={10} /> {sizeCount} {lang === 'ar' ? 'أحجام' : 'Sizes'}
                            </span>
                        )}
                        {modCount > 0 && (
                            <span className="flex items-center gap-1 bg-purple-50/50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded text-[10px] font-medium border border-purple-100 dark:border-purple-500/20">
                                <Layers size={10} /> {modCount} {lang === 'ar' ? 'إضافات' : 'Mods'}
                            </span>
                        )}
                    </div>
                )}

                <div className="flex items-end justify-between mt-auto">
                    <div>
                        <p className={`font-semibold text-gray-900 dark:text-main ${isCompact ? 'text-[14px]' : 'text-[15px]'}`}>
                            {currency} {item.price.toFixed(2)}
                        </p>
                        {item.cost && item.cost > 0 ? (
                            <p className="text-[10px] text-gray-400 dark:text-muted/50 mt-0.5">Cost: {currency}{item.cost.toFixed(2)}</p>
                        ) : null}
                    </div>
                    {margin !== null && (
                        <span className={`text-[12px] font-semibold ${getMarginColor(margin)}`}>{margin.toFixed(0)}%</span>
                    )}
                </div>
            </div>

            {/* BOTTOM: Sales + Sizes + Modifiers + Toggle */}
            <div className={`mt-auto border-t border-gray-100 dark:border-white/[0.04] ${isCompact ? 'px-3 py-2' : 'px-3.5 py-2.5'}`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-[10px] text-gray-400 dark:text-muted/60">
                        {item.salesData && item.salesData.today > 0 && (
                            <span title="Today">{item.salesData.today} today</span>
                        )}
                        {item.salesData && (item.salesData.revenue30 || 0) > 0 && (
                            <span className="text-emerald-600 dark:text-emerald-500 font-medium" title="30D Revenue">
                                {currency}{(item.salesData.revenue30 || 0) > 999 ? `${((item.salesData.revenue30 || 0) / 1000).toFixed(1)}K` : item.salesData.revenue30}
                            </span>
                        )}
                    </div>

                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleAvailability(); }}
                        className={`p-1 rounded transition-colors ${item.isAvailable ? 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10' : 'text-red-500 hover:bg-red-50 dark:hover:bg-rose-500/10'}`}
                        aria-label={availabilityLabel}
                        title={availabilityLabel}
                    >
                        {item.isAvailable ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                </div>
            </div>

            {/* Hover Actions */}
            <div className="absolute inset-0 bg-white/95 dark:bg-card/95 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-center items-center gap-2 p-4 z-10 rounded-lg">
                <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="w-full h-8 bg-blue-600 dark:bg-indigo-500 hover:bg-blue-700 dark:hover:bg-indigo-600 text-white rounded-md text-[12px] font-medium transition-colors flex items-center justify-center gap-1.5">
                    <Edit3 size={13} /> {lang === 'ar' ? 'تعديل' : 'Edit'}
                </button>
                <div className="flex w-full gap-1.5">
                    <button onClick={(e) => { e.stopPropagation(); onToggleAvailability(); }} className="flex-1 h-8 bg-gray-100 dark:bg-elevated border border-gray-200 dark:border-border/30 text-gray-600 dark:text-muted hover:text-gray-800 dark:hover:text-main rounded-md flex justify-center items-center transition-colors" aria-label={availabilityLabel} title={availabilityLabel}>
                        {item.isAvailable ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onDuplicate(); }} className="flex-1 h-8 bg-gray-100 dark:bg-elevated border border-gray-200 dark:border-border/30 text-gray-600 dark:text-muted hover:text-gray-800 dark:hover:text-main rounded-md flex justify-center items-center transition-colors" aria-label={lang === 'ar' ? `نسخ ${itemName}` : `Duplicate ${itemName}`} title={lang === 'ar' ? 'نسخ' : 'Duplicate'}>
                        <Copy size={13} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onArchive(); }} className="flex-1 h-8 bg-gray-100 dark:bg-elevated border border-gray-200 dark:border-border/30 text-gray-600 dark:text-muted hover:text-amber-600 dark:hover:text-amber-500 rounded-md flex justify-center items-center transition-colors" aria-label={item.archivedAt ? (lang === 'ar' ? `استرجاع ${itemName}` : `Restore ${itemName}`) : (lang === 'ar' ? `أرشفة ${itemName}` : `Archive ${itemName}`)} title={item.archivedAt ? (lang === 'ar' ? 'استرجاع' : 'Restore') : (lang === 'ar' ? 'أرشفة' : 'Archive')}>
                        {item.archivedAt ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="flex-1 h-8 bg-gray-100 dark:bg-elevated border border-gray-200 dark:border-border/30 text-gray-600 dark:text-muted hover:text-red-500 rounded-md flex justify-center items-center transition-colors" aria-label={lang === 'ar' ? `حذف ${itemName}` : `Delete ${itemName}`} title={lang === 'ar' ? 'حذف' : 'Delete'}>
                        <Trash2 size={13} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ItemCard;
