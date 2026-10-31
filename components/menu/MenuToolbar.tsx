import React from 'react';
import {
    Search, Plus, LayoutGrid, List, BarChart3, Rows3,
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

    const quickFilters: { id: FilterTag; labelAr: string; labelEn: string }[] = [
        { id: 'all', labelAr: 'الكل', labelEn: 'All' },
        { id: 'active', labelAr: 'متاح', labelEn: 'Available' },
        { id: 'low-margin', labelAr: 'هامش منخفض', labelEn: 'Low margin' },
        { id: 'no-image', labelAr: 'بدون صورة', labelEn: 'No photo' },
    ];

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

    const selectedCategory = categories.find(c => c.id === selectedCategoryId);
    const isCompact = viewMode === 'grid' && density === 'compact';
    const isCards = viewMode === 'grid' && density !== 'compact';

    return (
        <div className="atelier-tools">
            <label className="atelier-search">
                <Search size={18} aria-hidden="true" />
                <input
                    id="menu-search-input"
                    type="search"
                    placeholder={lang === 'ar' ? 'ابحث في الفهرس — اسم، SKU، باركود...' : 'Search the catalog — name, SKU, barcode...'}
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    aria-label={lang === 'ar' ? 'بحث في الأصناف' : 'Search items'}
                />
            </label>

            <div className="atelier-toolset no-scrollbar">
                {quickFilters.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        className={`atelier-tool ${filterTag === item.id ? 'is-active' : ''}`}
                        onClick={() => onFilterChange(item.id)}
                        aria-pressed={filterTag === item.id}
                    >
                        {lang === 'ar' ? item.labelAr : item.labelEn}
                    </button>
                ))}

                <div className="relative">
                    <button
                        type="button"
                        className={`atelier-tool ${selectedCategoryId !== 'all' ? 'is-active' : ''}`}
                        onClick={() => { setShowCategories(!showCategories); setShowFilters(false); setShowSort(false); }}
                    >
                        <LayoutGrid size={14} />
                        <span>{selectedCategoryId === 'all' ? (lang === 'ar' ? 'الأقسام' : 'Sections') : (lang === 'ar' ? (selectedCategory?.nameAr || 'قسم') : (selectedCategory?.name || 'Section'))}</span>
                    </button>
                    {showCategories && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowCategories(false)} />
                            <div className="atelier-menu-pop">
                                <button type="button" onClick={() => { onSelectCategory('all'); setShowCategories(false); }} className={selectedCategoryId === 'all' ? 'is-active' : ''}>{lang === 'ar' ? 'كل الأصناف' : 'All items'}</button>
                                {categories.map(c => (
                                    <button key={c.id} type="button" onClick={() => { onSelectCategory(c.id); setShowCategories(false); }} className={selectedCategoryId === c.id ? 'is-active' : ''}>
                                        {lang === 'ar' ? (c.nameAr || c.name) : c.name}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <div className="relative">
                    <button
                        type="button"
                        className={`atelier-tool ${filterTag !== 'all' ? 'is-active' : ''}`}
                        onClick={() => { setShowFilters(!showFilters); setShowCategories(false); setShowSort(false); }}
                    >
                        <Filter size={14} />
                        <span>{lang === 'ar' ? 'فلاتر' : 'Filters'}</span>
                    </button>
                    {showFilters && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowFilters(false)} />
                            <div className="atelier-menu-pop">
                                {filterOptions.map(f => (
                                    <button key={f.id} type="button" onClick={() => { onFilterChange(f.id); setShowFilters(false); }} className={filterTag === f.id ? 'is-active' : ''}>
                                        {lang === 'ar' ? f.labelAr : f.labelEn}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <div className="relative">
                    <button
                        type="button"
                        className="atelier-tool"
                        onClick={() => { setShowSort(!showSort); setShowFilters(false); setShowCategories(false); }}
                    >
                        <ArrowUpDown size={14} />
                        <span>{lang === 'ar' ? (sortOptions.find(s => s.id === sortField)?.labelAr || 'ترتيب') : (sortOptions.find(s => s.id === sortField)?.labelEn || 'Sort')}</span>
                    </button>
                    {showSort && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowSort(false)} />
                            <div className="atelier-menu-pop">
                                {sortOptions.map(s => (
                                    <button key={s.id} type="button" onClick={() => { onSortChange(s.id); setShowSort(false); }} className={sortField === s.id ? 'is-active' : ''}>
                                        {lang === 'ar' ? s.labelAr : s.labelEn}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

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

                <button
                    type="button"
                    className={`atelier-tool ${multiSelectMode ? 'is-active' : ''}`}
                    onClick={onToggleMultiSelect}
                >
                    {multiSelectMode ? <CheckSquare size={14} /> : <Square size={14} />}
                    <span>{multiSelectMode && selectedCount > 0 ? `${selectedCount}` : (lang === 'ar' ? 'تحديد' : 'Select')}</span>
                </button>

                {onImport && (
                    <button type="button" className="atelier-tool" onClick={onImport} title={lang === 'ar' ? 'استيراد Excel' : 'Import Excel'}>
                        <Upload size={14} />
                        <span>{lang === 'ar' ? 'استيراد' : 'Import'}</span>
                    </button>
                )}
                {onExport && (
                    <button type="button" className="atelier-tool" onClick={onExport} title={lang === 'ar' ? 'تصدير Excel' : 'Export Excel'}>
                        <Download size={14} />
                        <span>{lang === 'ar' ? 'تصدير' : 'Export'}</span>
                    </button>
                )}
                {onDesignMenu && (
                    <button type="button" className="atelier-tool" onClick={onDesignMenu} title={lang === 'ar' ? 'تصميم المنيو' : 'Design menu'}>
                        <Palette size={14} />
                        <span>{lang === 'ar' ? 'تصميم' : 'Design'}</span>
                    </button>
                )}

                <button type="button" className="atelier-tool is-acid" onClick={onNewItem}>
                    <Plus size={15} />
                    <span>{lang === 'ar' ? 'صنف جديد' : 'New item'}</span>
                </button>
            </div>

            <div className="atelier-view-switch" role="group" aria-label={lang === 'ar' ? 'طريقة عرض الأصناف' : 'Item layout'}>
                <button
                    type="button"
                    className={viewMode === 'list' ? 'is-active' : ''}
                    onClick={() => { onViewModeChange('list'); onDensityChange('comfortable'); }}
                    aria-pressed={viewMode === 'list'}
                    aria-label={lang === 'ar' ? 'عرض القائمة' : 'List view'}
                    title={lang === 'ar' ? 'قائمة' : 'List'}
                >
                    <List size={17} />
                </button>
                <button
                    type="button"
                    className={isCards ? 'is-active' : ''}
                    onClick={() => { onViewModeChange('grid'); onDensityChange('comfortable'); }}
                    aria-pressed={isCards}
                    aria-label={lang === 'ar' ? 'عرض البطاقات' : 'Cards view'}
                    title={lang === 'ar' ? 'بطاقات' : 'Cards'}
                >
                    <LayoutGrid size={17} />
                </button>
                <button
                    type="button"
                    className={isCompact ? 'is-active' : ''}
                    onClick={() => { onViewModeChange('grid'); onDensityChange('compact'); }}
                    aria-pressed={isCompact}
                    aria-label={lang === 'ar' ? 'عرض مضغوط' : 'Compact view'}
                    title={lang === 'ar' ? 'مضغوط' : 'Compact'}
                >
                    <Rows3 size={17} />
                </button>
                <button
                    type="button"
                    className={viewMode === 'analytics' ? 'is-active' : ''}
                    onClick={() => onViewModeChange('analytics')}
                    aria-pressed={viewMode === 'analytics'}
                    aria-label={lang === 'ar' ? 'التحليلات' : 'Analytics'}
                    title={lang === 'ar' ? 'التحليلات' : 'Analytics'}
                >
                    <BarChart3 size={17} />
                </button>
            </div>

            <span className="atelier-result-count" aria-live="polite">
                {itemCount} {lang === 'ar' ? 'نتيجة' : 'results'}
            </span>
        </div>
    );
};

export default MenuToolbar;
