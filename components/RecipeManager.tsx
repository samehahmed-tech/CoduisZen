
import React, { useState, useMemo, useEffect } from 'react';
import {
    ChefHat,
    Plus,
    Trash2,
    Calculator,
    Scale,
    Save,
    Search,
    Package,
    ChevronRight
} from 'lucide-react';
import {
    InventoryItem,
    RecipeIngredient
} from '../types';

// Stores
import { useMenuStore } from '../stores/useMenuStore';
import { useInventoryStore } from '../stores/useInventoryStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useToast } from './Toast';

const RecipeManager: React.FC = () => {
    const { categories, updateMenuItem, fetchMenu } = useMenuStore();
    const { inventory, fetchInventory } = useInventoryStore();
    const { settings } = useAuthStore();
    const { showToast } = useToast();

    const menuItems = useMemo(() => categories.flatMap(cat => cat.items), [categories]);
    const lang = (settings.language || 'en') as 'en' | 'ar';
    const tr = (ar: string, en: string) => lang === 'ar' ? ar : en;
    const currencySymbol = settings.currencySymbol || (lang === 'ar' ? 'ج.م' : 'EGP');

    const [selectedMenuItemId, setSelectedMenuItemId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [recipeSearch, setRecipeSearch] = useState('');
    const [selectedSizeId, setSelectedSizeId] = useState<string | null>(null);
    const [currentRecipe, setCurrentRecipe] = useState<RecipeIngredient[]>([]);
    const [isSavingRecipe, setIsSavingRecipe] = useState(false);

    useEffect(() => {
        fetchMenu();
        fetchInventory();
    }, [fetchMenu, fetchInventory]);

    const selectedMenuItem = useMemo(() =>
        menuItems.find(item => item.id === selectedMenuItemId),
        [menuItems, selectedMenuItemId]
    );

    useEffect(() => {
        if (selectedMenuItem) {
            const recipes = Array.isArray(selectedMenuItem.recipe) ? selectedMenuItem.recipe : [];
            const isNewFormat = recipes.length > 0 && recipes[0].ingredients;
            
            if (isNewFormat) {
                const r = recipes.find(r => r.sizeId === selectedSizeId);
                setCurrentRecipe(r ? r.ingredients : []);
            } else {
                // If legacy flat format, only show if no size is selected
                setCurrentRecipe(selectedSizeId ? [] : recipes);
            }
        } else {
            setCurrentRecipe([]);
        }
    }, [selectedMenuItem, selectedMenuItemId, selectedSizeId]);

    const filteredMenuItems = menuItems.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.id.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const availableInventory = inventory.filter(item =>
        item.name.toLowerCase().includes(recipeSearch.toLowerCase())
    );

    const getIngredientItemId = (ing: any) => ing.itemId || ing.inventoryItemId || '';

    const addIngredient = (item: InventoryItem) => {
        if (currentRecipe.some(ing => getIngredientItemId(ing) === item.id)) return;
        setCurrentRecipe([...currentRecipe, {
            itemId: item.id,
            quantity: 1,
            unit: item.unit
        }]);
    };

    const removeIngredient = (itemId: string) => {
        setCurrentRecipe(currentRecipe.filter(ing => getIngredientItemId(ing) !== itemId));
    };

    const updateQuantity = (itemId: string, quantity: number) => {
        setCurrentRecipe(currentRecipe.map(ing =>
            getIngredientItemId(ing) === itemId ? { ...ing, itemId, quantity: Math.max(0.001, quantity) } : ing
        ));
    };

    const calculateRecipeCost = () => {
        return currentRecipe.reduce((total, ing) => {
            const invItem = inventory.find(i => i.id === getIngredientItemId(ing));
            return total + (invItem ? invItem.costPrice * ing.quantity : 0);
        }, 0);
    };

    const selectedSize = selectedMenuItem?.sizes?.find(size => size.id === selectedSizeId);
    const sellPrice = selectedSize?.price ?? selectedMenuItem?.price ?? 0;
    const totalCost = calculateRecipeCost();
    const margin = sellPrice - totalCost;
    const marginPercentage = sellPrice > 0 ? (margin / sellPrice) * 100 : 0;

    const handleSaveRecipe = async () => {
        if (!selectedMenuItemId || !selectedMenuItem) return;

        // Find category id for this item
        const category = categories.find(cat => cat.items.some(it => it.id === selectedMenuItemId));
        if (category) {
            const activeMenuId = (useMenuStore.getState().menus || []).find(m => m.isDefault)?.id || 'menu-1';
            setIsSavingRecipe(true);
            
            const recipes = Array.isArray(selectedMenuItem.recipe) ? [...selectedMenuItem.recipe] : [];
            const isNewFormat = recipes.length > 0 && recipes[0].ingredients;
            
            let updatedRecipes;
            if (isNewFormat || selectedSizeId) {
                updatedRecipes = isNewFormat ? recipes : [{ sizeId: null, ingredients: recipes }];
                const idx = updatedRecipes.findIndex(r => r.sizeId === selectedSizeId);
                if (idx >= 0) {
                    updatedRecipes[idx] = { ...updatedRecipes[idx], ingredients: currentRecipe };
                } else {
                    updatedRecipes.push({ sizeId: selectedSizeId, ingredients: currentRecipe });
                }
            } else {
                updatedRecipes = currentRecipe; // Keep flat if it was flat and no size selected
            }

            try {
                await updateMenuItem(activeMenuId, category.id, { ...selectedMenuItem, recipe: updatedRecipes });
                showToast(tr('تم حفظ الوصفة', 'Recipe saved'), 'success');
            } catch (error) {
                showToast(tr('تعذر حفظ الوصفة', 'Could not save recipe'), 'error');
            } finally {
                setIsSavingRecipe(false);
            }
        }
    };

    return (
        <div className="p-8 bg-app min-h-screen transition-colors pb-24">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
                <div>
                    <h2 className="text-3xl font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-4">
                        <ChefHat className="text-indigo-600" size={36} />
                        {tr('الوصفات وهندسة التكلفة', 'Recipe & Engineering')}
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 font-semibold italic text-sm">
                        {tr('اربط أصناف المنيو بمكونات المخزون وتابع التكلفة والهامش.', 'Link recipes with ingredients and track costs.')}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* Menu Selection Panel */}
                <div className="lg:col-span-4 xl:col-span-3 space-y-6">
                    <div className="card-primary rounded-[2.5rem] p-6 shadow-sm border border-slate-200 dark:border-slate-800">
                        <div className="relative mb-6 group">
                            <Search size={18} className={`absolute ${lang === 'ar' ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors`} />
                            <input
                                type="text"
                                placeholder={tr('ابحث عن صنف منيو...', 'Locate menu item...')}
                                className={`w-full bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent focus:border-indigo-500/20 rounded-2xl py-3 ${lang === 'ar' ? 'pr-12 pl-4 text-right' : 'pl-12 pr-4'} font-black text-[10px] uppercase tracking-widest outline-none transition-all`}
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2 max-h-[60vh] md:max-h-[600px] overflow-y-auto no-scrollbar pr-1">
                            {filteredMenuItems.map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => { setSelectedMenuItemId(item.id); setSelectedSizeId(null); }}
                                    className={`w-full text-left p-4 rounded-2xl transition-all flex items-center gap-4 group ${selectedMenuItemId === item.id ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/30' : 'hover:bg-slate-50 dark:hover:bg-indigo-900/10 text-slate-600 dark:text-slate-400 border border-transparent'}`}
                                >
                                    <div className={`w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center font-black text-sm border ${selectedMenuItemId === item.id ? 'bg-elevated/70 border-border/30' : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                                        {item.image ? <img src={item.image} alt={lang === 'ar' ? item.nameAr || item.name : item.name} className="w-full h-full object-cover rounded-xl" /> : item.name.charAt(0)}
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                        <p className="text-xs font-black uppercase truncate leading-tight tracking-tight">{item.name}</p>
                                        <p className={`text-[10px] font-bold mt-1 ${selectedMenuItemId === item.id ? 'text-indigo-200' : 'text-slate-400'}`}>
                                            {item.price} {currencySymbol}
                                        </p>
                                    </div>
                                    <ChevronRight size={16} className={`transition-all ${selectedMenuItemId === item.id ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0'}`} />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Recipe Editor */}
                <div className="lg:col-span-8 xl:col-span-9">
                    {selectedMenuItem ? (
                        <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-150">
                            {/* Statistics Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="card-primary p-8 rounded-[2rem] border-l-8 border-l-indigo-600 shadow-sm">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{tr('سعر البيع', 'Public Price')}</p>
                                    <h4 className="text-2xl font-black text-slate-800 dark:text-white uppercase">{sellPrice} {currencySymbol}</h4>
                                </div>
                                <div className="card-primary p-8 rounded-[2rem] border-l-8 border-l-rose-500 shadow-sm">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{tr('تكلفة المكونات', 'Net BOM Cost')}</p>
                                    <h4 className="text-2xl font-black text-rose-500 uppercase">{totalCost.toFixed(2)} {currencySymbol}</h4>
                                </div>
                                <div className="card-primary p-8 rounded-[2rem] border-l-8 border-l-emerald-500 shadow-sm">
                                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2">{tr('هامش الربح', 'Efficiency Margin')}</p>
                                    <div className="flex items-center gap-3">
                                        <h4 className="text-2xl font-black text-slate-800 dark:text-white uppercase">{margin.toFixed(2)} {currencySymbol}</h4>
                                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-widest ${marginPercentage > 50 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                            {marginPercentage.toFixed(1)}%
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                                {/* Left: Recipe Ingredients */}
                                <div className="card-primary rounded-[2.5rem] p-10 shadow-sm border border-slate-200 dark:border-slate-800">
                                    <div className="flex flex-col gap-6 mb-10 pb-6 border-b border-slate-100 dark:border-slate-800">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-3">
                                                <Scale size={24} className="text-indigo-600" /> {tr('مكونات الوصفة', 'Bill of Materials')}
                                            </h3>
                                            <button
                                                onClick={handleSaveRecipe}
                                                disabled={isSavingRecipe}
                                                className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-600/30 flex items-center gap-2 disabled:opacity-60 disabled:cursor-wait"
                                            >
                                                <Save size={16} /> {isSavingRecipe ? tr('جاري الحفظ...', 'Saving...') : tr('حفظ الوصفة', 'Save Recipe')}
                                            </button>
                                        </div>

                                        {selectedMenuItem.sizes && selectedMenuItem.sizes.length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    onClick={() => setSelectedSizeId(null)}
                                                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${!selectedSizeId ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600'}`}
                                                >
                                                    {tr('الوصفة الأساسية', 'Base Item')}
                                                </button>
                                                {selectedMenuItem.sizes.map(size => (
                                                    <button
                                                        key={size.id}
                                                        onClick={() => setSelectedSizeId(size.id)}
                                                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${selectedSizeId === size.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600'}`}
                                                    >
                                                        {size.name}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-3">
                                        {currentRecipe.length === 0 ? (
                                            <div className="py-24 flex flex-col items-center justify-center opacity-30">
                                                <ChefHat size={64} className="mb-6" />
                                                <p className="text-xs font-black uppercase tracking-widest">{tr('لا توجد مكونات', 'No Ingredients')}</p>
                                            </div>
                                        ) : (
                                            currentRecipe.map(ing => {
                                                const ingredientItemId = getIngredientItemId(ing);
                                                const invItem = inventory.find(i => i.id === ingredientItemId);
                                                return (
                                                    <div key={ingredientItemId} className="flex items-center gap-5 p-5 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border-2 border-transparent hover:border-indigo-600/20 transition-all group">
                                                        <div className="w-12 h-12 rounded-2xl card-primary flex items-center justify-center text-slate-400 group-hover:text-indigo-600 shadow-sm">
                                                            <Package size={24} />
                                                        </div>
                                                        <div className="flex-1">
                                                            <p className="text-xs font-black uppercase text-slate-800 dark:text-white leading-tight tracking-tight">
                                                                {(lang === 'ar' ? invItem?.nameAr || invItem?.name : invItem?.name) || tr('مكون غير معروف', 'Unknown component')}
                                                            </p>
                                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">
                                                                {tr('التكلفة', 'Landed Cost')}: {invItem?.costPrice ?? 0} / {invItem?.unit || ing.unit}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <input
                                                                type="number"
                                                                className="w-20 card-primary border-2 border-slate-100 dark:border-slate-700 rounded-xl py-2 px-3 font-black text-xs text-center focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 transition-all outline-none"
                                                                value={ing.quantity}
                                                                min="0.001"
                                                                step="0.001"
                                                                onChange={e => updateQuantity(ingredientItemId, parseFloat(e.target.value) || 0)}
                                                            />
                                                            <span className="text-[10px] font-black text-slate-400 uppercase w-10">{ing.unit}</span>
                                                        </div>
                                                        <button
                                                            onClick={() => removeIngredient(ingredientItemId)}
                                                            className="p-3 card-primary text-slate-300 hover:text-rose-500 rounded-xl shadow-sm transition-all"
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>

                                {/* Right: Inventory Picker */}
                                <div className="card-primary rounded-[2.5rem] p-10 shadow-sm border border-slate-200 dark:border-slate-800 h-fit">
                                    <h3 className="text-xl font-black text-slate-800 dark:text-white mb-10 pb-6 border-b border-slate-100 dark:border-slate-800 uppercase tracking-tight flex items-center gap-3">
                                        <Search size={24} className="text-indigo-600" /> {tr('الأصناف المخزنية', 'Supply Registry')}
                                    </h3>

                                    <div className="relative mb-8 group">
                                        <Search size={18} className={`absolute ${lang === 'ar' ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors`} />
                                        <input
                                            type="text"
                                            placeholder={tr('ابحث في الأصناف المخزنية...', 'Index raw materials...')}
                                            className={`w-full bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent focus:border-indigo-500/20 rounded-2xl py-3.5 ${lang === 'ar' ? 'pr-12 pl-6 text-right' : 'pl-12 pr-6'} font-black text-[10px] uppercase tracking-widest outline-none transition-all shadow-inner`}
                                            value={recipeSearch}
                                            onChange={e => setRecipeSearch(e.target.value)}
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 gap-3 max-h-[60vh] md:max-h-[500px] overflow-y-auto no-scrollbar pr-1">
                                        {availableInventory.map(item => {
                                            const isAdded = currentRecipe.some(ing => getIngredientItemId(ing) === item.id);
                                            return (
                                                <button
                                                    key={item.id}
                                                    disabled={isAdded}
                                                    onClick={() => addIngredient(item)}
                                                    className={`flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${isAdded ? 'opacity-40 grayscale border-slate-100' : 'card-primary border-slate-50 dark:border-slate-800 hover:border-indigo-600 dark:hover:border-indigo-600 group shadow-sm hover:shadow-lg'}`}
                                                >
                                                    <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-300 group-hover:text-indigo-600 transition-colors">
                                                        <Package size={20} />
                                                    </div>
                                                    <div className="flex-1 overflow-hidden">
                                                        <p className="text-[10px] font-black uppercase text-slate-800 dark:text-white truncate tracking-tight">
                                                            {lang === 'ar' ? item.nameAr || item.name : item.name}
                                                        </p>
                                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">{item.category}</p>
                                                    </div>
                                                    <Plus size={18} className="text-indigo-600 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0" />
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-900 rounded-[3rem] p-10 text-white flex flex-col md:flex-row items-center gap-8 shadow-2xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000" />
                                <div className="p-5 bg-indigo-600 rounded-3xl shadow-xl shadow-indigo-600/30">
                                    <Calculator size={32} />
                                </div>
                                <div>
                                    <p className="text-sm font-black uppercase tracking-widest text-indigo-400 mb-1">{lang === 'ar' ? 'خصم تلقائي من المخزون' : 'Auto Stock Deduction'}</p>
                                    <p className="text-xs font-bold text-slate-300 uppercase leading-relaxed max-w-2xl opacity-80">
                                        {lang === 'ar' ? 'سيتم خصم مكونات الوصفة تلقائيا من المخزون عند تأكيد الطلب.' : 'Ingredients will be automatically deducted from inventory when an order is confirmed.'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="card-primary rounded-[3.5rem] p-32 flex flex-col items-center justify-center text-center opacity-40 border-2 border-dashed border-slate-200 dark:border-slate-800">
                            <div className="w-24 h-24 rounded-[2rem] bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-300 mb-10 border-4 border-white dark:border-slate-900 shadow-2xl">
                                <ChefHat size={56} />
                            </div>
                            <h3 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight">{tr('اختار صنف منيو', 'Select Production Unit')}</h3>
                            <p className="text-xs font-black text-slate-400 mt-4 max-w-sm mx-auto leading-relaxed uppercase tracking-widest">{tr('اختار صنف من القائمة لبدء بناء الوصفة وحساب التكلفة والهامش.', 'Identify a menu item from the left registry to build its BOM and simulate profit.')}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RecipeManager;
