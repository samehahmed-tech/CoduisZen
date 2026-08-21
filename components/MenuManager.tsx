
import React, { useState, useMemo, useEffect, useCallback, useTransition, useRef, lazy, Suspense } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Plus, Search, Edit3, Trash2, Tag,
  Layers, Clock, CheckCircle2, AlertCircle,
  ChevronRight, MoreVertical, Image as ImageIcon,
  DollarSign, Percent, Gift, Eye, EyeOff, Scale,
  Save, X, Info, LayoutGrid, List, Sparkles, Link, ShoppingBag,
  ArrowRight, Filter, ChevronDown, UtensilsCrossed,
  Settings, Building2, Globe, Truck, Map, Printer as PrinterIcon, Loader2, MapPin
} from 'lucide-react';
import { RestaurantMenu, MenuItem, Offer, MenuCategory, InventoryItem, RecipeIngredient, Branch, DeliveryPlatform, Printer, AppSettings, ModifierGroup, ModifierOption } from '../types';

// Stores
import { useMenuStore } from '../stores/useMenuStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useInventoryStore } from '../stores/useInventoryStore';

// Services
import { translations } from '../services/translations';
import { menuApi } from '../services/api/menu';

// Components
import ImageUploader from './common/ImageUploader';
import MenuCategoryList from './menu/MenuCategoryList';
import { useToast } from './common/ToastProvider';
import { useConfirm } from './common/ConfirmProvider';
const ItemDrawer = lazy(() =>
  import('./menu/ItemDrawer').then((module) => ({
    default: module.ItemDrawer,
  }))
);

