import React, { useEffect, useRef, useState } from 'react';
import {
    Search, X, SlidersHorizontal, LayoutGrid, Grid2x2, List, Grid3x3,
    ShoppingBag, Star, CheckCircle, RotateCcw, ArrowUpDown,
} from 'lucide-react';
import CategoryTabs from './CategoryTabs';
import ItemGrid from './ItemGrid';
import type { MenuCategory, OrderItem } from '@/types';

interface POSItemsPanelProps {
    categories: MenuCategory[];
    activeCategory: string;
    onSetCategory: (id: string) => void;
    categoryResultCounts: Record<string, number>;
    totalMatchedCount: number;
    hasActiveFiltering: boolean;
    pricedItems: any[];
    cartItems: OrderItem[];
    onAddItem: (item: any) => void;
    onRemoveItem: (item: any) => void;
    highlightedItemId: string | null;
    searchQuery: string;
    onSearchChange: (q: string) => void;
    searchInputRef: React.RefObject<HTMLInputElement>;
    itemFilter: 'all' | 'available' | 'popular';
    onSetFilter: (f: 'all' | 'available' | 'popular') => void;
    itemSort: 'smart' | 'name' | 'price_asc' | 'price_desc';
    onSetSort: (s: 'smart' | 'name' | 'price_asc' | 'price_desc') => void;
    itemDensity: 'comfortable' | 'compact' | 'ultra' | 'buttons';
    onSetDensity: (d: 'comfortable' | 'compact' | 'ultra' | 'buttons') => void;
    showMobileFilters: boolean;
    onToggleFilters: () => void;
    onResetFilters: () => void;
    quickPickItems: any[];
    upsellSuggestions: any[];
    showCategoryStrip: boolean;
    onToggleCategoryStrip: () => void;
    isTabletViewport: boolean;
    quickCategoryNav: any[];
    isTouchMode: boolean;
    lang: string;
    t: any;
    currencySymbol: string;
    isCartVisible: boolean;
    cartStats: { lines: number; qty: number };
    cartTotal: number;
    currentOrderPreview: { id: string; name: string; quantity: number }[];
    isCartOpenMobile: boolean;
    onOpenCart: () => void;
    selectedTableId: string | null;
    hasCartItems: boolean;
}

