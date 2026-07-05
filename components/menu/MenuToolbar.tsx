
import React from 'react';
import {
    Search, Plus, LayoutGrid, List, BarChart3,
    ArrowUpDown, CheckSquare, Filter, Square,
    Download, Upload, Palette
} from 'lucide-react';
import { ViewMode, DensityMode, SortField, FilterTag } from './MenuProfitCenter';
import BranchSelector from './BranchSelector';
import { Branch, MenuCategory } from '../../types';

interface Props {
    categories: MenuCategory[];
    selectedCategoryId: string | 'all';
    onSelectCategory: (id: string | 'all') => void;
    searchQuery: string;
    onSearchChange: (q: string) => void;
    viewMode: ViewMode;
    onViewModeChange: (v: ViewMode) => void;
    density: DensityMode;
    onDensityChange: (d: DensityMode) => void;
    sortField: SortField;
    onSortChange: (s: SortField) => void;
    filterTag: FilterTag;
    onFilterChange: (f: FilterTag) => void;
    onNewItem: () => void;
    multiSelectMode: boolean;
    onToggleMultiSelect: () => void;
    itemCount: number;
    selectedCount: number;
    lang: string;
    branches: Branch[];
    selectedBranchId: string | 'all';
    onSelectBranch: (id: string | 'all') => void;
    comparisonMode: boolean;
    onToggleComparison: () => void;
    onExport?: () => void;
    onImport?: () => void;
    onDesignMenu?: () => void;
}

