
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
    Plus, UtensilsCrossed, Loader2, AlertCircle, X, Sparkles, DollarSign,
    ChevronRight
} from 'lucide-react';

import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { MenuItem, MenuCategory } from '../../types';
import { useMenuStore } from '../../stores/useMenuStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useInventoryStore } from '../../stores/useInventoryStore';
import MenuSidebar from './MenuSidebar';
import MenuToolbar from './MenuToolbar';
import ItemCard from './ItemCard';
import ItemTable from './ItemTable';
import CategoryDrawer from './CategoryDrawer';
import BulkActionsBar from './BulkActionsBar';
import AnalyticsPanel from './AnalyticsPanel';
import PricingEngine from './PricingEngine';
import { useToast } from '../common/ToastProvider';
import { useConfirm } from '../common/ConfirmProvider';

const ItemDrawer = React.lazy(() => import('./ItemDrawer').then((module) => ({ default: module.ItemDrawer })));
const MenuSetupWizard = React.lazy(() => import('./MenuSetupWizard'));

export type ViewMode = 'grid' | 'list' | 'analytics';
export type DensityMode = 'comfortable' | 'compact';
export type SortField = 'name' | 'price' | 'margin' | 'sales' | 'revenue' | 'recent';
export type FilterTag = 'all' | 'active' | 'inactive' | 'low-margin' | 'best-seller' | 'no-image' | 'archived';