/* ─── Tools Dropdown ─── */
const ToolsDropdown: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    itemSort: string;
    onSetSort: (s: any) => void;
    itemDensity: string;
    onSetDensity: (d: any) => void;
    onReset: () => void;
    lang: string;
}> = ({ isOpen, onClose, itemSort, onSetSort, itemDensity, onSetDensity, onReset, lang }) => {
    const ref = useRef<HTMLDivElement>(null);
    const isAr = lang === 'ar';

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const densities = [
        { id: 'comfortable', icon: LayoutGrid, label: isAr ? 'بطاقات' : 'Cards' },
        { id: 'compact', icon: Grid2x2, label: isAr ? 'مضغوط' : 'Compact' },
        { id: 'ultra', icon: List, label: isAr ? 'قائمة' : 'List' },
        { id: 'buttons', icon: Grid3x3, label: isAr ? 'سريع' : 'Fast' },
    ];

    const sorts = [
        { id: 'smart', label: isAr ? 'ذكي' : 'Smart' },
        { id: 'name', label: isAr ? 'أبجدي' : 'A→Z' },
        { id: 'price_asc', label: isAr ? 'الأرخص' : 'Price ↑' },
        { id: 'price_desc', label: isAr ? 'الأغلى' : 'Price ↓' },
    ];

    return (
        <div ref={ref} className={`absolute top-full mt-2 w-72 bg-card/95 backdrop-blur-xl border border-border/10 rounded-2xl p-4 shadow-2xl z-50 pos-scale-in ${isAr ? 'left-0' : 'right-0'}`}>
            <div className="space-y-4">
                {/* Density */}
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted/60 mb-2.5">{isAr ? 'طريقة العرض' : 'View Density'}</p>
                    <div className="grid grid-cols-4 gap-2">
                        {densities.map(v => (
                            <button
                                key={v.id}
                                onClick={() => { onSetDensity(v.id); onClose(); }}
                                className={`flex flex-col items-center justify-center h-14 rounded-xl text-[10px] font-bold transition-all active:scale-95 border ${itemDensity === v.id
                                    ? 'bg-primary/10 border-primary/20 text-primary shadow-sm'
                                    : 'border-transparent text-muted hover:text-main hover:bg-elevated hover:border-border/10'
                                }`}
                            >
                                <v.icon size={16} className="mb-1" />
                                <span>{v.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="h-px bg-border/10 w-full" />

                {/* Sort */}
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted/60 mb-2.5">{isAr ? 'الترتيب' : 'Sort Order'}</p>
                    <div className="grid grid-cols-2 gap-2">
                        {sorts.map(s => (
                            <button
                                key={s.id}
                                onClick={() => { onSetSort(s.id); onClose(); }}
                                className={`h-10 rounded-xl text-[11px] font-bold transition-all active:scale-95 border ${itemSort === s.id
                                    ? 'bg-primary/10 border-primary/20 text-primary'
                                    : 'border-transparent text-muted hover:text-main hover:bg-elevated hover:border-border/10'
                                }`}
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Reset */}
                <button
                    onClick={() => { onReset(); onClose(); }}
                    className="w-full h-10 mt-2 flex items-center justify-center gap-2 rounded-xl text-[11px] font-bold text-rose-500 bg-rose-500/5 hover:bg-rose-500/10 transition-colors active:scale-95 border border-rose-500/10"
                >
                    <RotateCcw size={14} />
                    {isAr ? 'إعادة ضبط' : 'Reset Defaults'}
                </button>
            </div>
        </div>
    );
};

/* ─── Main Panel ─── */
const POSItemsPanel: React.FC<POSItemsPanelProps> = ({
    categories, activeCategory, onSetCategory, categoryResultCounts, totalMatchedCount, hasActiveFiltering,
    pricedItems, cartItems, onAddItem, onRemoveItem, highlightedItemId,
    searchQuery, onSearchChange, searchInputRef, itemFilter, onSetFilter,
    itemSort, onSetSort, itemDensity, onSetDensity, showMobileFilters, onToggleFilters, onResetFilters,
    quickPickItems, quickCategoryNav, isTouchMode, lang, t, currencySymbol,
    isCartVisible, cartStats, cartTotal, isCartOpenMobile, onOpenCart, hasCartItems,
}) => {
    const isAr = lang === 'ar';
    const [toolsOpen, setToolsOpen] = useState(false);
    const quickCategories = quickCategoryNav;

    return (
        <div className="flex flex-1 h-full min-h-0 min-w-0 flex-col overflow-hidden bg-app">
            {/* Toolbar */}
            <div className="pos-items-toolbar relative z-20 shrink-0 border-b border-border/5 bg-card/60 backdrop-blur-md px-4 py-3 shadow-[0_4px_30px_rgba(0,0,0,0.02)]">
                <div className="flex items-center gap-3">
                    {/* Search */}
                    <div className="relative min-w-0 flex-1 group">
                        <Search className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted/40 group-focus-within:text-primary transition-colors ${isAr ? 'right-3' : 'left-3'}`} size={16} />
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            placeholder={t.search_placeholder}
                            className={`h-11 w-full rounded-2xl border border-border/10 bg-elevated/40 text-[13px] font-bold text-main outline-none placeholder:text-muted/30 focus:border-primary/30 focus:bg-card focus:shadow-md focus:shadow-primary/5 transition-all duration-300 ${isAr ? 'pr-10 pl-10' : 'pl-10 pr-10'}`}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => onSearchChange('')}
                                className={`absolute top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-muted hover:text-rose-500 hover:bg-rose-500/10 transition-all ${isAr ? 'left-2' : 'right-2'}`}
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Filter pills */}
                    <div className="flex items-center gap-1.5 shrink-0 bg-elevated/30 p-1 rounded-2xl border border-border/5">
                        <button
                            onClick={() => onSetFilter(itemFilter === 'popular' ? 'all' : 'popular')}
                            className={`h-9 px-3 rounded-xl flex items-center gap-1.5 text-[11px] font-bold transition-all active:scale-95 ${itemFilter === 'popular'
                                ? 'bg-amber-500 text-white shadow-sm'
                                : 'text-muted/70 hover:text-amber-500 hover:bg-amber-500/10'
                            }`}
                        >
                            <Star size={14} className={itemFilter === 'popular' ? 'fill-current' : ''} />
                            <span className="hidden sm:inline">{isAr ? 'مميز' : 'Top'}</span>
                        </button>
                        <button
                            onClick={() => onSetFilter(itemFilter === 'available' ? 'all' : 'available')}
                            className={`h-9 px-3 rounded-xl flex items-center gap-1.5 text-[11px] font-bold transition-all active:scale-95 ${itemFilter === 'available'
                                ? 'bg-emerald-500 text-white shadow-sm'
                                : 'text-muted/70 hover:text-emerald-500 hover:bg-emerald-500/10'
                            }`}
                        >
                            <CheckCircle size={14} />
                            <span className="hidden sm:inline">{isAr ? 'متاح' : 'In Stock'}</span>
                        </button>
                    </div>

                    {/* Tools */}
                    <div className="relative shrink-0">
                        <button
                            onClick={() => setToolsOpen(p => !p)}
                            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all active:scale-95 border ${toolsOpen
                                ? 'bg-primary text-white shadow-md border-transparent'
                                : 'bg-elevated/30 text-muted/70 border-border/5 hover:text-main hover:border-border/10 hover:bg-elevated'
                            }`}
                        >
                            <SlidersHorizontal size={18} />
                        </button>
                        <ToolsDropdown
                            isOpen={toolsOpen}
                            onClose={() => setToolsOpen(false)}
                            itemSort={itemSort}
                            onSetSort={onSetSort}
                            itemDensity={itemDensity}
                            onSetDensity={onSetDensity}
                            onReset={onResetFilters}
                            lang={lang}
                        />
                    </div>

                    {/* Items count */}
                    <div className="hidden lg:flex items-center h-11 px-4 rounded-2xl bg-primary/5 shrink-0 border border-primary/10">
                        <span className="text-[12px] font-black text-primary tabular-nums tracking-wide">{totalMatchedCount}</span>
                    </div>

                    {/* Mobile cart FAB */}
                    {isCartVisible && !isCartOpenMobile && hasCartItems && (
                        <button onClick={onOpenCart} className="md:hidden flex h-11 items-center gap-2 rounded-2xl bg-primary px-4 text-white shadow-md active:scale-95 transition-all shrink-0">
                            <ShoppingBag size={18} />
                            <span className="text-[12px] font-black tabular-nums bg-white/20 px-1.5 rounded-md">{cartStats.qty}</span>
                        </button>
                    )}
                </div>

                {/* Category strip — desktop */}
                <div className="hidden md:flex gap-2 overflow-x-auto no-scrollbar mt-3 pb-1">
                    {quickCategories.map((cat) => {
                        const count = categoryResultCounts[cat.id] || 0;
                        const active = activeCategory === cat.id;
                        return (
                            <button
                                key={cat.id}
                                onClick={() => onSetCategory(cat.id)}
                                disabled={count === 0}
                                className={`shrink-0 h-9 px-4 rounded-xl text-[11px] font-bold transition-all active:scale-95 border ${active
                                    ? 'bg-primary text-white shadow-sm border-transparent'
                                    : count === 0
                                        ? 'text-muted/20 border-transparent bg-transparent cursor-default'
                                        : 'text-muted border-border/10 hover:text-main hover:bg-elevated hover:border-border/20 bg-card/50'
                                }`}
                            >
                                {isAr ? (cat.nameAr || cat.name) : cat.name}
                                {count > 0 && <span className={`ml-1.5 text-[10px] tabular-nums font-black ${active ? 'opacity-70 bg-white/20 px-1 rounded' : 'opacity-40'}`}>{count}</span>}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Mobile categories */}
            <div className="shrink-0 border-b border-border/6 px-2 py-2 md:hidden bg-card/30 backdrop-blur-sm">
                <CategoryTabs
                    categories={categories}
                    activeCategory={activeCategory}
                    onSetCategory={onSetCategory}
                    isTouchMode={isTouchMode}
                    lang={lang as any}
                    counts={categoryResultCounts}
                    totalCount={totalMatchedCount}
                    hasActiveFiltering={hasActiveFiltering}
                />
            </div>

            {/* Item Grid */}
            <div className="flex-1 min-h-0 overflow-hidden bg-transparent">
                <ItemGrid
                    items={pricedItems}
                    onAddItem={onAddItem}
                    onRemoveItem={onRemoveItem}
                    cartItems={cartItems}
                    currencySymbol={currencySymbol}
                    isTouchMode={isTouchMode}
                    density={itemDensity}
                    lang={lang as any}
                    highlightedItemId={highlightedItemId}
                />
            </div>
        </div>
    );
};

export default React.memo(POSItemsPanel);