const MenuToolbar: React.FC<Props> = ({
    categories, selectedCategoryId, onSelectCategory,
    searchQuery, onSearchChange, viewMode, onViewModeChange,
    density, onDensityChange, sortField, onSortChange,
    filterTag, onFilterChange, onNewItem,
    multiSelectMode, onToggleMultiSelect,
    itemCount, selectedCount, lang,
    branches, selectedBranchId, onSelectBranch, comparisonMode, onToggleComparison,
    onExport, onImport, onDesignMenu
}) => {
    const [showFilters, setShowFilters] = React.useState(false);
    const [showSort, setShowSort] = React.useState(false);
    const [showCategories, setShowCategories] = React.useState(false);

    const filterOptions: { id: FilterTag; labelEn: string; labelAr: string }[] = [
        { id: 'all', labelEn: 'All Items', labelAr: 'الكل' },
        { id: 'active', labelEn: 'Active', labelAr: 'نشط' },
        { id: 'inactive', labelEn: 'Inactive', labelAr: 'غير نشط' },
        { id: 'low-margin', labelEn: 'Low Margin', labelAr: 'هامش منخفض' },
        { id: 'best-seller', labelEn: 'Best Sellers', labelAr: 'الأكثر مبيعاً' },
        { id: 'no-image', labelEn: 'Missing Image', labelAr: 'بدون صورة' },
        { id: 'archived', labelEn: 'Archived', labelAr: 'مؤرشف' },
    ];

    const sortOptions: { id: SortField; labelEn: string; labelAr: string }[] = [
        { id: 'name', labelEn: 'Name', labelAr: 'الاسم' },
        { id: 'price', labelEn: 'Price', labelAr: 'السعر' },
        { id: 'margin', labelEn: 'Margin', labelAr: 'الهامش' },
        { id: 'sales', labelEn: 'Sales Volume', labelAr: 'المبيعات' },
        { id: 'revenue', labelEn: 'Revenue', labelAr: 'الإيرادات' },
        { id: 'recent', labelEn: 'Recently Edited', labelAr: 'آخر تعديل' },
    ];

    const viewModes: { id: ViewMode; icon: React.ElementType; labelEn: string }[] = [
        { id: 'grid', icon: LayoutGrid, labelEn: 'Grid' },
        { id: 'list', icon: List, labelEn: 'List' },
        { id: 'analytics', icon: BarChart3, labelEn: 'Performance' },
    ];

    return (
        <div className="bg-white dark:bg-card border-b border-gray-200 dark:border-white/[0.05]">
            {/* Top Row */}
            <div className="flex items-center justify-between px-5 py-3 gap-4">

                {/* Left: Search */}
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-muted/50 w-4 h-4 pointer-events-none" />
                    <input
                        id="menu-search-input"
                        type="text"
                        placeholder={lang === 'ar' ? 'بحث بالاسم، SKU، باركود، او وسم...' : 'Search by name, SKU, barcode, or tag...'}
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="w-full h-9 pl-10 pr-3 bg-gray-50 dark:bg-elevated/50 border border-gray-200 dark:border-border/30 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-indigo-500/30 focus:border-blue-400 dark:focus:border-indigo-500/50 transition-all text-[13px] text-gray-800 dark:text-main placeholder:text-gray-400 dark:placeholder:text-muted/40"
                    />
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2">
                    {/* Category Filter Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => { setShowCategories(!showCategories); setShowFilters(false); setShowSort(false); }}
                            className={`h-8 flex items-center gap-1.5 px-3 rounded-lg border text-[12px] font-medium transition-colors ${selectedCategoryId !== 'all'
                                ? 'bg-blue-50 dark:bg-indigo-500/10 text-blue-600 dark:text-indigo-400 border-blue-200 dark:border-indigo-500/20'
                                : 'bg-white dark:bg-elevated border-gray-200 dark:border-border/30 text-gray-500 dark:text-muted hover:text-gray-700 dark:hover:text-main'
                                }`}
                        >
                            <LayoutGrid size={13} />
                            <span className="max-w-[100px] truncate">
                                {selectedCategoryId === 'all'
                                    ? (lang === 'ar' ? 'المجموعات' : 'Categories')
                                    : (lang === 'ar' ? categories.find(c => c.id === selectedCategoryId)?.nameAr || 'قسم' : categories.find(c => c.id === selectedCategoryId)?.name || 'Category')}
                            </span>
                        </button>
                        {showCategories && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowCategories(false)} />
                                <div className="absolute top-full mt-1 right-0 bg-white dark:bg-card border border-gray-200 dark:border-border/30 rounded-lg shadow-lg z-50 p-1 min-w-[160px] max-h-64 overflow-y-auto">
                                    <button
                                        onClick={() => { onSelectCategory('all'); setShowCategories(false); }}
                                        className={`w-full text-left px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${selectedCategoryId === 'all' ? 'bg-blue-50 dark:bg-indigo-500/10 text-blue-600 dark:text-indigo-400' : 'text-gray-500 dark:text-muted hover:bg-gray-50 dark:hover:bg-elevated/40'}`}
                                    >
                                        {lang === 'ar' ? 'الكل' : 'All'}
                                    </button>
                                    {categories.map(c => (
                                        <button
                                            key={c.id}
                                            onClick={() => { onSelectCategory(c.id); setShowCategories(false); }}
                                            className={`w-full text-left px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${selectedCategoryId === c.id ? 'bg-blue-50 dark:bg-indigo-500/10 text-blue-600 dark:text-indigo-400' : 'text-gray-500 dark:text-muted hover:bg-gray-50 dark:hover:bg-elevated/40'}`}
                                        >
                                            {lang === 'ar' ? (c.nameAr || c.name) : c.name}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Filter */}
                    <div className="relative">
                        <button
                            onClick={() => { setShowFilters(!showFilters); setShowCategories(false); setShowSort(false); }}
                            className={`h-8 flex items-center gap-1.5 px-3 rounded-lg border text-[12px] font-medium transition-colors ${filterTag !== 'all'
                                ? 'bg-blue-50 dark:bg-indigo-500/10 text-blue-600 dark:text-indigo-400 border-blue-200 dark:border-indigo-500/20'
                                : 'bg-white dark:bg-elevated border-gray-200 dark:border-border/30 text-gray-500 dark:text-muted hover:text-gray-700 dark:hover:text-main'
                                }`}
                        >
                            <Filter size={13} />
                            {lang === 'ar' ? 'تصفية' : 'Filter'}
                        </button>
                        {showFilters && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowFilters(false)} />
                                <div className="absolute top-full mt-1 right-0 bg-white dark:bg-card border border-gray-200 dark:border-border/30 rounded-lg shadow-lg z-50 p-1 min-w-[160px]">
                                    {filterOptions.map(f => (
                                        <button
                                            key={f.id}
                                            onClick={() => { onFilterChange(f.id); setShowFilters(false); }}
                                            className={`w-full text-left px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${filterTag === f.id ? 'bg-blue-50 dark:bg-indigo-500/10 text-blue-600 dark:text-indigo-400' : 'text-gray-500 dark:text-muted hover:bg-gray-50 dark:hover:bg-elevated/40'
                                                }`}
                                        >
                                            {lang === 'ar' ? f.labelAr : f.labelEn}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Sort */}
                    <div className="relative">
                        <button
                            onClick={() => { setShowSort(!showSort); setShowFilters(false); setShowCategories(false); }}
                            className="h-8 flex items-center gap-1.5 px-3 rounded-lg border border-gray-200 dark:border-border/30 bg-white dark:bg-elevated text-[12px] font-medium text-gray-500 dark:text-muted hover:text-gray-700 dark:hover:text-main transition-colors"
                        >
                            <ArrowUpDown size={13} />
                            {lang === 'ar' ? 'ترتيب' : 'Sort'}
                        </button>
                        {showSort && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowSort(false)} />
                                <div className="absolute top-full mt-1 right-0 bg-white dark:bg-card border border-gray-200 dark:border-border/30 rounded-lg shadow-lg z-50 p-1 min-w-[160px]">
                                    {sortOptions.map(s => (
                                        <button
                                            key={s.id}
                                            onClick={() => { onSortChange(s.id); setShowSort(false); }}
                                            className={`w-full text-left px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${sortField === s.id ? 'bg-blue-50 dark:bg-indigo-500/10 text-blue-600 dark:text-indigo-400' : 'text-gray-500 dark:text-muted hover:bg-gray-50 dark:hover:bg-elevated/40'
                                                }`}
                                        >
                                            {lang === 'ar' ? s.labelAr : s.labelEn}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* View Modes */}
                    <div className="flex bg-gray-100 dark:bg-elevated/50 rounded-lg border border-gray-200 dark:border-border/20 p-0.5">
                        {viewModes.map(v => (
                            <button
                                key={v.id}
                                onClick={() => onViewModeChange(v.id)}
                                className={`p-1.5 rounded-md transition-colors ${viewMode === v.id
                                    ? 'bg-white dark:bg-card text-gray-800 dark:text-main shadow-sm'
                                    : 'text-gray-400 dark:text-muted/60 hover:text-gray-600 dark:hover:text-main'
                                    }`}
                                title={v.labelEn}
                            >
                                <v.icon size={14} />
                            </button>
                        ))}
                    </div>

                    {/* Select Mode */}
                    <button
                        onClick={onToggleMultiSelect}
                        className={`h-8 flex items-center gap-1.5 px-3 rounded-lg border text-[12px] font-medium transition-colors ${multiSelectMode
                            ? 'bg-blue-50 dark:bg-indigo-500/10 text-blue-600 dark:text-indigo-400 border-blue-200 dark:border-indigo-500/20'
                            : 'bg-white dark:bg-elevated border-gray-200 dark:border-border/30 text-gray-500 dark:text-muted hover:text-gray-700'
                            }`}
                    >
                        {multiSelectMode ? <CheckSquare size={13} /> : <Square size={13} />}
                        {multiSelectMode ? `${selectedCount}` : (lang === 'ar' ? 'تحديد' : 'Select')}
                    </button>

                    {/* Branch Selector */}
                    {branches.length > 1 && (
                        <BranchSelector
                            branches={branches}
                            selectedBranchId={selectedBranchId}
                            onSelectBranch={onSelectBranch}
                            comparisonMode={comparisonMode}
                            onToggleComparison={onToggleComparison}
                            lang={lang}
                        />
                    )}

                    {/* Export */}
                    {onExport && (
                        <button onClick={onExport} className="h-8 flex items-center gap-1.5 px-3 rounded-lg border border-gray-200 dark:border-border/30 bg-white dark:bg-elevated text-[12px] font-medium text-gray-500 dark:text-muted hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-300 dark:hover:border-emerald-500/30 transition-colors" title={lang === 'ar' ? 'تصدير Excel' : 'Export Excel'}>
                            <Download size={13} />
                            {lang === 'ar' ? 'تصدير' : 'Export'}
                        </button>
                    )}

                    {/* Import */}
                    {onImport && (
                        <button onClick={onImport} className="h-8 flex items-center gap-1.5 px-3 rounded-lg border border-gray-200 dark:border-border/30 bg-white dark:bg-elevated text-[12px] font-medium text-gray-500 dark:text-muted hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-500/30 transition-colors" title={lang === 'ar' ? 'استيراد Excel' : 'Import Excel'}>
                            <Upload size={13} />
                            {lang === 'ar' ? 'استيراد' : 'Import'}
                        </button>
                    )}

                    {/* Menu Design */}
                    {onDesignMenu && (
                        <button onClick={onDesignMenu} className="h-8 flex items-center gap-1.5 px-3 rounded-lg border border-gray-200 dark:border-border/30 bg-white dark:bg-elevated text-[12px] font-medium text-gray-500 dark:text-muted hover:text-purple-600 dark:hover:text-purple-400 hover:border-purple-300 dark:hover:border-purple-500/30 transition-colors" title={lang === 'ar' ? 'تصميم المنيو' : 'Design Menu'}>
                            <Palette size={13} />
                            {lang === 'ar' ? 'تصميم' : 'Design'}
                        </button>
                    )}

                    {/* Add Item */}
                    <button
                        onClick={onNewItem}
                        className="h-8 flex items-center gap-1.5 bg-blue-600 dark:bg-indigo-500 hover:bg-blue-700 dark:hover:bg-indigo-600 text-white px-4 rounded-lg text-[12px] font-medium transition-colors"
                    >
                        <Plus size={14} />
                        {lang === 'ar' ? 'صنف جديد' : 'Add Item'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MenuToolbar;