const MenuManager: React.FC = () => {
  // Global State
  const {
    menus, categories, platforms, isLoading, error,
    updateMenuItem, addMenuItem, deleteMenuItem, archiveItem,
    addCategory, updateCategory, deleteCategory,
    addMenu, updateMenu, linkCategory, fetchMenu
  } = useMenuStore(
    useShallow((state) => ({
      menus: state.menus,
      categories: state.categories,
      platforms: state.platforms,
      isLoading: state.isLoading,
      error: state.error,
      updateMenuItem: state.updateMenuItem,
      addMenuItem: state.addMenuItem,
      deleteMenuItem: state.deleteMenuItem,
      archiveItem: state.archiveItem,
      addCategory: state.addCategory,
      updateCategory: state.updateCategory,
      deleteCategory: state.deleteCategory,
      addMenu: state.addMenu,
      updateMenu: state.updateMenu,
      linkCategory: state.linkCategory,
      fetchMenu: state.fetchMenu,
    }))
  );
  const { inventory, fetchInventory } = useInventoryStore(
    useShallow((state) => ({
      inventory: state.inventory,
      fetchInventory: state.fetchInventory,
    }))
  );
  const { branches, printers, settings } = useAuthStore(
    useShallow((state) => ({
      branches: state.branches,
      printers: state.printers,
      settings: state.settings,
    }))
  );
  const lang = settings.language;
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [renamingMenu, setRenamingMenu] = useState<RestaurantMenu | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // const t = translations[lang]; // Not heavily used here yet, using ternary for labels

  // 🔄 Fetch menu data from database on component mount
  useEffect(() => {
    fetchMenu();
    fetchInventory();
  }, [fetchMenu, fetchInventory]);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  const [activeTab, setActiveTab] = useState<'MENUS' | 'OFFERS'>('MENUS');
  const [selectedMenuId, setSelectedMenuId] = useState<string>(menus[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [deferredSearch, setDeferredSearch] = useState('');
  const [showAddExistingCategory, setShowAddExistingCategory] = useState(false);
  const [isImportingMenu, setIsImportingMenu] = useState(false);
  const [isApplyingMenuImport, setIsApplyingMenuImport] = useState(false);
  const [menuImportPreview, setMenuImportPreview] = useState<{
    rows: Record<string, any>[];
    sizesRows: Record<string, any>[];
    modifierRows: Record<string, any>[];
    recipeRows: Record<string, any>[];
    updateExisting: boolean;
    result: any;
    fileName: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search handler
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      startTransition(() => setDeferredSearch(value));
    }, 150);
  }, []);

  // Modals
  const [itemModal, setItemModal] = useState<{ isOpen: boolean; mode: 'ADD' | 'EDIT'; menuId: string; categoryId: string; item: MenuItem; } | null>(null);
  const [categoryModal, setCategoryModal] = useState<{
    isOpen: boolean;
    mode: 'ADD' | 'EDIT';
    category: MenuCategory
  } | null>(null);
  const [recipeModal, setRecipeModal] = useState<{ isOpen: boolean; menuId: string; categoryId: string; item: MenuItem; tempRecipe: RecipeIngredient[]; } | null>(null);
  const [menuSettingsModal, setMenuSettingsModal] = useState<RestaurantMenu | null>(null);

  const [newIngredientId, setNewIngredientId] = useState('');
  const [newIngredientQty, setNewIngredientQty] = useState('');
  const [selectedRecipeSizeId, setSelectedRecipeSizeId] = useState<string | null>(null);

  const selectedMenu = menus.find(m => m.id === selectedMenuId);

  useEffect(() => {
    if (!selectedMenuId && menus.length > 0) {
      setSelectedMenuId(menus[0].id);
    }
  }, [menus, selectedMenuId]);

  const filteredCategories = useMemo(() => {
    if (!selectedMenu) return [];
    let cats = categories.filter(cat => cat.menuIds.includes(selectedMenu.id));
    // Pre-sort items inside each category once
    cats = cats.map(cat => ({
      ...cat,
      items: [...cat.items].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    }));
    if (!deferredSearch) return cats;
    const q = deferredSearch.toLowerCase();
    return cats.map(cat => ({
      ...cat,
      items: cat.items.filter(item =>
        item.name.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q)
      )
    })).filter(cat => cat.items.length > 0);
  }, [selectedMenu, categories, deferredSearch]);

  const otherCategories = useMemo(() => {
    if (!selectedMenu) return [];
    return categories.filter(cat => !cat.menuIds.includes(selectedMenu.id));
  }, [selectedMenu, categories]);

  // --- EXCEL LOGIC ---
  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const exportData: any[] = [];
      const sizesData: any[] = [];
      const modifiersData: any[] = [];
      const recipesData: any[] = [];
      filteredCategories.forEach(cat => {
        cat.items.forEach(item => {
          exportData.push({
            'ID': item.id,
            'Category': cat.name,
            'Category_AR': cat.nameAr || '',
            'SKU': item.sku || '',
            'Barcode': item.barcode || '',
            'Item_Name': item.name,
            'Item_Name_AR': item.nameAr || '',
            'Description': item.description || '',
            'Description_AR': item.descriptionAr || '',
            'Price': item.price,
            'Available': item.isAvailable ? 'Yes' : 'No',
            'Status': (item as any).status || 'published',
            'Preparation_Time': item.preparationTime || 15,
            'Popular': item.isPopular ? 'Yes' : 'No',
            'Featured': (item as any).isFeatured ? 'Yes' : 'No',
            'Sort_Order': item.sortOrder || 0,
            'Image': item.image || '',
            'Printer_IDs': (item.printerIds || cat.printerIds || []).join('|')
          });
          (item.sizes || []).forEach(size => {
            sizesData.push({
              'Item_ID': item.id,
              'SKU': item.sku || '',
              'Barcode': item.barcode || '',
              'Item_Name': item.name,
              'Size_Name': size.name,
              'Size_Name_AR': size.nameAr || '',
              'Price': size.price,
              'Available': size.isAvailable ? 'Yes' : 'No',
            });
          });
          (item.modifierGroups || []).forEach(group => {
            (group.options || []).forEach(option => {
              modifiersData.push({
                'Item_ID': item.id,
                'SKU': item.sku || '',
                'Barcode': item.barcode || '',
                'Item_Name': item.name,
                'Group_Name': group.name,
                'Group_Name_AR': group.nameAr || '',
                'Min_Selection': group.minSelection ?? 0,
                'Max_Selection': group.maxSelection ?? 1,
                'Option_Name': option.name,
                'Option_Name_AR': option.nameAr || '',
                'Price': option.price || 0,
              });
            });
          });
          (item.recipe || []).forEach(ingredient => {
            recipesData.push({
              'Item_ID': item.id,
              'SKU': item.sku || '',
              'Barcode': item.barcode || '',
              'Item_Name': item.name,
              'Ingredient_ID': ingredient.itemId,
              'Ingredient_Name': '',
              'Quantity': ingredient.quantity,
              'Unit': ingredient.unit,
              'Notes': '',
              'Yield': 1,
              'Instructions': '',
            });
          });
        });
      });
      if (exportData.length === 0) {
        showToast(lang === 'ar' ? 'لا يوجد عناصر للتصدير' : 'No items to export.', 'warning');
        return;
      }
      const wb = XLSX.utils.book_new();
      const ensureRows = (rows: any[], template: Record<string, any>) => rows.length > 0 ? rows : [template];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportData), 'Items');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ensureRows(sizesData, {
        'Item_ID': '', 'SKU': '', 'Barcode': '', 'Item_Name': '', 'Size_Name': '', 'Size_Name_AR': '', 'Price': '', 'Available': 'Yes'
      })), 'Sizes');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ensureRows(modifiersData, {
        'Item_ID': '', 'SKU': '', 'Barcode': '', 'Item_Name': '', 'Group_Name': '', 'Group_Name_AR': '', 'Min_Selection': 0, 'Max_Selection': 1, 'Option_Name': '', 'Option_Name_AR': '', 'Price': 0
      })), 'Modifiers');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ensureRows(recipesData, {
        'Item_ID': '', 'SKU': '', 'Barcode': '', 'Item_Name': '', 'Ingredient_ID': '', 'Ingredient_Name': '', 'Quantity': '', 'Unit': '', 'Notes': '', 'Yield': 1, 'Instructions': ''
      })), 'Recipes');
      XLSX.writeFile(wb, 'Menu_Export.xlsx');
      showToast(lang === 'ar' ? 'تم تصدير المنيو' : 'Menu exported', 'success');
    } catch (err: any) {
      showToast(err?.message || (lang === 'ar' ? 'فشل تصدير ملف Excel' : 'Excel export failed'), 'error');
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImportingMenu(true);
    try {
      const XLSX = await import('xlsx');
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const wb = XLSX.read(evt.target?.result, { type: 'array' });
          const findSheetName = (candidates: string[]) =>
            wb.SheetNames.find((sheetName: string) => candidates.includes(sheetName.toLowerCase().trim()));
          const rowsFromSheet = (sheetName?: string) =>
            sheetName && wb.Sheets[sheetName]
              ? XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[sheetName], { defval: '' })
              : [];

          const itemsSheetName = findSheetName(['items', 'menu items', 'menu_items']) || wb.SheetNames[0];
          const sizesSheetName = findSheetName(['sizes', 'item sizes', 'item_sizes']);
          const modifiersSheetName = findSheetName(['modifiers', 'modifier options', 'modifier_options']);
          const recipesSheetName = findSheetName(['recipes', 'recipe ingredients', 'recipe_ingredients']);

          const rows = rowsFromSheet(itemsSheetName);
          const sizesRows = rowsFromSheet(sizesSheetName);
          const modifierRows = rowsFromSheet(modifiersSheetName);
          const recipeRows = rowsFromSheet(recipesSheetName);

          if (rows.length === 0) {
            showToast(lang === 'ar' ? 'الملف فاضي أو لا يحتوي على صفوف صالحة.' : 'The file is empty or has no valid rows.', 'warning');
            return;
          }

          const updateExisting = await confirm({
            title: lang === 'ar' ? 'تحديث الأصناف الموجودة؟' : 'Update existing items?',
            message: lang === 'ar'
              ? 'سيتم تحديث الأصناف عند تطابق ID أو SKU أو Barcode أو الاسم داخل نفس القسم.'
              : 'Existing items will be updated when ID, SKU, Barcode, or same category/name matches.',
            confirmText: lang === 'ar' ? 'تحديث' : 'Update',
            cancelText: lang === 'ar' ? 'إضافة فقط' : 'Add only',
            variant: 'info',
          });

          const preview = await menuApi.importItems({
            rows,
            sizesRows,
            modifierRows,
            recipeRows,
            updateExisting,
            menuId: selectedMenuId || 'menu-1',
            dryRun: true,
          });

          setMenuImportPreview({
            rows,
            sizesRows,
            modifierRows,
            recipeRows,
            updateExisting,
            result: preview,
            fileName: file.name,
          });
        } catch (err: any) {
          showToast(lang === 'ar' ? `فشل استيراد الملف: ${err.message}` : `Import failed: ${err.message}`, 'error');
        } finally {
          setIsImportingMenu(false);
          e.target.value = '';
        }
      };
      reader.onerror = () => {
        setIsImportingMenu(false);
        e.target.value = '';
        showToast(lang === 'ar' ? 'تعذر قراءة ملف Excel.' : 'Could not read the Excel file.', 'error');
      };
      reader.readAsArrayBuffer(file);
    } catch (err: any) {
      setIsImportingMenu(false);
      e.target.value = '';
      showToast(lang === 'ar' ? `فشل استيراد الملف: ${err.message}` : `Import failed: ${err.message}`, 'error');
    }
  };

  const applyMenuImportPreview = async () => {
    if (!menuImportPreview) return;
    setIsApplyingMenuImport(true);
    try {
      const result = await menuApi.importItems({
        rows: menuImportPreview.rows,
        sizesRows: menuImportPreview.sizesRows,
        modifierRows: menuImportPreview.modifierRows,
        recipeRows: menuImportPreview.recipeRows,
        updateExisting: menuImportPreview.updateExisting,
        menuId: selectedMenuId || 'menu-1',
      });

      await fetchMenu();
      setMenuImportPreview(null);

      const message = lang === 'ar'
        ? [
          `تم الاستيراد: ${result.created || 0} صنف جديد`,
          `تم التحديث: ${result.updated || 0} صنف`,
          `أقسام جديدة: ${result.categoriesCreated || 0}`,
          `تم التخطي: ${result.skipped || 0}`,
        ].filter(Boolean).join('\n')
        : [
          `Imported: ${result.created || 0} new items`,
          `Updated: ${result.updated || 0} items`,
          `New categories: ${result.categoriesCreated || 0}`,
          `Skipped: ${result.skipped || 0}`,
        ].filter(Boolean).join('\n');

      showToast(message, (result.errors || []).length > 0 ? 'warning' : 'success', 7000);
    } catch (err: any) {
      showToast(lang === 'ar' ? `فشل تنفيذ الاستيراد: ${err.message}` : `Import apply failed: ${err.message}`, 'error');
    } finally {
      setIsApplyingMenuImport(false);
    }
  };

  // --- HANDLERS ---
  const handleSaveItem = useCallback(() => {
    if (!itemModal) return;
    // Use startTransition so modal closes instantly while store update reconciles in background
    startTransition(() => {
      if (itemModal.mode === 'ADD') {
        addMenuItem(itemModal.menuId, itemModal.categoryId, { ...itemModal.item, id: `item-${Date.now()}` });
      } else {
        updateMenuItem(itemModal.menuId, itemModal.categoryId, itemModal.item);
      }
    });
    setItemModal(null);
  }, [itemModal, addMenuItem, updateMenuItem, startTransition]);

  const handleSaveCategory = useCallback(() => {
    if (!categoryModal) return;
    startTransition(() => {
      if (categoryModal.mode === 'ADD') {
        const newCat: MenuCategory = {
          ...categoryModal.category,
          id: `cat-${Date.now()}`,
          items: []
        };
        addCategory(selectedMenuId, newCat);
      } else {
        updateCategory(categoryModal.category);
      }
    });
    setCategoryModal(null);
  }, [categoryModal, selectedMenuId, addCategory, updateCategory, startTransition]);

  const handleSaveRecipe = useCallback(() => {
    if (!recipeModal) return;
    startTransition(() => {
      const recipes = Array.isArray(recipeModal.item.recipe) ? [...recipeModal.item.recipe] : [];
      const isNewFormat = recipes.length > 0 && recipes[0].ingredients;
      
      let updatedRecipes;
      if (isNewFormat || selectedRecipeSizeId) {
        updatedRecipes = isNewFormat ? recipes : [{ sizeId: null, ingredients: recipes }];
        const idx = updatedRecipes.findIndex(r => r.sizeId === selectedRecipeSizeId);
        if (idx >= 0) {
          updatedRecipes[idx] = { ...updatedRecipes[idx], ingredients: recipeModal.tempRecipe };
        } else {
          updatedRecipes.push({ sizeId: selectedRecipeSizeId, ingredients: recipeModal.tempRecipe });
        }
      } else {
        updatedRecipes = recipeModal.tempRecipe;
      }
      
      updateMenuItem(recipeModal.menuId, recipeModal.categoryId, { ...recipeModal.item, recipe: updatedRecipes });
    });
    setRecipeModal(null);
  }, [recipeModal, updateMenuItem, startTransition, selectedRecipeSizeId]);

  const addIngredientToTemp = () => {
    const quantity = Number(newIngredientQty);
    if (!newIngredientId || !Number.isFinite(quantity) || quantity < 0.001 || !recipeModal) return;
    setRecipeModal(prev => {
      if (!prev) return null;
      const existingIdx = prev.tempRecipe.findIndex(ri => ri.itemId === newIngredientId);
      let nextRecipe = [...prev.tempRecipe];
      const inv = inventory.find(i => i.id === newIngredientId);
      const unit = String(inv?.unit || '');
      if (existingIdx !== -1) nextRecipe[existingIdx] = { ...nextRecipe[existingIdx], quantity: nextRecipe[existingIdx].quantity + quantity };
      else nextRecipe.push({ itemId: newIngredientId, quantity, unit });
      return { ...prev, tempRecipe: nextRecipe };
    });
    setNewIngredientId('');
    setNewIngredientQty('');
  };

  const toggleTarget = (type: 'branch' | 'platform', id: string) => {
    if (!menuSettingsModal) return;
    const key = type === 'branch' ? 'targetBranches' : 'targetPlatforms';
    const current = (menuSettingsModal as any)[key] || [];
    const next = current.includes(id) ? current.filter((cid: string) => cid !== id) : [...current, id];
    setMenuSettingsModal({ ...menuSettingsModal, [key]: next });
  };

  const toggleItemPrinter = (printerId: string) => {
    if (!itemModal) return;
    const currentPrinters = itemModal.item.printerIds || [];
    const nextPrinters = currentPrinters.includes(printerId)
      ? currentPrinters.filter(id => id !== printerId)
      : [...currentPrinters, printerId];
    setItemModal({ ...itemModal, item: { ...itemModal.item, printerIds: nextPrinters } });
  };

  const handleQuickAdd = useCallback((catId: string, name: string, price: string) => {
    if (!selectedMenuId || !name.trim() || !price) return;

    const parsedPrice = parseFloat(price) || 0;
    const category = categories.find(c => c.id === catId);
    const order = category ? category.items.length + 1 : 1;

    const newItem: MenuItem = {
      id: `item-${Date.now()}`,
      name: name.trim(),
      price: parsedPrice,
      categoryId: catId,
      isAvailable: true,
      availableDays: [],
      availableFrom: '',
      availableTo: '',
      modifierGroups: [],
      priceLists: [],
      printerIds: category?.printerIds || [],
      sortOrder: order,
    };

    addMenuItem(selectedMenuId, catId, newItem);
  }, [selectedMenuId, categories, addMenuItem]);

  const toggleCategoryPrinter = (printerId: string) => {
    if (!categoryModal) return;
    const currentPrinters = categoryModal.category.printerIds || [];
    const nextPrinters = currentPrinters.includes(printerId)
      ? currentPrinters.filter(id => id !== printerId)
      : [...currentPrinters, printerId];
    setCategoryModal({ ...categoryModal, category: { ...categoryModal.category, printerIds: nextPrinters } });
  };

  // Stable callbacks for memoized MenuItemCard
  const handleToggleAvailability = useCallback((mId: string, catId: string, item: MenuItem) => {
    updateMenuItem(mId, catId, { ...item, isAvailable: !item.isAvailable });
  }, [updateMenuItem]);

  const handleEditItem = useCallback((mId: string, catId: string, item: MenuItem) => {
    setItemModal({ isOpen: true, mode: 'EDIT', menuId: mId, categoryId: catId, item });
  }, []);

  const handleDeleteItemFromDrawer = useCallback(async () => {
    if (!itemModal || itemModal.mode !== 'EDIT') return;
    const ok = await confirm({
      title: lang === 'ar' ? 'حذف الصنف؟' : 'Delete item?',
      message: lang === 'ar'
        ? `سيتم حذف ${itemModal.item.nameAr || itemModal.item.name} من المنيو.`
        : `${itemModal.item.name} will be deleted from the menu.`,
      confirmText: lang === 'ar' ? 'حذف' : 'Delete',
      cancelText: lang === 'ar' ? 'إلغاء' : 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    await deleteMenuItem(itemModal.menuId, itemModal.categoryId, itemModal.item.id);
    setItemModal(null);
  }, [confirm, deleteMenuItem, itemModal, lang]);

  const handleArchiveItemFromDrawer = useCallback(async () => {
    if (!itemModal || itemModal.mode !== 'EDIT') return;
    const ok = await confirm({
      title: lang === 'ar' ? 'أرشفة الصنف؟' : 'Archive item?',
      message: lang === 'ar'
        ? `سيختفي ${itemModal.item.nameAr || itemModal.item.name} من المنيو النشط ويمكن استعادته لاحقًا.`
        : `${itemModal.item.name} will be hidden from the active menu and can be restored later.`,
      confirmText: lang === 'ar' ? 'أرشفة' : 'Archive',
      cancelText: lang === 'ar' ? 'إلغاء' : 'Cancel',
      variant: 'info',
    });
    if (!ok) return;
    await archiveItem(itemModal.menuId, itemModal.categoryId, itemModal.item.id);
    setItemModal(null);
  }, [archiveItem, confirm, itemModal, lang]);

  const handleDeleteItem = useCallback(async (menuId: string, categoryId: string, itemId: string) => {
    const category = categories.find(cat => cat.id === categoryId);
    const item = category?.items.find(i => i.id === itemId);
    const ok = await confirm({
      title: lang === 'ar' ? 'حذف الصنف؟' : 'Delete item?',
      message: lang === 'ar'
        ? `سيتم حذف ${item?.nameAr || item?.name || 'هذا الصنف'} من المنيو.`
        : `${item?.name || 'This item'} will be deleted from the menu.`,
      confirmText: lang === 'ar' ? 'حذف' : 'Delete',
      cancelText: lang === 'ar' ? 'إلغاء' : 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    deleteMenuItem(menuId, categoryId, itemId);
  }, [categories, confirm, deleteMenuItem, lang]);

  const handleDeleteCategory = useCallback(async (menuId: string, categoryId: string) => {
    const category = categories.find(cat => cat.id === categoryId);
    const ok = await confirm({
      title: lang === 'ar' ? 'حذف المجموعة؟' : 'Delete section?',
      message: lang === 'ar'
        ? `سيتم حذف ${category?.nameAr || category?.name || 'هذه المجموعة'} من المنيو.`
        : `${category?.name || 'This section'} will be deleted from the menu.`,
      confirmText: lang === 'ar' ? 'حذف' : 'Delete',
      cancelText: lang === 'ar' ? 'إلغاء' : 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    deleteCategory(menuId, categoryId);
  }, [categories, confirm, deleteCategory, lang]);

  const handleOpenRecipe = useCallback((mId: string, catId: string, item: MenuItem) => {
    const recipes = Array.isArray(item.recipe) ? item.recipe : [];
    const isNewFormat = recipes.length > 0 && recipes[0].ingredients;
    
    let initialRecipe = recipes;
    if (isNewFormat) {
      initialRecipe = recipes.find(r => r.sizeId === null)?.ingredients || [];
    }
    
    setRecipeModal({ isOpen: true, menuId: mId, categoryId: catId, item, tempRecipe: initialRecipe });
    setSelectedRecipeSizeId(null);
  }, []);

  const handleEditCategory = useCallback((category: MenuCategory) => {
    setCategoryModal({ isOpen: true, mode: 'EDIT', category });
  }, []);

  const dayOptions = [
    { id: 'mon', en: 'Mon', ar: 'الاثنين' },
    { id: 'tue', en: 'Tue', ar: 'الثلاثاء' },
    { id: 'wed', en: 'Wed', ar: 'الأربعاء' },
    { id: 'thu', en: 'Thu', ar: 'الخميس' },
    { id: 'fri', en: 'Fri', ar: 'الجمعة' },
    { id: 'sat', en: 'Sat', ar: 'السبت' },
    { id: 'sun', en: 'Sun', ar: 'الأحد' }
  ];

  const toggleItemDay = (dayId: string) => {
    if (!itemModal) return;
    const current = itemModal.item.availableDays || [];
    const next = current.includes(dayId) ? current.filter(d => d !== dayId) : [...current, dayId];
    setItemModal({ ...itemModal, item: { ...itemModal.item, availableDays: next } });
  };

  const addModifierGroup = () => {
    if (!itemModal) return;
    const nextGroup = {
      id: `mod-${Date.now()}`,
      name: '',
      minSelection: 0,
      maxSelection: 1,
      options: []
    };
    const groups = itemModal.item.modifierGroups || [];
    setItemModal({ ...itemModal, item: { ...itemModal.item, modifierGroups: [...groups, nextGroup] } });
  };

  const updateModifierGroup = (groupId: string, updates: Partial<ModifierGroup>) => {
    if (!itemModal) return;
    const groups = (itemModal.item.modifierGroups || []).map(group =>
      group.id === groupId ? { ...group, ...updates } : group
    );
    setItemModal({ ...itemModal, item: { ...itemModal.item, modifierGroups: groups } });
  };

  const removeModifierGroup = (groupId: string) => {
    if (!itemModal) return;
    const groups = (itemModal.item.modifierGroups || []).filter(group => group.id !== groupId);
    setItemModal({ ...itemModal, item: { ...itemModal.item, modifierGroups: groups } });
  };

  const addModifierOption = (groupId: string) => {
    if (!itemModal) return;
    const groups = (itemModal.item.modifierGroups || []).map(group => {
      if (group.id !== groupId) return group;
      const nextOption = { id: `opt-${Date.now()}`, name: '', price: 0 };
      return { ...group, options: [...(group.options || []), nextOption] };
    });
    setItemModal({ ...itemModal, item: { ...itemModal.item, modifierGroups: groups } });
  };

  const updateModifierOption = (groupId: string, optionId: string, updates: Partial<ModifierOption>) => {
    if (!itemModal) return;
    const groups = (itemModal.item.modifierGroups || []).map(group => {
      if (group.id !== groupId) return group;
      return {
        ...group,
        options: (group.options || []).map(option => option.id === optionId ? { ...option, ...updates } : option)
      };
    });
    setItemModal({ ...itemModal, item: { ...itemModal.item, modifierGroups: groups } });
  };

  const removeModifierOption = (groupId: string, optionId: string) => {
    if (!itemModal) return;
    const groups = (itemModal.item.modifierGroups || []).map(group => {
      if (group.id !== groupId) return group;
      return { ...group, options: (group.options || []).filter(option => option.id !== optionId) };
    });
    setItemModal({ ...itemModal, item: { ...itemModal.item, modifierGroups: groups } });
  };

  const addPriceList = () => {
    if (!itemModal) return;
    const nextList = { name: '', price: 0, branchIds: [] as string[] };
    const lists = itemModal.item.priceLists || [];
    setItemModal({ ...itemModal, item: { ...itemModal.item, priceLists: [...lists, nextList] } });
  };

  const updatePriceList = (index: number, updates: { name?: string; price?: number; branchIds?: string[] }) => {
    if (!itemModal) return;
    const lists = (itemModal.item.priceLists || []).map((list, i) => i === index ? { ...list, ...updates } : list);
    setItemModal({ ...itemModal, item: { ...itemModal.item, priceLists: lists } });
  };

  const removePriceList = (index: number) => {
    if (!itemModal) return;
    const lists = (itemModal.item.priceLists || []).filter((_, i) => i !== index);
    setItemModal({ ...itemModal, item: { ...itemModal.item, priceLists: lists } });
  };

  const togglePriceListBranch = (index: number, branchId: string) => {
    if (!itemModal) return;
    const lists = itemModal.item.priceLists || [];
    const current = lists[index]?.branchIds || [];
    const next = current.includes(branchId) ? current.filter(id => id !== branchId) : [...current, branchId];
    updatePriceList(index, { branchIds: next });
  };

  // 🔄 Loading State
  if (isLoading && categories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-app">
        <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
        <p className="text-muted font-bold uppercase tracking-widest text-sm">
          {lang === 'ar' ? 'جاري تحميل بيانات المنيو...' : 'Loading menu data...'}
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-10 min-h-screen bg-app transition-colors animate-fade-in pb-24 relative z-10">
      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-[1.5rem] text-rose-500 text-sm font-bold flex items-center gap-3  shadow-lg shadow-rose-500/5">
          <AlertCircle size={20} />
          {lang === 'ar' ? 'خطأ في تحميل البيانات: ' : 'Error loading data: '}{error}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-10 relative z-20">
        <div>
          <h2 className="text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-cyan-500 uppercase tracking-tighter flex items-center gap-4 drop-shadow-sm">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 rounded-[1.5rem] flex items-center justify-center border border-indigo-500/30 text-indigo-500 shrink-0 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
              <UtensilsCrossed size={24} />
            </div>
            {lang === 'ar' ? 'إدارة المنيو' : 'Menu Catalog'}
            {isLoading && <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />}
          </h2>
          <p className="text-sm md:text-base text-muted font-bold tracking-wide mt-2">
            {lang === 'ar' ? 'هندس وصفاتك لزيادة المبيعات والأرباح' : 'Engineer your recipes for maximum profit'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 w-full xl:w-auto items-center">
          <label className={`flex items-center justify-center gap-2 bg-emerald-500/10 text-emerald-500 px-5 py-4 rounded-[1.5rem] font-black text-[11px] uppercase tracking-[0.2em] border border-emerald-500/30 hover:bg-emerald-500 hover:text-white transition-all shadow-sm active:scale-95 cursor-pointer ${isImportingMenu ? 'opacity-60 pointer-events-none' : ''}`}>
            {isImportingMenu ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {lang === 'ar' ? 'استيراد إكسل' : 'Import Excel'}
            <input type="file" accept=".xlsx,.xls" onChange={handleImportExcel} className="hidden" disabled={isImportingMenu} />
          </label>
          <button onClick={handleExportExcel} className="flex items-center justify-center gap-2 bg-card/50 text-main px-5 py-4 rounded-[1.5rem] font-black text-[11px] uppercase tracking-[0.2em] border border-border/20 hover:border-indigo-500/30 hover:text-indigo-400 transition-all shadow-sm active:scale-95">
            <ArrowRight size={16} /> {lang === 'ar' ? 'تصدير إكسل' : 'Export Excel'}
          </button>
          
          <div className="w-px h-10 bg-border/40 mx-2 hidden sm:block"></div>

          <button
            onClick={() => setCategoryModal({
              isOpen: true,
              mode: 'ADD',
              category: { id: '', name: '', items: [], menuIds: [selectedMenuId], targetOrderTypes: [], printerIds: [] }
            })}
            className="flex items-center justify-center gap-2 bg-card/50 text-main px-6 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] border border-border/20 hover:border-indigo-500/30 hover:text-indigo-400 transition-all shadow-sm active:scale-95 group"
          >
            <Plus size={18} className="group-hover:rotate-90 transition-transform duration-150" />
            {lang === 'ar' ? 'مجموعة جديدة' : 'New Section'}
          </button>

          <button
            onClick={() => setItemModal({
              isOpen: true,
              mode: 'ADD',
              menuId: selectedMenuId,
              categoryId: filteredCategories[0]?.id || '',
              item: { id: '', name: '', price: 0, categoryId: '', isAvailable: true, availableDays: [], availableFrom: '', availableTo: '', modifierGroups: [], priceLists: [], printerIds: [] }
            })}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white px-6 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] shadow-[0_10px_20px_rgba(99,102,241,0.2)] hover:shadow-[0_15px_30px_rgba(99,102,241,0.3)] hover:-translate-y-0.5 transition-all outline-none border border-indigo-400/30"
            disabled={filteredCategories.length === 0}
          >
            <UtensilsCrossed size={18} />
            {lang === 'ar' ? 'صنف جديد' : 'New Item'}
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-6 mb-10 relative z-20">
        <div className="flex bg-card/50  p-2 rounded-[2rem] shadow-inner border border-border/20 shrink-0 self-start">
          <button onClick={() => setActiveTab('MENUS')} className={`px-8 py-3.5 rounded-[1.5rem] font-black text-[10px] md:text-xs uppercase tracking-[0.2em] transition-all duration-150 ${activeTab === 'MENUS' ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-lg shadow-indigo-500/30 scale-105 border border-indigo-400/30' : 'text-muted hover:text-main hover:bg-elevated/40'}`}>
            <LayoutGrid size={16} className="inline mr-2" /> {lang === 'ar' ? 'المنيوهات النشطة' : 'Active Menus'}
          </button>
          <button onClick={() => setActiveTab('OFFERS')} className={`px-8 py-3.5 rounded-[1.5rem] font-black text-[10px] md:text-xs uppercase tracking-[0.2em] transition-all duration-150 ${activeTab === 'OFFERS' ? 'bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-lg shadow-orange-500/30 scale-105 border border-orange-400/30' : 'text-muted hover:text-main hover:bg-elevated/40'}`}>
            <Gift size={16} className="inline mr-2" /> {lang === 'ar' ? 'العروض' : 'Offers'}
          </button>
        </div>
        <div className="relative flex-1 lg:max-w-md group">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-[1.5rem] blur-md opacity-20 group-focus-within:opacity-40 transition-opacity duration-150" />
          <div className="relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-muted w-5 h-5 group-focus-within:text-indigo-500 transition-colors z-10" />
            <input type="text" placeholder={lang === 'ar' ? 'ابحث في الأصناف...' : 'Search items...'} value={searchQuery} onChange={(e) => handleSearchChange(e.target.value)} className="w-full pl-14 pr-6 py-4 bg-card/60  border border-border/30 rounded-[1.5rem] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all shadow-inner font-bold text-sm text-main placeholder:text-muted/50" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-20">
        {/* Sidebar */}
        <div className="lg:col-span-3 space-y-4">
          {menus.map(menu => (
            <div key={menu.id} className="relative group">
              <button
                onClick={() => setSelectedMenuId(menu.id)}
                className={`w-full text-left p-6 rounded-[2.5rem] border  transition-all duration-150 hover:shadow-2xl overflow-hidden relative ${selectedMenuId === menu.id ? 'bg-card/80 border-indigo-500/50 text-white shadow-[0_15px_40px_rgba(99,102,241,0.2)] translate-x-2' : 'bg-card/40 border-border/20 hover:bg-card/60 hover:border-indigo-500/30 shadow-lg'}`}
              >
                {selectedMenuId === menu.id && (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-cyan-500/5 pointer-events-none" />
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 rounded-full blur-[50px] pointer-events-none" />
                  </>
                )}
                <div className="flex justify-between items-center mb-3 relative z-10">
                  <span className={`font-black text-xl tracking-tight truncate pr-6 transition-colors ${selectedMenuId === menu.id ? 'text-white drop-shadow-sm' : 'text-main'}`}>{menu.name}</span>
                  {menu.isDefault && <div className={`w-3 h-3 rounded-full border-2 border-transparent ${selectedMenuId === menu.id ? 'bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)] border-border/40' : 'bg-indigo-500 shadow-sm'} animate-pulse`} />}
                </div>
                <div className="flex flex-wrap gap-2 items-center mt-3 relative z-10">
                  <span className={`text-[9px] font-black uppercase tracking-[0.2em] px-2.5 py-1 rounded-lg border ${selectedMenuId === menu.id ? 'bg-indigo-500 text-white border-indigo-400/50 shadow-inner' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'}`}>{menu.status}</span>
                  {(menu.targetPlatforms?.length || 0) > 0 && <span className={`text-[9px] font-black tracking-[0.2em] px-2.5 py-1 rounded-lg border ${selectedMenuId === menu.id ? 'bg-indigo-500/50 text-white border-indigo-400/30' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>{menu.targetPlatforms?.length} Apps</span>}
                  {(menu.targetBranches?.length || 0) > 0 && <span className={`text-[9px] font-black tracking-[0.2em] px-2.5 py-1 rounded-lg border ${selectedMenuId === menu.id ? 'bg-indigo-500/50 text-white border-indigo-400/30' : 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20'}`}>{menu.targetBranches?.length} Br.</span>}
                </div>
              </button>
              <button
                onClick={() => {
                  setRenamingMenu(menu);
                  setRenameValue(menu.name || '');
                }}
                className={`absolute top-6 right-6 p-2.5 opacity-0 group-hover:opacity-100 transition-all rounded-[1rem] shadow-lg hover:scale-110 active:scale-95 border  z-20 ${selectedMenuId === menu.id ? 'bg-indigo-400/20 text-white border-indigo-300/30 hover:bg-indigo-400/40' : 'bg-card/80 border-border/30 text-indigo-400 hover:bg-indigo-500/10 hover:border-indigo-500/30'}`}
              >
                <Edit3 size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* Categories & Items — Memoized to prevent re-render on modal state changes */}
        <div className="lg:col-span-9 space-y-12">
          <MenuCategoryList
            categories={filteredCategories}
            selectedMenuId={selectedMenuId}
            lang={lang}
            currencySymbol={settings.currencySymbol}
            onEditCategory={handleEditCategory}
            onDeleteCategory={handleDeleteCategory}
            onToggleAvailability={handleToggleAvailability}
            onEditItem={handleEditItem}
            onRecipeItem={handleOpenRecipe}
            onDeleteItem={handleDeleteItem}
            onQuickAdd={handleQuickAdd}
          />

          {/* Link Existing */}
          {otherCategories.length > 0 && !showAddExistingCategory && (
            <button onClick={() => setShowAddExistingCategory(true)} className="w-full py-8 border-2 border-dashed border-border rounded-[2.5rem] flex flex-col items-center justify-center gap-2 text-muted hover:text-primary transition-all font-black text-xs uppercase tracking-widest"><Layers size={32} /> Link Existing Group</button>
          )}

          {showAddExistingCategory && (
            <div className="p-8 bg-primary/10 dark:bg-primary rounded-[2.5rem] border border-primary/20 dark:border-border animate-in slide-in-from-bottom duration-150">
              <div className="flex justify-between items-center mb-6"><h4 className="text-sm font-black text-primary uppercase tracking-widest">Available to link</h4><button onClick={() => setShowAddExistingCategory(false)} className="text-muted hover:text-muted font-bold text-xs uppercase">Close</button></div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {otherCategories.map(cat => (
                  <button key={cat.id} onClick={() => { linkCategory(selectedMenuId, cat.id); setShowAddExistingCategory(false); }} className="p-4 bg-card dark:bg-elevated rounded-2xl border border-border hover:border-primary/40 transition-all text-left">
                    <p className="font-black text-xs text-main">{cat.name}</p>
                    <p className="text-[9px] font-bold text-muted uppercase">{cat.items.length} Items</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SMART IMPORT PREVIEW MODAL */}
      {menuImportPreview && (
        <div className="fixed inset-0 bg-slate-950/90 flex items-center justify-center z-[120] p-4 animate-in fade-in duration-150">
          <div className="bg-card w-full max-w-5xl rounded-[2rem] shadow-[0_30px_70px_rgba(0,0,0,0.55)] border border-border/30 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-border/20 flex items-center justify-between bg-elevated/40">
              <div className="flex items-center gap-4 min-w-0">
                <div className="p-3 rounded-[1rem] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Info size={22} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xl font-black text-main uppercase tracking-tight">
                    {lang === 'ar' ? 'معاينة استيراد المنيو' : 'Menu Import Preview'}
                  </h3>
                  <p className="text-[10px] font-black text-muted uppercase tracking-[0.18em] truncate mt-1">
                    {menuImportPreview.fileName} · {menuImportPreview.rows.length} {lang === 'ar' ? 'صف' : 'rows'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setMenuImportPreview(null)}
                disabled={isApplyingMenuImport}
                className="p-3 bg-card/60 text-muted hover:text-rose-400 border border-border/20 hover:border-rose-500/30 rounded-2xl transition-all active:scale-95 disabled:opacity-50"
              >
                <X size={22} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: lang === 'ar' ? 'جديد' : 'Create', value: menuImportPreview.result.created || 0, tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
                  { label: lang === 'ar' ? 'تحديث' : 'Update', value: menuImportPreview.result.updated || 0, tone: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
                  { label: lang === 'ar' ? 'أقسام' : 'Categories', value: menuImportPreview.result.categoriesCreated || 0, tone: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
                  { label: lang === 'ar' ? 'تخطي' : 'Skipped', value: menuImportPreview.result.skipped || 0, tone: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
                ].map((metric) => (
                  <div key={metric.label} className={`rounded-[1.25rem] border p-4 ${metric.tone}`}>
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] opacity-80">{metric.label}</p>
                    <p className="text-3xl font-black mt-2 tabular-nums">{metric.value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-[1.5rem] border border-border/20 bg-elevated/30 p-5 space-y-3">
                <div className="flex items-center gap-2 text-main">
                  <CheckCircle2 size={18} className="text-emerald-400" />
                  <p className="text-xs font-black uppercase tracking-[0.18em]">
                    {menuImportPreview.updateExisting
                      ? (lang === 'ar' ? 'سيتم تحديث الأصناف المتطابقة' : 'Matching items will be updated')
                      : (lang === 'ar' ? 'الأصناف المتطابقة سيتم تخطيها' : 'Matching items will be skipped')}
                  </p>
                </div>
                <p className="text-xs font-bold text-muted leading-relaxed">
                  {lang === 'ar'
                    ? 'المعاينة لم تحفظ أي بيانات بعد. التنفيذ يبدأ فقط عند الضغط على تطبيق الاستيراد.'
                    : 'No data has been saved yet. Changes are applied only when you confirm this import.'}
                </p>
              </div>

              {(menuImportPreview.result.details || []).length > 0 && (
                <div className="rounded-[1.5rem] border border-border/20 bg-elevated/20 overflow-hidden">
                  <div className="p-4 border-b border-border/20 flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-[0.18em] text-main">
                        {lang === 'ar' ? 'تفاصيل الصفوف' : 'Row Decisions'}
                      </h4>
                      <p className="text-[10px] font-bold text-muted mt-1">
                        {lang === 'ar' ? 'راجع قرار كل صف قبل تنفيذ الاستيراد.' : 'Review each row before applying the import.'}
                      </p>
                    </div>
                    <span className="text-[10px] font-black text-muted uppercase tracking-[0.16em] tabular-nums">
                      {(menuImportPreview.result.details || []).length}/{menuImportPreview.rows.length}
                    </span>
                  </div>
                  <div className="max-h-72 overflow-auto">
                    <table className="w-full min-w-[760px] text-left">
                      <thead className="sticky top-0 bg-card/95 border-b border-border/20">
                        <tr className="text-[9px] font-black uppercase tracking-[0.18em] text-muted">
                          <th className="px-4 py-3">{lang === 'ar' ? 'صف' : 'Row'}</th>
                          <th className="px-4 py-3">{lang === 'ar' ? 'قرار' : 'Action'}</th>
                          <th className="px-4 py-3">{lang === 'ar' ? 'الصنف' : 'Item'}</th>
                          <th className="px-4 py-3">{lang === 'ar' ? 'القسم' : 'Category'}</th>
                          <th className="px-4 py-3">SKU</th>
                          <th className="px-4 py-3">{lang === 'ar' ? 'السعر' : 'Price'}</th>
                          <th className="px-4 py-3">{lang === 'ar' ? 'ملاحظة' : 'Note'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/10">
                        {(menuImportPreview.result.details || []).map((detail: any, index: number) => {
                          const actionClass = detail.action === 'create'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : detail.action === 'update'
                              ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                              : detail.action === 'error'
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                          return (
                            <tr key={`${detail.rowNumber}-${index}`} className="text-xs font-bold text-main hover:bg-white/[0.03] transition-colors">
                              <td className="px-4 py-3 text-muted tabular-nums">{detail.rowNumber}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-[0.16em] ${actionClass}`}>
                                  {detail.action}
                                </span>
                              </td>
                              <td className="px-4 py-3 max-w-[220px] truncate">{detail.name || '-'}</td>
                              <td className="px-4 py-3 max-w-[180px] truncate">
                                {detail.categoryName || '-'}
                                {detail.categoryCreated && (
                                  <span className="ml-2 text-[9px] text-indigo-400 uppercase tracking-[0.14em]">
                                    {lang === 'ar' ? 'جديد' : 'new'}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-muted max-w-[140px] truncate">{detail.sku || detail.barcode || '-'}</td>
                              <td className="px-4 py-3 tabular-nums">{Number.isFinite(Number(detail.price)) ? Number(detail.price).toFixed(2) : '-'}</td>
                              <td className="px-4 py-3 text-muted max-w-[280px] truncate" title={detail.message || ''}>{detail.message || '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {((menuImportPreview.result.errors || []).length > 0 || (menuImportPreview.result.warnings || []).length > 0) && (
                <div className="grid md:grid-cols-2 gap-4">
                  {(menuImportPreview.result.errors || []).length > 0 && (
                    <div className="rounded-[1.5rem] border border-rose-500/20 bg-rose-500/10 p-5">
                      <div className="flex items-center gap-2 text-rose-400 mb-3">
                        <AlertCircle size={18} />
                        <p className="text-xs font-black uppercase tracking-[0.18em]">{lang === 'ar' ? 'أخطاء' : 'Errors'}</p>
                      </div>
                      <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                        {(menuImportPreview.result.errors || []).slice(0, 8).map((error: string, index: number) => (
                          <p key={index} className="text-xs font-bold text-rose-200 leading-relaxed">{error}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {(menuImportPreview.result.warnings || []).length > 0 && (
                    <div className="rounded-[1.5rem] border border-amber-500/20 bg-amber-500/10 p-5">
                      <div className="flex items-center gap-2 text-amber-400 mb-3">
                        <AlertCircle size={18} />
                        <p className="text-xs font-black uppercase tracking-[0.18em]">{lang === 'ar' ? 'تنبيهات' : 'Warnings'}</p>
                      </div>
                      <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                        {(menuImportPreview.result.warnings || []).slice(0, 8).map((warning: string, index: number) => (
                          <p key={index} className="text-xs font-bold text-amber-100 leading-relaxed">{warning}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-border/20 bg-elevated/30 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setMenuImportPreview(null)}
                disabled={isApplyingMenuImport}
                className="flex-1 py-4 bg-card/60 text-muted rounded-[1.2rem] font-black uppercase text-[10px] tracking-[0.2em] border border-border/20 hover:bg-card hover:text-main transition-all active:scale-95 disabled:opacity-50"
              >
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={applyMenuImportPreview}
                disabled={isApplyingMenuImport || ((menuImportPreview.result.created || 0) + (menuImportPreview.result.updated || 0) === 0)}
                className="flex-[2] py-4 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white rounded-[1.2rem] font-black uppercase text-[10px] tracking-[0.2em] shadow-[0_10px_20px_rgba(99,102,241,0.2)] hover:shadow-[0_15px_30px_rgba(99,102,241,0.3)] hover:-translate-y-0.5 border border-indigo-400/30 transition-all active:scale-95 disabled:opacity-50 disabled:hover:translate-y-0 flex items-center justify-center gap-2"
              >
                {isApplyingMenuImport && <Loader2 size={16} className="animate-spin" />}
                {lang === 'ar' ? 'تطبيق الاستيراد' : 'Apply Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MENU SETTINGS MODAL */}
      {menuSettingsModal && (
        <div className="fixed inset-0 bg-slate-950/90 flex items-center justify-center z-[110] p-4 animate-in fade-in duration-150">
          <div className="bg-card w-full max-w-2xl rounded-[3rem] shadow-[0_30px_60px_rgba(0,0,0,0.5)] border border-border/30 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-cyan-500/5 pointer-events-none" />
            <div className="p-8 border-b border-border/20 flex justify-between items-center bg-elevated/40  relative z-10">
              <div className="flex items-center gap-5">
                <div className="p-4 bg-gradient-to-br from-indigo-500 to-cyan-500 text-white rounded-[1.2rem] shadow-[0_10px_20px_rgba(99,102,241,0.3)] border border-border/40">
                  <Settings size={28} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-main uppercase tracking-tight drop-shadow-sm">Menu Targets</h3>
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mt-1">Where should this menu appear?</p>
                </div>
              </div>
              <button onClick={() => setMenuSettingsModal(null)} className="p-3 bg-card/60  text-muted hover:text-rose-400 border border-border/20 hover:border-rose-500/30 rounded-2xl transition-all shadow-sm active:scale-95"><X size={24} /></button>
            </div>
            <div className="p-8 space-y-8 overflow-y-auto no-scrollbar relative z-10">
              <div className="space-y-4">
                <h4 className="flex items-center gap-2 text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-4"><Building2 size={16} /> Active Branches</h4>
                <div className="grid grid-cols-2 gap-4">
                  {branches.map(b => (
                    <button key={b.id} onClick={() => toggleTarget('branch', b.id)} className={`p-5 rounded-[1.5rem] border transition-all duration-150 text-left flex items-center justify-between group ${menuSettingsModal.targetBranches?.includes(b.id) ? 'bg-gradient-to-r from-indigo-500/20 to-indigo-500/5 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.15)] ' : 'bg-elevated/40 border-border/20 hover:border-indigo-500/30 hover:bg-elevated/60  shadow-inner'}`}>
                      <span className={`font-black text-xs uppercase tracking-wider transition-colors ${menuSettingsModal.targetBranches?.includes(b.id) ? 'text-indigo-400' : 'text-muted group-hover:text-main'}`}>{b.name}</span>
                      {menuSettingsModal.targetBranches?.includes(b.id) && <CheckCircle2 size={20} className="text-indigo-400 drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]" />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <h4 className="flex items-center gap-2 text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-4"><Globe size={16} /> Delivery Platforms</h4>
                <div className="grid grid-cols-2 gap-4">
                  {platforms.map(p => (
                    <button key={p.id} onClick={() => toggleTarget('platform', p.id)} className={`p-5 rounded-[1.5rem] border transition-all duration-150 text-left flex items-center justify-between group ${menuSettingsModal.targetPlatforms?.includes(p.id) ? 'bg-gradient-to-r from-emerald-500/20 to-emerald-500/5 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)] ' : 'bg-elevated/40 border-border/20 hover:border-emerald-500/30 hover:bg-elevated/60  shadow-inner'}`}>
                      <span className={`font-black text-xs uppercase tracking-wider transition-colors ${menuSettingsModal.targetPlatforms?.includes(p.id) ? 'text-emerald-400' : 'text-muted group-hover:text-main'}`}>{p.name}</span>
                      {menuSettingsModal.targetPlatforms?.includes(p.id) && <CheckCircle2 size={20} className="text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-6 bg-gradient-to-br from-amber-500/10 to-amber-500/5 rounded-[2rem] border border-amber-500/20  shadow-inner">
                <div className="flex items-center gap-3 text-amber-500 mb-3 font-black text-[10px] uppercase tracking-[0.2em]"><AlertCircle size={18} /> Instant Sync Notice</div>
                <p className="text-sm text-amber-500/80 font-bold leading-relaxed">Changes to targets will sync instantly with the respective POS or Application APIs. Ensure branches are ready to process orders before enabling.</p>
              </div>
            </div>
            <div className="p-6 border-t border-border/20 bg-elevated/40  flex gap-4 relative z-10">
              <button onClick={() => setMenuSettingsModal(null)} className="flex-1 py-4 bg-card/60  text-muted rounded-[1.2rem] font-black uppercase text-[10px] tracking-[0.2em] border border-border/20 hover:bg-card hover:text-main transition-all active:scale-95 shadow-sm">Cancel</button>
              <button onClick={() => { updateMenu(menuSettingsModal); setMenuSettingsModal(null); }} className="flex-[2] py-4 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white rounded-[1.2rem] font-black uppercase text-[10px] tracking-[0.2em] shadow-[0_10px_20px_rgba(99,102,241,0.2)] hover:shadow-[0_15px_30px_rgba(99,102,241,0.3)] hover:-translate-y-0.5 border border-indigo-400/30 transition-all active:scale-95">Apply Configuration</button>
            </div>
          </div>
        </div>
      )}

      {itemModal && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/85 ">
              <div className="flex items-center gap-3 rounded-full border border-border/20 bg-card/70 px-6 py-3 text-sm font-black text-main shadow-2xl">
                <Loader2 size={18} className="animate-spin text-indigo-400" />
                Preparing editor...
              </div>
            </div>
          }
        >
          <ItemDrawer
            item={itemModal.item}
            mode={itemModal.mode}
            categoryId={itemModal.categoryId}
            categories={categories}
            printers={printers}
            branches={branches}
            inventory={inventory}
            lang={lang}
            currency={settings.currencySymbol || 'EGP'}
            onClose={() => setItemModal(null)}
            onDelete={itemModal.mode === 'EDIT' ? handleDeleteItemFromDrawer : undefined}
            onArchive={itemModal.mode === 'EDIT' ? handleArchiveItemFromDrawer : undefined}
            onSave={async (nextItem, nextCategoryId, keepOpen) => {
              if (itemModal.mode === 'ADD') {
                await addMenuItem(itemModal.menuId, nextCategoryId, { ...nextItem, id: `item-${Date.now()}`, isAvailable: nextItem.isAvailable !== false });
              } else if (nextCategoryId !== itemModal.categoryId) {
                await deleteMenuItem(itemModal.menuId, itemModal.categoryId, itemModal.item.id);
                await addMenuItem(itemModal.menuId, nextCategoryId, { ...nextItem, categoryId: nextCategoryId, isAvailable: nextItem.isAvailable !== false });
              } else {
                await updateMenuItem(itemModal.menuId, nextCategoryId, { ...nextItem, categoryId: nextCategoryId, isAvailable: nextItem.isAvailable !== false });
              }
              if (keepOpen) {
                setItemModal(prev => prev ? { ...prev, mode: 'ADD' } : null);
              } else {
                setItemModal(null);
              }
            }}
          />
        </Suspense>
      )}

      {/* CATEGORY MODAL */}
      {categoryModal && (
        <div className="fixed inset-0 bg-slate-950/90 flex items-center justify-center z-[110] p-4 animate-in fade-in zoom-in duration-150">
          <div className="bg-card w-full max-w-2xl rounded-[3rem] shadow-[0_30px_60px_rgba(0,0,0,0.5)] border border-border/30 overflow-hidden flex flex-col max-h-[95vh] relative text-main">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-cyan-500/5 pointer-events-none" />
            <div className="p-8 border-b border-border/20 flex justify-between items-center bg-elevated/40  relative z-10">
              <div className="flex items-center gap-5">
                <div className="p-4 bg-gradient-to-br from-indigo-500 to-cyan-500 text-white rounded-[1.2rem] shadow-[0_10px_20px_rgba(99,102,241,0.3)] border border-border/40">
                  <Layers size={28} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-main uppercase tracking-tight drop-shadow-sm">{categoryModal.mode === 'ADD' ? (lang === 'ar' ? 'قسم جديد' : 'New Section') : (lang === 'ar' ? 'تعديل قسم' : 'Edit Section')}</h3>
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mt-1">{lang === 'ar' ? 'إعداد المجموعة والظهور' : 'Configure group & visibility'}</p>
                </div>
              </div>
              <button onClick={() => setCategoryModal(null)} className="p-3 bg-card/60  text-muted rounded-[1rem] shadow-sm hover:text-rose-400 border border-border/20 hover:border-rose-500/30 hover:rotate-90 transition-all active:scale-95"><X size={28} /></button>
            </div>

            <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto no-scrollbar relative z-10">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="group/input space-y-2">
                  <label className="text-[10px] font-black text-muted uppercase tracking-[0.2em] ml-1 group-focus-within/input:text-indigo-400 transition-colors">{lang === 'ar' ? 'الاسم (EN)' : 'Name (English)'}</label>
                  <input type="text" value={categoryModal.category.name} onChange={(e) => setCategoryModal({ ...categoryModal, category: { ...categoryModal.category, name: e.target.value } })} className="w-full p-5 bg-elevated/40  rounded-[1.2rem] font-bold text-main border border-border/20 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none shadow-inner text-sm" placeholder="e.g. Burgers" />
                </div>
                <div className="group/input space-y-2">
                  <label className="text-[10px] font-black text-muted uppercase tracking-[0.2em] ml-1 group-focus-within/input:text-indigo-400 transition-colors">{lang === 'ar' ? 'الاسم (AR)' : 'Name (Arabic)'}</label>
                  <input type="text" value={categoryModal.category.nameAr || ''} onChange={(e) => setCategoryModal({ ...categoryModal, category: { ...categoryModal.category, nameAr: e.target.value } })} className="w-full p-5 bg-elevated/40  rounded-[1.2rem] font-bold text-main text-right border border-border/20 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none shadow-inner text-sm" placeholder="مثال: شاورما" />
                </div>
              </div>

              <div className="space-y-4">
                <ImageUploader
                  value={categoryModal.category.image || ''}
                  onChange={(url) => setCategoryModal({ ...categoryModal, category: { ...categoryModal.category, image: url } })}
                  type="category"
                  label={lang === 'ar' ? 'صورة القسم' : 'Category Image'}
                  lang={lang}
                />
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] ml-1 flex items-center gap-2"><LayoutGrid size={14} /> {lang === 'ar' ? 'طرق الطلب المتاحة' : 'Available Order Modes'}</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { id: 'DINE_IN', icon: UtensilsCrossed, label: 'Dine In' },
                    { id: 'TAKEAWAY', icon: ShoppingBag, label: 'Takeaway' },
                    { id: 'PICKUP', icon: Map, label: 'Pickup' },
                    { id: 'DELIVERY', icon: Truck, label: 'Delivery' }
                  ].map(mode => {
                    const isSelected = categoryModal.category.targetOrderTypes?.includes(mode.id as any);
                    return (
                      <button
                        key={mode.id}
                        onClick={() => {
                          const types = categoryModal.category.targetOrderTypes || [];
                          const newTypes = types.includes(mode.id as any)
                            ? types.filter(t => t !== mode.id)
                            : [...types, mode.id];
                          setCategoryModal({ ...categoryModal, category: { ...categoryModal.category, targetOrderTypes: newTypes as any } });
                        }}
                        className={`p-5 rounded-[1.5rem] border transition-all duration-150 flex flex-col items-center gap-3 ${isSelected ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.15)] shadow-inner' : 'border-border/20 bg-elevated/30 text-muted hover:border-indigo-500/30 hover:text-main'}`}
                      >
                        <mode.icon size={24} />
                        <span className="text-[9px] font-black uppercase tracking-[0.15em] text-center">{mode.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] ml-1 flex items-center gap-2"><Layers size={14} /> {lang === 'ar' ? 'المنيوهات المرتبطة' : 'Linked Menus'}</label>
                <div className="flex flex-wrap gap-3">
                  {menus.map(menu => {
                    const isLinked = categoryModal.category.menuIds.includes(menu.id);
                    return (
                      <button
                        key={menu.id}
                        onClick={() => {
                          const ids = categoryModal.category.menuIds;
                          const newIds = ids.includes(menu.id) ? ids.filter(id => id !== menu.id) : [...ids, menu.id];
                          setCategoryModal({ ...categoryModal, category: { ...categoryModal.category, menuIds: newIds } });
                        }}
                        className={`px-5 py-3 rounded-[1rem] text-[10px] font-black uppercase tracking-[0.2em] border transition-all ${isLinked ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 border-indigo-400/30 text-white shadow-[0_5px_15px_rgba(99,102,241,0.2)]' : 'bg-elevated/40 border-border/20 text-muted hover:border-indigo-500/30 hover:text-indigo-400 shadow-inner'}`}
                      >
                        {menu.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] ml-1 flex items-center gap-2"><PrinterIcon size={14} /> {lang === 'ar' ? 'طابعات القسم الافتراضية' : 'Default Section Printers'}</label>
                <div className="flex flex-wrap gap-3">
                  {printers.map(p => (
                    <button
                      key={p.id}
                      onClick={() => toggleCategoryPrinter(p.id)}
                      className={`px-5 py-3 rounded-[1rem] text-[10px] font-black uppercase tracking-[0.2em] border transition-all flex items-center gap-2 ${categoryModal.category.printerIds?.includes(p.id) ? 'bg-gradient-to-r from-emerald-500 to-teal-400 border-emerald-400/30 text-white shadow-[0_5px_15px_rgba(16,185,129,0.2)]' : 'bg-elevated/40 border-border/20 text-muted hover:border-emerald-500/30 hover:text-emerald-400 shadow-inner'}`}
                    >
                      <PrinterIcon size={14} />
                      {p.name}
                    </button>
                  ))}
                  {printers.length === 0 && (
                    <p className="text-[11px] text-muted italic px-2">{lang === 'ar' ? 'لا توجد طابعات مضافة بعد' : 'No printers configured yet.'}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="p-8 border-t border-border/20 bg-elevated/40  flex gap-4 relative z-10">
              <button
                onClick={() => setCategoryModal(null)}
                className="flex-[1] py-5 bg-card/60  text-muted rounded-[1.2rem] font-black uppercase tracking-[0.2em] text-[10px] border border-border/20 hover:bg-card hover:text-main transition-all active:scale-95 shadow-sm"
              >
                Cancel
              </button>
              <button onClick={handleSaveCategory} className="flex-[2] py-5 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white rounded-[1.2rem] font-black uppercase tracking-[0.2em] text-[10px] shadow-[0_10px_20px_rgba(99,102,241,0.2)] hover:shadow-[0_15px_30px_rgba(99,102,241,0.3)] hover:-translate-y-0.5 border border-indigo-400/30 transition-all active:scale-95">
                {categoryModal.mode === 'ADD' ? (lang === 'ar' ? 'إنشاء القسم' : 'Create Section') : (lang === 'ar' ? 'حفظ التغييرات' : 'Save Changes')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECIPE MODAL */}
      {recipeModal && (
        <div className="fixed inset-0 bg-slate-950/90 flex items-center justify-center z-[110] p-4 animate-in fade-in zoom-in duration-150">
          <div className="bg-card w-full max-w-3xl rounded-[3rem] shadow-[0_30px_60px_rgba(0,0,0,0.5)] border border-border/30 overflow-hidden flex flex-col max-h-[95vh] relative text-main">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-orange-500/5 pointer-events-none" />
            <div className="p-8 border-b border-border/20 bg-elevated/40  flex flex-col gap-6 relative z-10">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-5">
                  <div className="p-4 bg-gradient-to-br from-amber-500 to-orange-500 text-white rounded-[1.2rem] shadow-[0_10px_20px_rgba(245,158,11,0.3)] border border-border/40">
                    <Scale size={28} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-main uppercase tracking-tight drop-shadow-sm">Recipe: {recipeModal.item.name}</h3>
                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mt-1">Manage components and quantities</p>
                  </div>
                </div>
                <button onClick={() => setRecipeModal(null)} className="p-3 bg-card/60  text-muted rounded-[1rem] shadow-sm hover:text-rose-400 border border-border/20 hover:border-rose-500/30 hover:rotate-90 transition-all active:scale-95"><X size={28} /></button>
              </div>

              {recipeModal.item.sizes && recipeModal.item.sizes.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      const recipes = Array.isArray(recipeModal.item.recipe) ? recipeModal.item.recipe : [];
                      const isNewFormat = recipes.length > 0 && recipes[0].ingredients;
                      const r = isNewFormat ? (recipes.find(r => r.sizeId === null)?.ingredients || []) : recipes;
                      setRecipeModal({ ...recipeModal, tempRecipe: r });
                      setSelectedRecipeSizeId(null);
                    }}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${!selectedRecipeSizeId ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'bg-card/60 text-muted hover:text-main border border-border/20'}`}
                  >
                    Base Item
                  </button>
                  {recipeModal.item.sizes.map(size => (
                    <button
                      key={size.id}
                      onClick={() => {
                        const recipes = Array.isArray(recipeModal.item.recipe) ? recipeModal.item.recipe : [];
                        const isNewFormat = recipes.length > 0 && recipes[0].ingredients;
                        const r = isNewFormat ? (recipes.find(r => r.sizeId === size.id)?.ingredients || []) : [];
                        setRecipeModal({ ...recipeModal, tempRecipe: r });
                        setSelectedRecipeSizeId(size.id);
                      }}
                      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${selectedRecipeSizeId === size.id ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'bg-card/60 text-muted hover:text-main border border-border/20'}`}
                    >
                      {size.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar relative z-10">
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-2 ml-1"><Layers size={14} /> Components</h4>
                <div className="space-y-3">
                  {recipeModal.tempRecipe.map((ri) => {
                    const inv = inventory.find(i => i.id === ri.itemId);
                    return (
                      <div key={ri.itemId} className="flex justify-between items-center p-5 bg-elevated/40  rounded-[1.5rem] border border-border/20 shadow-inner hover:border-amber-500/30 transition-all group">
                        <div className="flex items-center gap-5">
                          <div className="w-12 h-12 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-[1rem] flex items-center justify-center text-amber-500 font-black border border-amber-500/30 group-hover:scale-105 transition-transform">
                            {inv?.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-black text-main text-sm">{inv?.name}</p>
                            <p className="text-[10px] font-bold text-muted mt-0.5">Stock Unit: {inv?.unit}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-5">
                          <span className="text-lg font-black text-amber-400 bg-amber-500/10 px-4 py-1.5 rounded-full border border-amber-500/20">{ri.quantity}</span>
                          <button onClick={() => setRecipeModal({ ...recipeModal, tempRecipe: recipeModal.tempRecipe.filter(r => r.itemId !== ri.itemId) })} className="p-3 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-[1rem] transition-all"><Trash2 size={16} /></button>
                        </div>
                      </div>
                    );
                  })}
                  {recipeModal.tempRecipe.length === 0 && (
                    <div className="p-10 text-center border-2 border-dashed border-border/30 rounded-[2rem] bg-elevated/20">
                      <p className="text-muted font-bold text-sm">No components added to this recipe yet.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-gradient-to-br from-amber-500/5 to-orange-500/5 p-8 rounded-[2rem] border border-amber-500/20 shadow-inner">
                <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-2 mb-6"><Plus size={14} /> Add Component</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                  <div className="group/sel space-y-2">
                    <label className="text-[9px] font-black text-muted uppercase tracking-[0.2em] ml-1 group-focus-within/sel:text-amber-500 transition-colors">Inventory Item</label>
                    <select value={newIngredientId} onChange={(e) => setNewIngredientId(e.target.value)} className="w-full p-4.5 rounded-[1.2rem] bg-card/60  border border-border/20 outline-none text-sm font-bold shadow-inner focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all text-main">
                      <option value="" className="bg-card">Select Item...</option>
                      {inventory.map(inv => (<option key={inv.id} value={inv.id} className="bg-card">{inv.name} ({inv.unit})</option>))}
                    </select>
                  </div>
                  <div className="group/qty space-y-2">
                    <label className="text-[9px] font-black text-muted uppercase tracking-[0.2em] ml-1 group-focus-within/qty:text-amber-500 transition-colors">Quantity</label>
                    <input type="number" min="0.001" step="0.001" value={newIngredientQty} onChange={(e) => setNewIngredientQty(e.target.value)} placeholder="0.000" className="w-full p-4.5 rounded-[1.2rem] bg-card/60  border border-border/20 outline-none text-sm font-black shadow-inner focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all text-main" />
                  </div>
                </div>
                <button onClick={addIngredientToTemp} disabled={!newIngredientId || !Number.isFinite(Number(newIngredientQty)) || Number(newIngredientQty) < 0.001} className="w-full py-4 bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-gradient-to-r hover:from-amber-500 hover:to-orange-500 hover:text-white hover:border-amber-400/30 rounded-[1.2rem] font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:pointer-events-none">Add To Recipe</button>
              </div>
            </div>

            <div className="p-8 border-t border-border/20 bg-elevated/40  flex gap-4 relative z-10">
              <button onClick={() => setRecipeModal(null)} className="flex-[1] py-5 bg-card/60  text-muted rounded-[1.2rem] font-black uppercase tracking-[0.2em] text-[10px] border border-border/20 hover:bg-card hover:text-main transition-all active:scale-95 shadow-sm">Cancel</button>
              <button onClick={handleSaveRecipe} className="flex-[2] py-5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-[1.2rem] font-black uppercase tracking-[0.2em] text-[10px] shadow-[0_10px_20px_rgba(245,158,11,0.2)] hover:shadow-[0_15px_30px_rgba(245,158,11,0.3)] hover:-translate-y-0.5 border border-amber-400/30 transition-all active:scale-95">Save & Sync Stock</button>
            </div>
          </div>
        </div>
      )}

      {renamingMenu && (
        <div className="fixed inset-0 z-[310] flex items-center justify-center bg-black/70 p-4" onClick={() => setRenamingMenu(null)}>
          <div className="w-full max-w-md rounded-[2rem] border border-border bg-card shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-border p-6">
              <div>
                <h3 className="text-lg font-black text-main">{lang === 'ar' ? 'تغيير اسم المنيو' : 'Rename menu'}</h3>
                <p className="mt-1 text-xs font-bold text-muted">{lang === 'ar' ? 'اكتب اسم واضح يظهر للفريق والمنصات.' : 'Use a clear name for the team and channels.'}</p>
              </div>
              <button onClick={() => setRenamingMenu(null)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-app text-muted hover:text-main">
                <X size={17} />
              </button>
            </div>
            <div className="p-6">
              <input
                value={renameValue}
                onChange={event => setRenameValue(event.target.value)}
                autoFocus
                maxLength={80}
                className="h-12 w-full rounded-xl border border-border bg-app px-4 text-sm font-black text-main outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex gap-3 border-t border-border p-4">
              <button onClick={() => setRenamingMenu(null)} className="flex-1 rounded-xl border border-border bg-app py-3 text-xs font-black text-muted hover:text-main">
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={() => {
                  const nextName = renameValue.trim();
                  if (!nextName) {
                    showToast(lang === 'ar' ? 'اسم المنيو مطلوب' : 'Menu name is required', 'error');
                    return;
                  }
                  updateMenu({ ...renamingMenu, name: nextName });
                  setRenamingMenu(null);
                  setRenameValue('');
                  showToast(lang === 'ar' ? 'تم تحديث اسم المنيو' : 'Menu renamed', 'success');
                }}
                disabled={!renameValue.trim()}
                className="flex-1 rounded-xl bg-indigo-600 py-3 text-xs font-black text-white disabled:opacity-50"
              >
                {lang === 'ar' ? 'حفظ' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MenuManager;