const MenuProfitCenter: React.FC = () => {
    const {
        menus, categories, platforms, isLoading, error,
        updateMenuItem, addMenuItem, deleteMenuItem,
        addCategory, updateCategory, deleteCategory, reorderCategories,
        addMenu, updateMenu, linkCategory, fetchMenu,
        bulkUpdateItems, archiveItem, restoreItem, duplicateItem
    } = useMenuStore(useShallow((state) => ({
        menus: state.menus,
        categories: state.categories,
        platforms: state.platforms,
        isLoading: state.isLoading,
        error: state.error,
        updateMenuItem: state.updateMenuItem,
        addMenuItem: state.addMenuItem,
        deleteMenuItem: state.deleteMenuItem,
        addCategory: state.addCategory,
        updateCategory: state.updateCategory,
        deleteCategory: state.deleteCategory,
        reorderCategories: state.reorderCategories,
        addMenu: state.addMenu,
        updateMenu: state.updateMenu,
        linkCategory: state.linkCategory,
        fetchMenu: state.fetchMenu,
        bulkUpdateItems: state.bulkUpdateItems,
        archiveItem: state.archiveItem,
        restoreItem: state.restoreItem,
        duplicateItem: state.duplicateItem,
    })));
    const { inventory, fetchInventory } = useInventoryStore();
    const { branches, printers, settings } = useAuthStore(useShallow((state) => ({ branches: state.branches, printers: state.printers, settings: state.settings })));
    const lang = settings.language;
    const { error: showError, info } = useToast();
    const { confirm } = useConfirm();

    useEffect(() => {
        fetchMenu();
        fetchInventory();
    }, [fetchMenu, fetchInventory]);

    // --- State ---
    const [selectedMenuId, setSelectedMenuId] = useState<string>(menus[0]?.id || '');
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | 'all'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    // Debounced query: typing filters without re-rendering the grid per keystroke
    const [debouncedQuery, setDebouncedQuery] = useState('');
    useEffect(() => {
        const t = setTimeout(() => setDebouncedQuery(searchQuery), 220);
        return () => clearTimeout(t);
    }, [searchQuery]);
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [density, setDensity] = useState<DensityMode>('comfortable');
    const [sortField, setSortField] = useState<SortField>('name');
    const [filterTag, setFilterTag] = useState<FilterTag>('all');
    const [sidebarSection, setSidebarSection] = useState<'menus' | 'offers' | 'scheduled' | 'archived' | 'pricing'>('menus');

    // Drawers
    const [drawerItem, setDrawerItem] = useState<{ item: MenuItem; menuId: string; categoryId: string; mode: 'ADD' | 'EDIT' } | null>(null);
    const [drawerCategory, setDrawerCategory] = useState<{ category: MenuCategory; mode: 'ADD' | 'EDIT' } | null>(null);

    // Bulk selection
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
    const [multiSelectMode, setMultiSelectMode] = useState(false);

    // Quick Add
    const [quickAdd, setQuickAdd] = useState<{ name: string; price: string }>({ name: '', price: '' });

    // Branch selection (multi-branch)
    const [selectedBranchId, setSelectedBranchId] = useState<string | 'all'>('all');
    const [comparisonMode, setComparisonMode] = useState(false);

    // Menu Design modal
    const [showDesignModal, setShowDesignModal] = useState(false);
    // Import modal
    const [showImportModal, setShowImportModal] = useState(false);
    const [importData, setImportData] = useState<string>('');

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.key === 'n' || e.key === 'N') {
                e.preventDefault();
                handleNewItem();
            }
            if (e.key === 'f' || e.key === 'F') {
                e.preventDefault();
                document.getElementById('menu-search-input')?.focus();
            }
            if (e.key === 'Escape') {
                setDrawerItem(null);
                setSelectedItemIds(new Set());
                setMultiSelectMode(false);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    const selectedMenu = menus.find(m => m.id === selectedMenuId);

    // --- Computed ---
    const allItems = useMemo(() => {
        if (!selectedMenu) return [];
        const cats = categories.filter(cat => cat.menuIds.includes(selectedMenu.id));
        return cats.flatMap(cat => cat.items.map(item => ({
            ...item,
            _categoryId: cat.id,
            _categoryName: cat.name,
            _categoryNameAr: cat.nameAr || cat.name,
        })));
    }, [selectedMenu, categories]);

    const filteredItems = useMemo(() => {
        let items = [...allItems];

        // Filter by section
        if (sidebarSection === 'archived') {
            items = items.filter(i => i.archivedAt);
        } else {
            items = items.filter(i => !i.archivedAt);
        }

        // Filter by category
        if (selectedCategoryId !== 'all') {
            items = items.filter(i => i._categoryId === selectedCategoryId);
        }

        // Search (debounced)
        if (debouncedQuery) {
            const q = debouncedQuery.toLowerCase();
            items = items.filter(i =>
                i.name.toLowerCase().includes(q) ||
                i.nameAr?.toLowerCase().includes(q) ||
                i.sku?.toLowerCase().includes(q) ||
                i.barcode?.toLowerCase().includes(q) ||
                i.description?.toLowerCase().includes(q) ||
                String(i.price).includes(q)
            );
        }

        // Filter tag
        if (filterTag === 'active') items = items.filter(i => i.isAvailable);
        if (filterTag === 'inactive') items = items.filter(i => !i.isAvailable);
        if (filterTag === 'low-margin') items = items.filter(i => i.cost && i.price > 0 && ((i.price - i.cost) / i.price) < 0.15);
        if (filterTag === 'best-seller') items = items.filter(i => i.tags?.includes('best-seller') || (i.salesData?.last30 || 0) > 50);
        if (filterTag === 'no-image') items = items.filter(i => !i.image);
        if (filterTag === 'archived') items = items.filter(i => i.archivedAt);

        // Sort
        items.sort((a, b) => {
            switch (sortField) {
                case 'price': return b.price - a.price;
                case 'margin': {
                    const mA = a.cost ? (a.price - a.cost) / a.price : 0;
                    const mB = b.cost ? (b.price - b.cost) / b.price : 0;
                    return mB - mA;
                }
                case 'sales': return (b.salesData?.last30 || 0) - (a.salesData?.last30 || 0);
                case 'revenue': return (b.salesData?.revenue30 || 0) - (a.salesData?.revenue30 || 0);
                case 'recent': return (b.sortOrder || 0) - (a.sortOrder || 0);
                default: return a.name.localeCompare(b.name);
            }
        });

        return items;
    }, [allItems, selectedCategoryId, debouncedQuery, filterTag, sortField, sidebarSection]);

    const filteredCategories = useMemo(() => {
        if (!selectedMenu) return [];
        return categories.filter(cat => cat.menuIds.includes(selectedMenu.id));
    }, [selectedMenu, categories]);

    // Open on the first category — never mount the whole menu at once
    const didInitCategory = useRef(false);
    useEffect(() => {
        if (!didInitCategory.current && filteredCategories.length > 0) {
            didInitCategory.current = true;
            setSelectedCategoryId(filteredCategories[0].id);
        }
    }, [filteredCategories]);

    const selectedCategory = useMemo(() => (
        selectedCategoryId === 'all'
            ? null
            : filteredCategories.find(c => c.id === selectedCategoryId) ?? null
    ), [selectedCategoryId, filteredCategories]);

    // Incremental rendering: mount one page of cards, load more on demand
    const GRID_PAGE = 48;
    const LIST_PAGE = 120;
    const [visibleCount, setVisibleCount] = useState(GRID_PAGE);
    useEffect(() => {
        setVisibleCount(viewMode === 'list' ? LIST_PAGE : GRID_PAGE);
    }, [debouncedQuery, selectedCategoryId, selectedMenuId, filterTag, sortField, sidebarSection, viewMode]);
    const visibleItems = useMemo(() => filteredItems.slice(0, visibleCount), [filteredItems, visibleCount]);

    // Content scroll (reset to top on category change)
    const scrollRef = useRef<HTMLDivElement>(null);

    const handleSelectMenu = useCallback((id: string) => {
        setSelectedMenuId(id);
        const first = categories
            .filter(c => c.menuIds.includes(id))
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))[0];
        setSelectedCategoryId(first ? first.id : 'all');
        setSelectedItemIds(new Set());
        setMultiSelectMode(false);
    }, [categories]);

    const handleSelectCategory = useCallback((id: string | 'all') => {
        setSelectedCategoryId(id);
        setSelectedItemIds(new Set());
        setMultiSelectMode(false);
        scrollRef.current?.scrollTo({ top: 0 });
    }, []);

    const handleEditItem = useCallback((item: MenuItem & { _categoryId: string }) => {
        setDrawerItem({ mode: 'EDIT', menuId: selectedMenuId, categoryId: item._categoryId, item });
    }, [selectedMenuId]);

    // --- Handlers ---
    const handleNewItem = () => {
        const firstCat = selectedCategory ?? filteredCategories[0];
        if (!firstCat) {
            info(lang === 'ar' ? 'أضف قسم أولاً قبل إضافة صنف.' : 'Add a category before adding an item.');
            setDrawerCategory({ mode: 'ADD', category: { id: `cat-${Date.now()}`, name: '', isActive: true, menuIds: [selectedMenuId], items: [] } });
            return;
        }
        setDrawerItem({
            mode: 'ADD',
            menuId: selectedMenuId,
            categoryId: firstCat.id,
            item: {
                id: '', name: '', price: 0, categoryId: firstCat.id,
                isAvailable: true, availableDays: [], availableFrom: '', availableTo: '',
                modifierGroups: [], priceLists: [], printerIds: [], sizes: [], platformPricing: [],
                tags: [], versionHistory: [],
            }
        });
    };

    const handleItemClick = useCallback((item: MenuItem & { _categoryId: string }, e: React.MouseEvent) => {
        if (multiSelectMode || e.shiftKey) {
            setMultiSelectMode(true);
            setSelectedItemIds(prev => {
                const next = new Set(prev);
                if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                return next;
            });
        } else {
            setDrawerItem({ mode: 'EDIT', menuId: selectedMenuId, categoryId: item._categoryId, item });
        }
    }, [multiSelectMode, selectedMenuId]);

    const handleDragItemEnd = async (result: DropResult) => {
        if (!result.destination || selectedCategoryId === 'all') return;

        const itemsToReorder = Array.from(filteredItems);
        const [reorderedItem] = itemsToReorder.splice(result.source.index, 1);
        itemsToReorder.splice(result.destination.index, 0, reorderedItem);

        // Calculate updates
        const updates = itemsToReorder.map((item, index) => ({
            menuId: selectedMenuId,
            categoryId: selectedCategoryId,
            itemId: item.id,
            changes: { sortOrder: index }
        }));

        try {
            await bulkUpdateItems(updates);
        } catch (err: any) {
            showError(err?.message || (lang === 'ar' ? 'تعذر حفظ ترتيب الأصناف' : 'Could not save item order'));
        }
    };

    const handleSaveItem = async (item: MenuItem, categoryId: string, keepOpen?: boolean) => {
        if (!drawerItem) return;
        try {
            if (drawerItem.mode === 'ADD') {
                await addMenuItem(drawerItem.menuId, categoryId, { ...item, id: `item-${Date.now()}` });
            } else {
                await updateMenuItem(drawerItem.menuId, categoryId, item);
            }
            if (keepOpen) {
                setDrawerItem(prev => prev ? { ...prev, mode: 'ADD' } : null);
            } else {
                setDrawerItem(null);
            }
        } catch (err: any) {
            showError(err?.message || (lang === 'ar' ? 'تعذر حفظ الصنف' : 'Could not save item'));
        }
    };

    const handleToggleAvailability = useCallback((item: MenuItem & { _categoryId: string }) => {
        updateMenuItem(selectedMenuId, item._categoryId, { ...item, isAvailable: !item.isAvailable });
    }, [updateMenuItem, selectedMenuId]);

    const handleDuplicate = useCallback(async (item: MenuItem & { _categoryId: string }) => {
        try {
            await duplicateItem(selectedMenuId, item._categoryId, item.id);
        } catch (err: any) {
            showError(err?.message || (lang === 'ar' ? 'تعذر نسخ الصنف' : 'Could not duplicate item'));
        }
    }, [duplicateItem, selectedMenuId, lang, showError]);

    const handleArchive = useCallback(async (item: MenuItem & { _categoryId: string }) => {
        try {
            if (item.archivedAt) {
                await restoreItem(selectedMenuId, item._categoryId, item.id);
            } else {
                await archiveItem(selectedMenuId, item._categoryId, item.id);
            }
        } catch (err: any) {
            showError(err?.message || (lang === 'ar' ? 'تعذر تحديث حالة الصنف' : 'Could not update item status'));
        }
    }, [archiveItem, restoreItem, selectedMenuId, lang, showError]);

    const handleDelete = useCallback(async (item: MenuItem & { _categoryId: string }) => {
        const ok = await confirm({
            title: lang === 'ar' ? 'حذف الصنف؟' : 'Delete item?',
            message: lang === 'ar'
                ? `سيتم حذف ${item.nameAr || item.name} من المنيو.`
                : `${item.name} will be deleted from the menu.`,
            confirmText: lang === 'ar' ? 'حذف' : 'Delete',
            cancelText: lang === 'ar' ? 'إلغاء' : 'Cancel',
            variant: 'danger',
        });
        if (!ok) return false;
        try {
            await deleteMenuItem(selectedMenuId, item._categoryId, item.id);
            return true;
        } catch (err: any) {
            showError(err?.message || (lang === 'ar' ? 'تعذر حذف الصنف' : 'Could not delete item'));
            return false;
        }
    }, [confirm, deleteMenuItem, selectedMenuId, lang, showError]);

    const handleDeleteDrawerItem = async () => {
        if (!drawerItem || drawerItem.mode !== 'EDIT') return;
        const cat = categories.find(c => c.items.some(i => i.id === drawerItem.item.id));
        if (!cat) return;
        if (await handleDelete({ ...drawerItem.item, _categoryId: cat.id })) {
            setDrawerItem(null);
        }
    };

    const handleDeleteDrawerCategory = async () => {
        if (!drawerCategory || drawerCategory.mode !== 'EDIT') return;
        const ok = await confirm({
            title: lang === 'ar' ? 'حذف المجموعة؟' : 'Delete section?',
            message: lang === 'ar'
                ? `سيتم حذف ${drawerCategory.category.nameAr || drawerCategory.category.name} من المنيو.`
                : `${drawerCategory.category.name} will be deleted from the menu.`,
            confirmText: lang === 'ar' ? 'حذف' : 'Delete',
            cancelText: lang === 'ar' ? 'إلغاء' : 'Cancel',
            variant: 'danger',
        });
        if (!ok) return;
        try {
            await deleteCategory(selectedMenuId, drawerCategory.category.id);
            setDrawerCategory(null);
        } catch (err: any) {
            showError(err?.message || (lang === 'ar' ? 'تعذر حذف المجموعة' : 'Could not delete section'));
        }
    };

    const handleBulkApply = async (changes: Partial<MenuItem>) => {
        const updates = Array.from(selectedItemIds).map(id => {
            const item = allItems.find(i => i.id === id);
            return item ? { menuId: selectedMenuId, categoryId: item._categoryId, itemId: id, changes } : null;
        }).filter(Boolean) as any[];
        try {
            await bulkUpdateItems(updates);
            setSelectedItemIds(new Set());
            setMultiSelectMode(false);
        } catch (err: any) {
            showError(err?.message || (lang === 'ar' ? 'تعذر حفظ التعديل الجماعي' : 'Could not save bulk changes'));
        }
    };

    const handleQuickAdd = async () => {
        if (!quickAdd.name.trim() || !quickAdd.price) return;
        const firstCat = selectedCategory ?? filteredCategories[0];
        if (!firstCat) {
            info(lang === 'ar' ? 'أضف قسم أولاً قبل إضافة صنف.' : 'Add a category before adding an item.');
            setDrawerCategory({ mode: 'ADD', category: { id: `cat-${Date.now()}`, name: '', isActive: true, menuIds: [selectedMenuId], items: [] } });
            return;
        }
        try {
            await addMenuItem(selectedMenuId, firstCat.id, {
                id: `item-${Date.now()}`,
                name: quickAdd.name.trim(),
                price: parseFloat(quickAdd.price) || 0,
                categoryId: firstCat.id,
                isAvailable: true,
                availableDays: [],
                modifierGroups: [],
                priceLists: [],
                printerIds: [],
            });
            setQuickAdd({ name: '', price: '' });
        } catch (err: any) {
            showError(err?.message || (lang === 'ar' ? 'تعذر حفظ الصنف' : 'Could not save item'));
        }
    };

    // Summary stats (memoized: strip renders every keystroke otherwise)
    const totalRevenue = useMemo(() => allItems.reduce((s, i) => s + (i.salesData?.revenue30 || 0), 0), [allItems]);
    const activeItemsCount = useMemo(() => allItems.filter(i => i.isAvailable && !i.archivedAt).length, [allItems]);
    const avgMargin = allItems.length > 0
        ? allItems.reduce((s, i) => s + (i.cost && i.price > 0 ? ((i.price - i.cost) / i.price) * 100 : 0), 0) / allItems.length
        : 0;

    // --- Excel Export ---
    const handleExportMenu = useCallback(() => {
        const headers = ['Name', 'Name (AR)', 'Category', 'Price', 'Margin %', 'SKU', 'Barcode', 'Available', 'Tags'];
        const rows = allItems.map(i => {
            const margin = i.cost && i.price > 0 ? ((i.price - i.cost) / i.price * 100).toFixed(1) : '';
            return [
                i.name, i.nameAr || '', (i as any)._categoryName || '', i.price,
                margin, i.sku || '', i.barcode || '', i.isAvailable ? 'Yes' : 'No',
                (i.tags || []).join('; ')
            ];
        });
        const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `menu_${selectedMenu?.name || 'export'}_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [allItems, selectedMenu]);

    // --- Excel Import ---
    const handleImportMenu = useCallback(() => {
        setShowImportModal(true);
    }, []);

    const handleImportConfirm = useCallback(() => {
        if (!importData.trim()) return;
        try {
            const lines = importData.trim().split('\n');
            if (lines.length < 2) return;
            const firstCat = filteredCategories[0];
            if (!firstCat) return;
            // Skip header
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
                if (!cols[0]) continue;
                const name = cols[0];
                const nameAr = cols[1] || '';
                const price = parseFloat(cols[3]) || 0;
                const sku = cols[5] || '';
                const barcode = cols[6] || '';
                const isAvailable = (cols[7] || 'Yes').toLowerCase() !== 'no';
                addMenuItem(selectedMenuId, firstCat.id, {
                    id: `item-${Date.now()}-${i}`,
                    name, nameAr, price, sku, barcode, isAvailable,
                    categoryId: firstCat.id,
                    modifierGroups: [], priceLists: [], printerIds: [],
                });
            }
            setShowImportModal(false);
            setImportData('');
        } catch {
            showError(lang === 'ar' ? 'تعذر استيراد الأصناف' : 'Failed to import items');
        }
    }, [importData, filteredCategories, selectedMenuId, addMenuItem, lang, showError]);

    // --- Menu Design ---
    const handleDesignMenu = useCallback(() => {
        setShowDesignModal(true);
    }, []);

    // --- Wizard Complete ---
    const handleWizardComplete = async (importedCategories: MenuCategory[]) => {
        setIsProcessing(true);
        try {
            for (const cat of importedCategories) {
                // 1. Add Category
                await addCategory(selectedMenuId, cat);
                
                // 2. Add Items for this category
                for (const item of cat.items) {
                    await addMenuItem(selectedMenuId, cat.id, item);
                }
            }
        } catch {
            showError(lang === 'ar' ? 'تعذر استيراد المنيو من المعالج' : 'Wizard import failed');
        } finally {
            setIsProcessing(false);
        }
    };

    const [isProcessing, setIsProcessing] = useState(false);

    // --- Loading ---
    if (isLoading && categories.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-app">
                <Loader2 className="w-10 h-10 text-gray-400 dark:text-muted animate-spin mb-3" />
                <p className="text-gray-500 dark:text-muted font-medium text-[13px]">
                    {lang === 'ar' ? 'جاري تحميل المنيو...' : 'Loading menu...'}
                </p>
            </div>
        );
    }

    // --- Empty State (SaaS Style) ---
    if (allItems.length === 0 && filteredCategories.length === 0 && !isLoading && !searchQuery && sidebarSection === 'menus') {
        return (
            <>
                <React.Suspense fallback={null}>
                    <MenuSetupWizard
                        selectedMenuId={selectedMenuId}
                        lang={lang}
                        onManualStart={handleNewItem}
                        onComplete={handleWizardComplete}
                    />
                </React.Suspense>

                {/* Drawers must still be available for the 'Start from Scratch' path */}
                {drawerCategory && (
                    <CategoryDrawer
                        category={drawerCategory.category}
                        mode={drawerCategory.mode}
                        menuId={selectedMenuId}
                        printers={printers}
                        branches={branches}
                        platforms={platforms || []}
                        onSave={(cat) => {
                            if (drawerCategory.mode === 'ADD') {
                                addCategory(selectedMenuId, cat);
                            } else {
                                updateCategory(cat);
                            }
                            setDrawerCategory(null);
                        }}
                        onClose={() => setDrawerCategory(null)}
                        onDelete={drawerCategory.mode === 'EDIT' ? handleDeleteDrawerCategory : undefined}
                        lang={lang}
                    />
                )}

                {drawerItem && (
                    <React.Suspense fallback={null}>
                        <ItemDrawer
                            item={drawerItem.item}
                            mode={drawerItem.mode}
                            categoryId={drawerItem.categoryId}
                            categories={filteredCategories}
                            printers={printers}
                            branches={branches}
                            inventory={inventory}
                            onSave={handleSaveItem}
                            onClose={() => setDrawerItem(null)}
                            onDelete={drawerItem.mode === 'EDIT' ? handleDeleteDrawerItem : undefined}
                            currency={settings.currencySymbol}
                            lang={lang}
                        />
                    </React.Suspense>
                )}

                {/* Progress Overlay if wizard is processing */}
                {isProcessing && (
                    <div className="fixed inset-0 z-[1000] bg-app/80 backdrop-blur-md flex flex-col items-center justify-center">
                        <div className="bg-card p-10 rounded-[2.5rem] border border-border/20 shadow-2xl text-center space-y-6 max-w-sm">
                            <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                                <Loader2 size={32} className="animate-spin" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-main">{lang === 'ar' ? 'جاري بناء المنيو...' : 'Building Menu...'}</h3>
                                <p className="text-sm text-muted/60 mt-1">{lang === 'ar' ? 'لحظات وننتهي من معالجة بياناتك.' : 'Almost done processing your data.'}</p>
                            </div>
                        </div>
                    </div>
                )}
            </>
        );
    }

    return (
        <div className="h-full min-h-screen bg-app relative overflow-hidden">
            {/* Error Banner */}
            {error && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[200] py-2.5 px-4 bg-rose-500/10 border border-rose-500/20 rounded-md text-rose-400 text-[12px] font-medium flex items-center gap-3 max-w-lg">
                    <AlertCircle size={16} />
                    {error}
                    <button onClick={() => useMenuStore.getState().clearError()} className="ml-auto p-1 hover:bg-rose-500/10 rounded"><X size={14} /></button>
                </div>
            )}

            <div className="flex h-full overflow-hidden flex-col lg:flex-row">
                <MenuSidebar
                    menus={menus}
                    categories={filteredCategories}
                    selectedMenuId={selectedMenuId}
                    onSelectMenu={handleSelectMenu}
                    selectedCategoryId={selectedCategoryId}
                    onSelectCategory={handleSelectCategory}
                    section={sidebarSection}
                    onChangeSection={setSidebarSection}
                    onAddCategory={() => setDrawerCategory({ mode: 'ADD', category: { id: `cat-${Date.now()}`, name: '', isActive: true, menuIds: [selectedMenuId], items: [] } })}
                    onEditCategory={(cat) => setDrawerCategory({ mode: 'EDIT', category: cat })}
                    onReorderCategories={(reordered) => reorderCategories(selectedMenuId, reordered)}
                    allItems={allItems}
                    totalRevenue={totalRevenue}
                    avgMargin={avgMargin}
                    lang={lang}
                    currency={settings.currencySymbol}
                />



                {/* MAIN CONTENT */}
                <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                    {sidebarSection === 'pricing' ? (
                        <PricingEngine 
                            allItems={allItems} 
                            branches={branches}
                            platforms={platforms || []}
                            lang={lang} 
                            currency={settings.currencySymbol} 
                        />
                    ) : (
                        <>
                    {/* TOP TOOLBAR */}
                    <MenuToolbar
                        categories={filteredCategories}
                        selectedCategoryId={selectedCategoryId}
                        onSelectCategory={setSelectedCategoryId}
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        viewMode={viewMode}
                        onViewModeChange={setViewMode}
                        density={density}
                        onDensityChange={setDensity}
                        sortField={sortField}
                        onSortChange={setSortField}
                        filterTag={filterTag}
                        onFilterChange={setFilterTag}
                        onNewItem={handleNewItem}
                        multiSelectMode={multiSelectMode}
                        onToggleMultiSelect={() => {
                            setMultiSelectMode(!multiSelectMode);
                            if (multiSelectMode) setSelectedItemIds(new Set());
                        }}
                        itemCount={filteredItems.length}
                        selectedCount={selectedItemIds.size}
                        lang={lang}
                        branches={branches}
                        selectedBranchId={selectedBranchId}
                        onSelectBranch={setSelectedBranchId}
                        comparisonMode={comparisonMode}
                        onToggleComparison={() => setComparisonMode(!comparisonMode)}
                        onExport={handleExportMenu}
                        onImport={handleImportMenu}
                        onDesignMenu={handleDesignMenu}
                    />

                    {/* BREADCRUMB + METRICS STRIP */}
                    <div className="px-3 sm:px-5 py-2.5 border-b border-gray-100 dark:border-white/[0.04] flex flex-wrap items-center gap-3 sm:gap-4">
                        {/* Breadcrumb */}
                        <div className="flex items-center gap-1.5 text-[12px]">
                            <span className="text-gray-400 dark:text-muted/50">{lang === 'ar' ? 'المنيو' : 'Menu'}</span>
                            <ChevronRight size={10} className="text-gray-300 dark:text-muted/30" />
                            <span className="text-gray-700 dark:text-main font-medium">{selectedMenu?.name || (lang === 'ar' ? 'القائمة الرئيسية' : 'Main Menu')}</span>
                        </div>

                        <div className="flex-1" />

                        {/* Compact Metrics */}
                        <div className="hidden sm:flex items-center gap-4 text-[11px]">
                            <div>
                                <span className="text-gray-400 dark:text-muted/50">{lang === 'ar' ? 'إجمالي' : 'Total'}: </span>
                                <span className="font-medium text-gray-700 dark:text-main">{filteredItems.length}</span>
                            </div>
                            <div>
                                <span className="text-gray-400 dark:text-muted/50">{lang === 'ar' ? 'نشط' : 'Active'}: </span>
                                <span className="font-medium text-emerald-600 dark:text-emerald-500">{activeItemsCount}</span>
                            </div>
                            <div>
                                <span className="text-gray-400 dark:text-muted/50">{lang === 'ar' ? 'الهامش' : 'Avg Margin'}: </span>
                                <span className={`font-medium ${avgMargin >= 50 ? 'text-emerald-600 dark:text-emerald-500' : avgMargin >= 30 ? 'text-amber-600 dark:text-amber-500' : 'text-red-600 dark:text-rose-500'}`}>{avgMargin.toFixed(0)}%</span>
                            </div>
                            {totalRevenue > 0 && (
                                <div>
                                    <span className="text-gray-400 dark:text-muted/50">30D: </span>
                                    <span className="font-medium text-gray-700 dark:text-main">{settings.currencySymbol}{totalRevenue > 1000 ? `${(totalRevenue / 1000).toFixed(1)}K` : totalRevenue.toLocaleString()}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* CATEGORY CONTEXT STRIP */}
                    {selectedCategory && sidebarSection === 'menus' && (
                        <div className="px-3 sm:px-5 py-2 border-b border-gray-100 dark:border-white/[0.04] flex items-center gap-2.5 bg-card/40 shrink-0">
                            <span className="text-[11px] font-bold text-blue-700 dark:text-indigo-400 bg-blue-50 dark:bg-indigo-500/10 border border-blue-100 dark:border-indigo-500/20 rounded-md px-2 py-0.5 tabular-nums shrink-0">
                                {filteredItems.length} {lang === 'ar' ? 'صنف' : 'items'}
                            </span>
                            <span className="text-[13px] font-semibold text-gray-800 dark:text-main truncate">
                                {lang === 'ar' ? (selectedCategory.nameAr || selectedCategory.name) : selectedCategory.name}
                            </span>
                            <div className="flex-1" />
                            <button onClick={handleNewItem} className="h-8 px-3 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-[12px] font-bold flex items-center gap-1.5 transition-colors shrink-0">
                                <Plus size={14} />
                                {lang === 'ar' ? 'صنف جديد' : 'New Item'}
                            </button>
                            <button onClick={() => setDrawerCategory({ mode: 'EDIT', category: selectedCategory })} className="h-8 px-3 rounded-lg border border-border/30 text-[12px] font-medium text-muted hover:text-main hover:bg-white/[0.03] transition-colors shrink-0">
                                {lang === 'ar' ? 'تعديل القسم' : 'Edit Section'}
                            </button>
                        </div>
                    )}

                    {/* CONTENT AREA */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 sm:p-5 pb-32 no-scrollbar">
                        {viewMode === 'analytics' ? (
                            <AnalyticsPanel items={filteredItems} lang={lang} currency={settings.currencySymbol} />
                        ) : viewMode === 'list' ? (
                            <div className="max-w-[1600px] h-full">
                                <ItemTable
                                    items={visibleItems}
                                    selectedItemIds={selectedItemIds}
                                    multiSelectMode={multiSelectMode}
                                    onToggleSelection={(id, shift) => {
                                        setSelectedItemIds(prev => {
                                            const next = new Set(prev);
                                            if (next.has(id)) next.delete(id); else next.add(id);
                                            return next;
                                        });
                                        if (!multiSelectMode) setMultiSelectMode(true);
                                    }}
                                    onSelectAll={() => {
                                        if (selectedItemIds.size === filteredItems.length) {
                                            setSelectedItemIds(new Set());
                                        } else {
                                            setSelectedItemIds(new Set(filteredItems.map(i => i.id)));
                                        }
                                    }}
                                    onToggleAvailability={handleToggleAvailability}
                                    onDuplicate={handleDuplicate}
                                    onArchive={handleArchive}
                                    onDelete={handleDelete}
                                    onEdit={handleEditItem}
                                    onInlineUpdate={(categoryId, item) => updateMenuItem(selectedMenuId, categoryId, item)}
                                    lang={lang}
                                    currency={settings.currencySymbol}
                                />
                            </div>
                        ) : (
                            <DragDropContext onDragEnd={handleDragItemEnd}>
                                <Droppable droppableId="itemsGrid" direction="horizontal" type="item">
                                    {(provided) => (
                                        <div
                                            {...provided.droppableProps}
                                            ref={provided.innerRef}
                                            className={`grid gap-4 max-w-[1600px] pb-4 ${density === 'compact' ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'}`}
                                        >
                                            {visibleItems.map((item, idx) => (
                                                <Draggable
                                                    key={item.id}
                                                    draggableId={item.id}
                                                    index={idx}
                                                    isDragDisabled={selectedCategoryId === 'all' || sidebarSection !== 'menus' || filteredItems.length > 200}
                                                >
                                                    {(provided, snapshot) => (
                                                        <div
                                                            ref={provided.innerRef}
                                                            {...provided.draggableProps}
                                                            style={provided.draggableProps.style}
                                                            className={snapshot.isDragging ? 'z-50' : 'z-auto'}
                                                        >
                                                            <ItemCard
                                                                item={item}
                                                                viewMode={viewMode}
                                                                density={density}
                                                                isSelected={selectedItemIds.has(item.id)}
                                                                multiSelectMode={multiSelectMode}
                                                                onClick={handleItemClick}
                                                                onToggleAvailability={handleToggleAvailability}
                                                                onDuplicate={handleDuplicate}
                                                                onArchive={handleArchive}
                                                                onDelete={handleDelete}
                                                                onEdit={handleEditItem}
                                                                lang={lang}
                                                                currency={settings.currencySymbol}
                                                                index={idx}
                                                                dragHandleProps={provided.dragHandleProps}
                                                                draggableContext={selectedCategoryId !== 'all' && sidebarSection === 'menus'}
                                                            />
                                                        </div>
                                                    )}
                                                </Draggable>
                                            ))}
                                            {provided.placeholder}

                                            {/* Quick Add Card — always last in grid */}
                                            {selectedCategoryId !== 'all' && sidebarSection === 'menus' && (
                                                <div className="rounded-lg border border-dashed border-border/40 bg-card/30 flex flex-col justify-center min-h-[160px] hover:bg-white/[0.02] hover:border-indigo-500/30 transition-colors group/qa p-4">
                                                    <div className="w-full space-y-2">
                                                        <div className="flex items-center gap-1.5 text-indigo-400">
                                                            <Sparkles size={14} />
                                                            <span className="text-[12px] font-medium">
                                                                {lang === 'ar' ? 'إضافة سريعة' : 'Quick Add'}
                                                            </span>
                                                        </div>
                                                        <input
                                                            type="text"
                                                            placeholder={lang === 'ar' ? 'اسم الصنف (مثال: قهوة عربي)...' : 'Item name (e.g. Arabic Coffee)...'}
                                                            value={quickAdd.name}
                                                            onChange={(e) => setQuickAdd(prev => ({ ...prev, name: e.target.value }))}
                                                            onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
                                                            className="w-full bg-elevated h-9 px-3 rounded-md border border-border/30 text-[13px] text-main outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-muted/50"
                                                        />
                                                        <div className="flex items-center gap-2 pt-1">
                                                            <div className="relative flex-1">
                                                                <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted/50 w-3.5 h-3.5" />
                                                                <input
                                                                    type="number"
                                                                    placeholder="0.00"
                                                                    value={quickAdd.price}
                                                                    onChange={(e) => setQuickAdd(prev => ({ ...prev, price: e.target.value }))}
                                                                    onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
                                                                    className="w-full bg-elevated h-9 pl-8 pr-3 rounded-md border border-border/30 text-[13px] font-medium text-emerald-500 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all placeholder:text-muted/50"
                                                                />
                                                            </div>
                                                            <button
                                                                onClick={handleQuickAdd}
                                                                disabled={!quickAdd.name.trim() || !quickAdd.price}
                                                                className="bg-indigo-500 hover:bg-indigo-600 text-white h-9 px-3 rounded-md transition-colors disabled:opacity-50 flex items-center"
                                                            >
                                                                <Plus size={16} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </Droppable>
                            </DragDropContext>
                        )}

                        {/* Incremental footer: count + load more + DnD notice */}
                        {viewMode !== 'analytics' && filteredItems.length > 0 && (
                            <div className="flex flex-col items-center gap-2 py-6">
                                <p className="text-[12px] text-gray-400 dark:text-muted/50 tabular-nums">
                                    {lang === 'ar' ? 'عرض' : 'Showing'} {Math.min(visibleCount, filteredItems.length)} {lang === 'ar' ? 'من' : 'of'} {filteredItems.length}
                                </p>
                                {visibleCount < filteredItems.length && (
                                    <button
                                        onClick={() => setVisibleCount(c => c + (viewMode === 'list' ? LIST_PAGE : GRID_PAGE))}
                                        className="h-10 px-8 rounded-xl border border-border/30 text-[13px] font-bold text-main hover:bg-white/[0.03] hover:border-indigo-500/40 transition-all active:scale-95"
                                    >
                                        {lang === 'ar' ? `عرض المزيد (${filteredItems.length - visibleCount})` : `Show more (${filteredItems.length - visibleCount})`}
                                    </button>
                                )}
                                {selectedCategoryId !== 'all' && sidebarSection === 'menus' && filteredItems.length > 200 && (
                                    <p className="text-[11px] text-amber-600 dark:text-amber-500/80">
                                        {lang === 'ar' ? 'إعادة الترتيب بالسحب متاحة لأول 200 صنف — استخدم البحث للوصول لصنف معين.' : 'Drag reorder covers the first 200 items — use search to reach a specific item.'}
                                    </p>
                                )}
                            </div>
                        )}

                        {filteredItems.length === 0 && !searchQuery && (
                            <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="w-20 h-20 rounded-[2rem] bg-indigo-500/5 flex items-center justify-center text-indigo-500/20 mb-6 border border-indigo-500/10">
                                    <UtensilsCrossed size={40} />
                                </div>
                                <h3 className="text-xl font-bold text-main">
                                    {selectedCategoryId === 'all' 
                                        ? (lang === 'ar' ? 'ابدأ ببناء قائمتك' : 'Start building your menu')
                                        : (lang === 'ar' ? 'هذا القسم فارغ' : 'This category is empty')}
                                </h3>
                                <p className="text-sm text-muted/60 mt-2 max-w-sm mx-auto leading-relaxed">
                                    {selectedCategoryId === 'all'
                                        ? (lang === 'ar' 
                                            ? 'لديك أقسام جاهزة، ابدأ الآن بإضافة الأصناف إليها لتظهر في المنيو.' 
                                            : 'You have categories ready. Start adding items to them to build your menu.')
                                        : (lang === 'ar'
                                            ? 'لم تقم بإضافة أي أصناف في هذا القسم بعد.'
                                            : 'You haven’t added any items to this category yet.')}
                                </p>
                                <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
                                    <button 
                                        onClick={handleNewItem}
                                        className="bg-indigo-500 hover:bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold text-[14px] transition-all flex items-center gap-2 shadow-xl shadow-indigo-500/20"
                                    >
                                        <Plus size={18} />
                                        {lang === 'ar' ? 'إضافة صنف جديد' : 'Add New Item'}
                                    </button>
                                    {selectedCategoryId === 'all' && (
                                        <button 
                                            onClick={() => setDrawerCategory({ mode: 'ADD', category: { id: `cat-${Date.now()}`, name: '', isActive: true, menuIds: [selectedMenuId], items: [] } })}
                                            className="bg-white/[0.03] hover:bg-white/[0.06] border border-border/20 text-main px-8 py-3 rounded-2xl font-bold text-[14px] transition-all"
                                        >
                                            {lang === 'ar' ? 'إضافة قسم آخر' : 'Add Another Category'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {filteredItems.length === 0 && searchQuery && (
                            <div className="text-center py-20">
                                <p className="text-muted/60 font-medium text-[13px]">
                                    {lang === 'ar' ? 'لا توجد نتائج لـ' : 'No items match'} "{searchQuery}"
                                </p>
                                <p className="text-muted/40 text-[11px] mt-1">
                                    {lang === 'ar' ? 'جرب بحث مختلف' : 'Try a different search term'}
                                </p>
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="mt-3 h-9 px-5 rounded-xl border border-border/30 text-[12px] font-bold text-main hover:bg-white/[0.03] transition-colors"
                                >
                                    {lang === 'ar' ? 'مسح البحث' : 'Clear search'}
                                </button>
                            </div>
                        )}
                    </div>
                        </>
                    )}
                </div>
            </div>

            {/* BULK ACTIONS BAR */}
            {selectedItemIds.size > 0 && (
                <BulkActionsBar
                    selectedCount={selectedItemIds.size}
                    onApply={handleBulkApply}
                    onClearSelection={() => { setSelectedItemIds(new Set()); setMultiSelectMode(false); }}
                    lang={lang}
                    currency={settings.currencySymbol}
                />
            )}

            {/* ITEM DRAWER */}
            {drawerItem && (
                <React.Suspense fallback={null}>
                    <ItemDrawer
                        item={drawerItem.item}
                        mode={drawerItem.mode}
                        categoryId={drawerItem.categoryId}
                        categories={filteredCategories}
                        printers={printers}
                        branches={branches}
                        inventory={inventory}
                        onSave={handleSaveItem}
                        onClose={() => setDrawerItem(null)}
                        onDelete={drawerItem.mode === 'EDIT' ? handleDeleteDrawerItem : undefined}
                        currency={settings.currencySymbol}
                        lang={lang}
                    />
                </React.Suspense>
            )}

            {/* CATEGORY DRAWER */}
            {drawerCategory && (
                <CategoryDrawer
                    category={drawerCategory.category}
                    mode={drawerCategory.mode}
                    menuId={selectedMenuId}
                    printers={printers}
                    branches={branches}
                    platforms={platforms || []}
                    onSave={(cat) => {
                        if (drawerCategory.mode === 'ADD') {
                            addCategory(selectedMenuId, cat);
                        } else {
                            updateCategory(cat);
                        }
                        setDrawerCategory(null);
                    }}
                    onClose={() => setDrawerCategory(null)}
                    onDelete={drawerCategory.mode === 'EDIT' ? handleDeleteDrawerCategory : undefined}
                    lang={lang}
                />
            )}

            {/* IMPORT MODAL */}
            {showImportModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
                    <div className="absolute inset-0 bg-slate-950/60" onClick={() => setShowImportModal(false)} />
                    <div className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto bg-card rounded-lg shadow-2xl border border-border/20 p-4 sm:p-6 space-y-4 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between">
                            <h3 className="text-[15px] font-semibold text-main">{lang === 'ar' ? 'استيراد من CSV' : 'Import from CSV'}</h3>
                            <button onClick={() => setShowImportModal(false)} className="p-2 rounded-md text-muted/70 hover:text-main hover:bg-white/[0.05] border border-border/30"><X size={16} /></button>
                        </div>
                        <p className="text-[12px] text-muted/70">{lang === 'ar' ? 'الصق بيانات CSV (العنوان: Name, Name (AR), Category, Price, Margin%, SKU, Barcode, Available, Tags)' : 'Paste CSV data (header: Name, Name (AR), Category, Price, Margin%, SKU, Barcode, Available, Tags)'}</p>
                        <textarea
                            rows={10}
                            value={importData}
                            onChange={e => setImportData(e.target.value)}
                            placeholder={`Name,Name (AR),Category,Price,Margin%,SKU,Barcode,Available,Tags\nClassic Burger,برجر كلاسيك,Burgers,85,,SKU-001,,Yes,best-seller`}
                            className="w-full bg-elevated/50 rounded-md border border-border/30 p-3 text-[12px] text-main outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 font-mono resize-none placeholder:text-muted/30"
                        />
                        <div className="flex gap-3">
                            <button onClick={() => setShowImportModal(false)} className="flex-1 h-9 rounded-md border border-border/30 text-[12px] font-medium text-main hover:bg-white/[0.02]">
                                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button onClick={handleImportConfirm} disabled={!importData.trim()} className="flex-[2] h-9 rounded-md bg-indigo-500 hover:bg-indigo-600 text-white text-[12px] font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                                {lang === 'ar' ? 'استيراد الأصناف' : 'Import Items'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MENU DESIGN MODAL */}
            {showDesignModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
                    <div className="absolute inset-0 bg-slate-950/60" onClick={() => setShowDesignModal(false)} />
                    <div className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-card rounded-lg shadow-2xl border border-border/20 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-gray-200 dark:border-white/[0.05] flex items-center justify-between">
                            <div>
                                <h3 className="text-[16px] font-semibold text-gray-900 dark:text-main">{lang === 'ar' ? 'تصميم المنيو للطباعة' : 'Menu Design Preview'}</h3>
                                <p className="text-[11px] text-gray-500 dark:text-muted/60 mt-0.5">{lang === 'ar' ? 'معاينة قبل الطباعة أو مشاركة رابط' : 'Preview before print or share link'}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => window.print()} className="h-8 flex items-center gap-1.5 px-4 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-[12px] font-medium transition-colors">
                                    {lang === 'ar' ? 'طباعة' : 'Print'}
                                </button>
                                <button onClick={() => setShowDesignModal(false)} className="p-2 rounded-md text-muted/70 hover:text-main hover:bg-white/[0.05] border border-border/30"><X size={16} /></button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-8 bg-gray-50 dark:bg-elevated/30" id="menu-print-area">
                            <div className="max-w-2xl mx-auto bg-white dark:bg-card p-8 rounded-lg shadow-sm border border-gray-200 dark:border-border/20 print:shadow-none print:border-0">
                                <div className="text-center mb-8">
                                    <h1 className="text-3xl font-bold text-gray-900 dark:text-main">{selectedMenu?.name || 'Menu'}</h1>
                                    {selectedMenu?.nameAr && <p className="text-lg text-gray-500 dark:text-muted mt-1 font-medium" dir="rtl">{selectedMenu.nameAr}</p>}
                                </div>
                                {filteredCategories.map(cat => (
                                    <div key={cat.id} className="mb-8">
                                        <h2 className="text-xl font-bold text-gray-800 dark:text-main border-b-2 border-indigo-500 pb-2 mb-4">
                                            {lang === 'ar' ? (cat.nameAr || cat.name) : cat.name}
                                        </h2>
                                        <div className="space-y-3">
                                            {cat.items.filter(i => i.isAvailable && !i.archivedAt).map(item => (
                                                <div key={item.id} className="flex items-start justify-between py-2 border-b border-gray-100 dark:border-white/5 last:border-0">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-[14px] font-semibold text-gray-800 dark:text-main">{lang === 'ar' ? (item.nameAr || item.name) : item.name}</p>
                                                            {item.dietaryBadges?.map(b => <span key={b} className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-elevated text-gray-500 dark:text-muted font-medium">{b}</span>)}
                                                        </div>
                                                        {item.description && <p className="text-[11px] text-gray-400 dark:text-muted/60 mt-0.5 max-w-md">{lang === 'ar' ? (item.descriptionAr || item.description) : item.description}</p>}
                                                    </div>
                                                    <p className="text-[14px] font-bold text-gray-900 dark:text-main ml-4 shrink-0">{settings.currencySymbol}{item.price.toFixed(2)}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MenuProfitCenter;
