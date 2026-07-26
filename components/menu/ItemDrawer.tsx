import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X, Save, Trash2, Plus, Minus, Sparkles, Scale, LayoutGrid,
  Printer as PrinterIcon, Layers, Clock, DollarSign, Globe,
  History, Package, ImageIcon, ShoppingBag, Info, Tag, ArrowRight, Copy
} from "lucide-react";
import {
  MenuItem, MenuCategory, Printer, Branch, InventoryItem,
  ModifierGroup, ModifierOption, ItemSize, PlatformPrice
} from "../../types";
import ImageUploader from "../common/ImageUploader";
import { barcodeApi } from "../../services/api/barcode";
import { useToast } from "../common/ToastProvider";

type DrawerTab = "BASIC" | "SIZES" | "MODIFIERS" | "RECIPE" | "PRICING" | "PLATFORMS" | "SCHEDULE" | "PRINTERS" | "HISTORY";

interface Props {
  item: MenuItem;
  mode: "ADD" | "EDIT";
  categoryId: string;
  categories: MenuCategory[];
  printers: Printer[];
  branches: Branch[];
  inventory: InventoryItem[];
  onSave: (item: MenuItem, categoryId: string, duplicate?: boolean) => void;
  onClose: () => void;
  onDelete?: () => void;
  lang: string;
  currency: string;
}

export const ItemDrawer: React.FC<Props> = ({
  item: initialItem, mode, categoryId: initialCategoryId,
  categories, printers, branches, inventory,
  onSave, onClose, onDelete, lang, currency,
}) => {
  const { error } = useToast();
  const [item, setItem] = useState<MenuItem>({ ...initialItem });
  const [activeCategoryId, setActiveCategoryId] = useState(initialCategoryId);
  const [tab, setTab] = useState<DrawerTab>("BASIC");
  const [generatingBarcode, setGeneratingBarcode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saveInFlightRef = useRef(false);
  const [recipeIngredientId, setRecipeIngredientId] = useState("");
  const [recipeIngredientSearch, setRecipeIngredientSearch] = useState("");
  const [recipeSearchOpen, setRecipeSearchOpen] = useState(false);
  const [recipeIngredientQty, setRecipeIngredientQty] = useState(0);
  const [selectedRecipeSizeId, setSelectedRecipeSizeId] = useState<string | null>(null);

  const recipeIngredientOptions = useMemo(() => {
    const query = recipeIngredientSearch.trim().toLocaleLowerCase(lang === 'ar' ? 'ar' : 'en');
    return inventory
      .filter((inv) => {
        if (!query) return true;
        return [inv.name, inv.nameAr, inv.sku, (inv as any).barcode]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase(lang === 'ar' ? 'ar' : 'en').includes(query));
      })
      .slice(0, 30);
  }, [inventory, lang, recipeIngredientSearch]);

  useEffect(() => {
    setItem({ ...initialItem });
    setActiveCategoryId(initialCategoryId);
  }, [initialItem, initialCategoryId]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const update = (changes: Partial<MenuItem>) => setItem((prev) => ({ ...prev, ...changes }));

  useEffect(() => {
    if (mode === "ADD" && !item.sku && activeCategoryId) {
      const cat = categories.find(c => c.id === activeCategoryId);
      if (cat) {
        const catAbbr = (cat.name || "CAT").replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase() || "CAT";
        const nextNum = (cat.items?.length || 0) + 1;
        update({ sku: `${catAbbr}-${String(nextNum).padStart(3, "0")}` });
      }
    }
  }, [activeCategoryId, mode, categories, item.sku]);

  const handleGenerateBarcode = useCallback(async () => {
    setGeneratingBarcode(true);
    try {
      const result = await barcodeApi.generate();
      update({ barcode: result.barcode });
    } catch {
      error(lang === "ar" ? "تعذر إنشاء الباركود" : "Failed to generate barcode");
    } finally {
      setGeneratingBarcode(false);
    }
  }, []);

  const addSize = () => update({ sizes: [...(item.sizes || []), { id: `sz-${Date.now()}`, name: "", price: item.price, isAvailable: true }] });
  const updateSize = (id: string, c: Partial<ItemSize>) => update({ sizes: (item.sizes || []).map(s => s.id === id ? { ...s, ...c } : s) });
  const removeSize = (id: string) => update({ sizes: (item.sizes || []).filter(s => s.id !== id) });

  const addModGroup = () => update({ modifierGroups: [...(item.modifierGroups || []), { id: `mod-${Date.now()}`, name: "", minSelection: 0, maxSelection: 1, options: [] }] });
  const updateModGroup = (id: string, c: Partial<ModifierGroup>) => update({ modifierGroups: (item.modifierGroups || []).map(g => g.id === id ? { ...g, ...c } : g) });
  const removeModGroup = (id: string) => update({ modifierGroups: (item.modifierGroups || []).filter(g => g.id !== id) });
  
  const addModOption = (gId: string) => update({ modifierGroups: (item.modifierGroups || []).map(g => g.id === gId ? { ...g, options: [...g.options, { id: `opt-${Date.now()}`, name: "", price: 0 }] } : g) });
  const updateModOption = (gId: string, oId: string, c: Partial<ModifierOption>) => update({ modifierGroups: (item.modifierGroups || []).map(g => g.id === gId ? { ...g, options: g.options.map(o => o.id === oId ? { ...o, ...c } : o) } : g) });
  const removeModOption = (gId: string, oId: string) => update({ modifierGroups: (item.modifierGroups || []).map(g => g.id === gId ? { ...g, options: g.options.filter(o => o.id !== oId) } : g) });

  const addRecipeIngredient = () => {
    if (!recipeIngredientId || recipeIngredientQty <= 0) return;
    const inv = inventory.find(i => i.id === recipeIngredientId);
    if (!inv) return;
    
    const recipes = Array.isArray(item.recipe) ? item.recipe : [];
    const isNewFormat = recipes.length > 0 && recipes[0].ingredients;
    
    if (isNewFormat) {
      const updatedRecipes = [...recipes];
      let targetRecipeIndex = updatedRecipes.findIndex(r => r.sizeId === selectedRecipeSizeId);
      
      if (targetRecipeIndex === -1) {
        updatedRecipes.push({ sizeId: selectedRecipeSizeId, ingredients: [] });
        targetRecipeIndex = updatedRecipes.length - 1;
      }
      
      const ingredients = [...updatedRecipes[targetRecipeIndex].ingredients];
      const foundIdx = ingredients.findIndex(r => (r.itemId || r.inventoryItemId) === recipeIngredientId);
      
      if (foundIdx >= 0) {
        ingredients[foundIdx] = { ...ingredients[foundIdx], quantity: ingredients[foundIdx].quantity + recipeIngredientQty };
      } else {
        ingredients.push({ itemId: recipeIngredientId, inventoryItemId: recipeIngredientId, quantity: recipeIngredientQty, unit: String(inv.unit) });
      }
      
      updatedRecipes[targetRecipeIndex].ingredients = ingredients;
      update({ recipe: updatedRecipes });
    } else {
      // Legacy flat format - convert to new format if size is selected, or keep flat if not
      if (selectedRecipeSizeId) {
        update({ recipe: [{ sizeId: selectedRecipeSizeId, ingredients: [{ itemId: recipeIngredientId, quantity: recipeIngredientQty, unit: String(inv.unit) }] }] });
      } else {
        const found = recipes.find(r => r.itemId === recipeIngredientId);
        if (found) {
          update({ recipe: recipes.map(r => r.itemId === recipeIngredientId ? { ...r, quantity: r.quantity + recipeIngredientQty } : r) });
        } else {
          update({ recipe: [...recipes, { itemId: recipeIngredientId, quantity: recipeIngredientQty, unit: String(inv.unit) }] });
        }
      }
    }
    
    setRecipeIngredientId("");
    setRecipeIngredientSearch("");
    setRecipeSearchOpen(false);
    setRecipeIngredientQty(0);
  };

  const removeRecipeIngredient = (id: string) => {
    const recipes = Array.isArray(item.recipe) ? item.recipe : [];
    const isNewFormat = recipes.length > 0 && recipes[0].ingredients;
    
    if (isNewFormat) {
      update({ 
        recipe: recipes.map(r => r.sizeId === selectedRecipeSizeId 
          ? { ...r, ingredients: r.ingredients.filter((i: any) => (i.itemId || i.inventoryItemId) !== id) } 
          : r) 
      });
    } else {
      update({ recipe: recipes.filter(r => r.itemId !== id) });
    }
  };

  const activeRecipeIngredients = () => {
    const recipes = Array.isArray(item.recipe) ? item.recipe : [];
    const isNewFormat = recipes.length > 0 && recipes[0].ingredients;
    
    if (isNewFormat) {
      return recipes.find(r => r.sizeId === selectedRecipeSizeId)?.ingredients || [];
    }
    // Only show flat recipe if no size is selected or if we are in legacy mode
    return selectedRecipeSizeId ? [] : recipes;
  };

  const toggleBadge = (id: string) => update({ dietaryBadges: item.dietaryBadges?.includes(id) ? item.dietaryBadges.filter(b => b !== id) : [...(item.dietaryBadges || []), id] });
  const toggleDay = (id: string) => update({ availableDays: item.availableDays?.includes(id) ? item.availableDays.filter(d => d !== id) : [...(item.availableDays || []), id] });
  const togglePrinter = (id: string) => update({ printerIds: item.printerIds?.includes(id) ? item.printerIds.filter(p => p !== id) : [...(item.printerIds || []), id] });

  const submitItem = async (keepOpen = false) => {
    if (saveInFlightRef.current || !item.name?.trim()) return;
    saveInFlightRef.current = true;
    setIsSaving(true);
    try {
      await onSave(item, activeCategoryId, keepOpen);
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const recipeCost = activeRecipeIngredients().reduce((sum: number, r: any) => {
    const inv = inventory.find(i => i.id === (r.itemId || r.inventoryItemId));
    return sum + (inv ? inv.costPrice * r.quantity : 0);
  }, 0);

  const tabs: { id: DrawerTab; icon: React.ElementType; en: string; ar: string }[] = [
    { id: "BASIC", icon: LayoutGrid, en: "Identity", ar: "الهوية العامة" },
    { id: "SIZES", icon: Package, en: "Sizes", ar: "الأحجام" },
    { id: "MODIFIERS", icon: Layers, en: "Modifiers", ar: "الإضافات" },
    { id: "RECIPE", icon: Scale, en: "Recipe", ar: "المكونات والتكلفة" },
    { id: "PRICING", icon: DollarSign, en: "Branches", ar: "تسعير الفروع" },
    { id: "PLATFORMS", icon: Globe, en: "Platforms", ar: "تسعير المنصات" },
    { id: "SCHEDULE", icon: Clock, en: "Schedule", ar: "الجدولة" },
    { id: "PRINTERS", icon: PrinterIcon, en: "Printers", ar: "الطابعات" },
    { id: "HISTORY", icon: History, en: "Audit", ar: "سجل العمليات" },
  ];

  const dietaryOptions = [
    { id: "vegan", en: "Vegan", ar: "نباتي صرف" },
    { id: "vegetarian", en: "Vegetarian", ar: "نباتي" },
    { id: "spicy", en: "Spicy", ar: "حار" },
    { id: "gluten-free", en: "Gluten Free", ar: "خالي جلوتين" },
    { id: "new", en: "New", ar: "جديد" },
  ];

  const dayOptions = [
    { id: "mon", en: "Mon", ar: "الاثنين" }, { id: "tue", en: "Tue", ar: "الثلاثاء" },
    { id: "wed", en: "Wed", ar: "الأربعاء" }, { id: "thu", en: "Thu", ar: "الخميس" },
    { id: "fri", en: "Fri", ar: "الجمعة" }, { id: "sat", en: "Sat", ar: "السبت" },
    { id: "sun", en: "Sun", ar: "الأحد" },
  ];

  const platformOptions = [
    { id: "talabat", name: "Talabat" }, { id: "elmenus", name: "elmenus" },
    { id: "uber_eats", name: "Uber Eats" }, { id: "store_direct", name: "Store Direct" },
  ];

  const inputCls = "w-full glass-field !border-border/30 hover:!border-primary/40 focus:!border-primary !rounded-xl transition-all shadow-sm";
  const subLabelCls = "block text-[11px] font-black uppercase tracking-widest text-muted mb-2 ps-1";

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9000] bg-slate-950/70 backdrop-blur-md animate-fade-in" onClick={onClose} />
      
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-drawer-title"
        className="fixed inset-0 sm:inset-3 lg:inset-y-5 lg:left-1/2 lg:right-auto lg:w-[min(1180px,calc(100vw-2.5rem))] lg:-translate-x-1/2 z-[9001] flex flex-col bg-card shadow-2xl max-h-[100dvh] sm:max-h-[calc(100dvh-1.5rem)] lg:max-h-[calc(100dvh-2.5rem)] transition-all duration-300 animate-slide-up overflow-hidden border border-border/40 rounded-none sm:rounded-3xl"
        dir={lang === "ar" ? "rtl" : "ltr"}
      >
        
        {/* Top Floating Header */}
        <div className="shrink-0 flex h-16 sm:h-auto items-center justify-between gap-2 px-3 sm:px-8 py-2 sm:py-5 border-b border-border/30 bg-elevated/40 relative z-20">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="hidden min-[380px]:flex w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-xl sm:rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 items-center justify-center text-primary shadow-sm">
                <ShoppingBag size={24} />
            </div>
             <div className="min-w-0">
               <h2 id="item-drawer-title" className="text-base sm:text-xl font-black text-main tracking-tight truncate">
                {item.name || (lang === "ar" ? "إضافة صنف جديد" : "Create New Product")}
              </h2>
              <div className="hidden sm:flex items-center gap-2 mt-1">
                <span className="glass-badge glass-badge-primary">
                  {mode === "EDIT" ? (lang === 'ar' ? 'تعديل مباشر' : 'Live Edit') : (lang === 'ar' ? 'منتج جديد' : 'New Product')}
                </span>
                <span className="text-xs font-bold text-muted/70 flex items-center gap-1">
                  <Tag size={12}/> {categories.find(c => c.id === activeCategoryId)?.name || "Uncategorized"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
             {item.id && mode === "EDIT" && (
                <button
                  onClick={() => onSave({ ...item, id: '', name: `${item.name} (${lang === "ar" ? "نسخة" : "Copy"})` }, activeCategoryId, true)}
                  className="glass-btn glass-btn-secondary px-4 !rounded-xl text-muted hover:text-indigo-500 hover:border-indigo-500/30"
                >
                  <Copy size={16} />
                  <span className="hidden sm:inline">{lang === "ar" ? "تكرار" : "Duplicate"}</span>
                </button>
              )}
              <button onClick={onClose} className="w-10 h-10 rounded-xl bg-elevated/60 border border-border/30 flex items-center justify-center text-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors">
                <X size={20} />
              </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden bg-card/50">
          {/* Vertical Stepper Sidebar */}
          <div className="w-full h-14 lg:h-auto lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-border/30 bg-elevated/20 flex flex-col rtl:lg:border-l rtl:lg:border-r-0 overflow-hidden lg:overflow-y-auto pos-scroll lg:max-h-none">
             <div className="p-2 sm:p-3 lg:p-6">
                <h3 className="hidden lg:block text-[10px] font-black text-muted uppercase tracking-[0.2em] mb-4">
                  {lang === 'ar' ? 'مراحل الإعداد' : 'Configuration Steps'}
                </h3>
                 <div className="flex lg:block gap-2 lg:space-y-1.5 p-1 relative z-10 overflow-x-auto lg:overflow-visible">
                   {tabs.map((t, i) => (
                      <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                         className={`h-10 shrink-0 lg:w-full flex items-center gap-2 lg:gap-3 px-3 lg:px-4 lg:py-3.5 lg:h-auto rounded-xl lg:rounded-2xl transition-all duration-300 relative group
                          ${tab === t.id 
                            ? "bg-primary text-white shadow-lg shadow-primary/20 font-black scale-[1.02]" 
                            : "text-muted hover:bg-elevated/80 hover:text-main font-bold"}`}
                      >
                         <t.icon size={18} className={tab === t.id ? "text-white" : "text-muted group-hover:text-primary transition-colors"} />
                         <span className="text-[11px] lg:text-[13px] tracking-wide mt-0.5 whitespace-nowrap">{lang === "ar" ? t.ar : t.en}</span>
                         {tab === t.id && (
                             <div className="absolute top-1/2 -translate-y-1/2 right-4 rtl:left-4 rtl:right-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                         )}
                      </button>
                   ))}
                </div>
             </div>
             
             {/* Product Preview Card */}
             <div className="hidden lg:block mt-auto p-6 bg-gradient-to-t from-card/80 to-transparent">
                 <div className="glass-1 p-4 rounded-2xl border-subtle shadow-md">
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-3 text-center">
                       {lang === 'ar' ? 'معاينة العميل' : 'Customer Preview'}
                    </p>
                    <div className="aspect-[4/3] rounded-xl bg-card overflow-hidden relative border border-border/30">
                        {item.image ? (
                           <img src={item.image} className="w-full h-full object-cover" alt="Preview"/>
                        ) : (
                           <div className="absolute inset-0 flex items-center justify-center flex-col text-muted/30">
                              <ImageIcon size={32} />
                           </div>
                        )}
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8">
                           <p className="text-white font-black text-sm truncate">{item.name || "Product Name"}</p>
                           <p className="text-emerald-400 font-bold text-xs mt-0.5">{currency} {item.price || 0}</p>
                        </div>
                    </div>
                 </div>
             </div>
          </div>

          {/* Main Content Area */}
           <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain p-3 sm:p-6 lg:p-8 pos-scroll relative">
              <div className="max-w-4xl mx-auto pb-3 sm:pb-6">
               {/* Background Decorative Glow */}
                <div className="absolute top-0 right-0 w-72 h-72 sm:w-96 sm:h-96 bg-primary/5 blur-[100px] rounded-full pointer-events-none" />
               
               {tab === "BASIC" && (
                 <div className="space-y-4 sm:space-y-8 animate-fade-in relative z-10">
                    <div className="grid lg:grid-cols-[1fr_minmax(0,340px)] gap-4 sm:gap-6">
                       <div className="glass-2 p-4 sm:p-6 flex flex-col gap-5 border-border/40">
                          <h3 className="text-sm font-black text-main uppercase tracking-widest flex items-center gap-2 mb-2">
                             <Info size={16} className="text-primary"/> {lang === 'ar' ? 'المعلومات الأساسية' : 'Core Identification'}
                          </h3>
                          <div className="grid gap-5">
                             <div>
                                <label className={subLabelCls}>{lang === "ar" ? "الاسم التجاري" : "Display Name"}</label>
                                <input type="text" value={item.name} onChange={e => update({ name: e.target.value })} className={`${inputCls} !text-sm h-11 uppercase`} placeholder="e.g. Classic Burger" />
                             </div>
                             <div>
                                <label className={subLabelCls}>{lang === "ar" ? "الاسم العربي" : "Arabic Name"}</label>
                                <input type="text" value={item.nameAr || ""} onChange={e => update({ nameAr: e.target.value })} className={`${inputCls} !text-sm h-11 font-sans`} placeholder="مثال: برجر كلاسيك" dir="rtl" />
                             </div>
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                   <label className={subLabelCls}>SKU Code</label>
                                   <input type="text" value={item.sku || ""} onChange={e => update({ sku: e.target.value })} className={`${inputCls} h-11 font-mono text-xs`} placeholder="AUTO-GEN"/>
                                </div>
                                <div>
                                   <label className={subLabelCls}>{lang === "ar" ? "باركود" : "Barcode"}</label>
                                   <div className="flex gap-2">
                                     <input type="text" value={item.barcode || ""} onChange={e => update({ barcode: e.target.value })} className={`${inputCls} h-11 text-sm`} />
                                     <button onClick={handleGenerateBarcode} disabled={generatingBarcode} className="w-11 h-11 shrink-0 glass-btn glass-btn-primary !p-0 flex items-center justify-center !rounded-xl">
                                       <Sparkles size={16} />
                                     </button>
                                   </div>
                                </div>
                             </div>
                          </div>
                       </div>
                       
                       <div className="glass-2 p-4 sm:p-6 flex flex-col gap-6 border-border/40">
                         <h3 className="text-sm font-black text-main uppercase tracking-widest flex items-center gap-2">
                             <ImageIcon size={16} className="text-indigo-500"/> {lang === 'ar' ? 'صورة المنتج' : 'Visual Asset'}
                          </h3>
                          <div className="flex-1 min-w-0 rounded-2xl overflow-hidden border-2 border-dashed border-border/40 bg-elevated/20 transition-colors hover:bg-elevated/40 hover:border-primary/40 group">
                             <ImageUploader value={item.image || ""} onChange={url => update({ image: url })} type="item" lang={lang as "en"|"ar"} className="h-full w-full object-cover [&>div>div]:!h-full [&>div>div]:!w-full [&>div>div]:border-none" />
                          </div>
                       </div>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
                       <div className="glass-2 p-4 sm:p-6 border-border/40">
                         <h3 className="text-sm font-black text-main uppercase tracking-widest flex items-center gap-2 mb-5">
                             <Tag size={16} className="text-emerald-500"/> {lang === 'ar' ? 'التصنيف والسعر' : 'Classification & Retail'}
                          </h3>
                          <div className="space-y-5">
                             <div>
                                <label className={subLabelCls}>{lang === "ar" ? "السعر الأساسي" : "Base Retail Price"}</label>
                                <div className="relative">
                                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-primary">{currency}</span>
                                  <input type="number" value={item.price} onChange={e => update({ price: parseFloat(e.target.value) || 0 })} className={`${inputCls} !pl-10 !h-11 !text-lg !font-black !text-main placeholder:text-muted/30`} />
                                </div>
                             </div>
                             <div>
                                <label className={subLabelCls}>{lang === "ar" ? "التصنيف" : "Category Hierarchy"}</label>
                                <select value={activeCategoryId} onChange={e => setActiveCategoryId(e.target.value)} className={`${inputCls} h-11 text-xs font-bold`}>
                                   <option value="" disabled>Select Layer Category</option>
                                   {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                             </div>
                          </div>
                       </div>
                       
                       <div className="glass-2 p-4 sm:p-6 border-border/40">
                          <h3 className="text-sm font-black text-main uppercase tracking-widest flex items-center gap-2 mb-5">
                             <Info size={16} className="text-amber-500"/> {lang === 'ar' ? 'السمات الإضافية' : 'Dietary Badges'}
                          </h3>
                          <div className="flex flex-wrap gap-2.5">
                             {dietaryOptions.map((badge) => {
                               const isActive = item.dietaryBadges?.includes(badge.id);
                               return (
                                 <button
                                   key={badge.id}
                                   onClick={() => toggleBadge(badge.id)}
                                   className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all duration-200 border uppercase tracking-wider
                                    ${isActive ? 'bg-primary text-white border-primary shadow-md shadow-primary/20' : 'bg-elevated/40 text-muted border-border hover:border-primary/40 hover:text-main'}`}
                                 >
                                   {lang === "ar" ? badge.ar : badge.en}
                                 </button>
                               )
                             })}
                          </div>
                       </div>
                    </div>
                 </div>
               )}

               {tab === "SIZES" && (
                 <div className="space-y-6 animate-fade-in relative z-10">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                       <div>
                         <h3 className="text-lg font-black text-main uppercase tracking-widest">
                           {lang === 'ar' ? 'هيكلة الأحجام' : 'Size Variations'}
                         </h3>
                         <p className="text-xs font-bold text-muted mt-1">{lang === 'ar' ? 'تحديد أسعار مختلفة بناءً على الحجم' : 'Define fractional pricing parameters'}</p>
                       </div>
                       <button onClick={addSize} className="glass-btn glass-btn-primary !rounded-full px-5 text-xs font-black self-start sm:self-auto">
                         <Plus size={16} /> {lang === "ar" ? "حجم جديد" : "Add Size Constraint"}
                       </button>
                    </div>
                    
                    <div className="grid gap-4">
                      {item.sizes?.length === 0 && (
                         <div className="glass-1 border-dashed p-10 text-center rounded-[2rem] flex flex-col items-center gap-3">
                           <Package size={32} className="text-muted/40"/>
                           <p className="text-sm font-bold text-muted">{lang === 'ar' ? 'لا توجد أحجام. السعر الأساسي هو المستخدم.' : 'No size metrics defined. Base pricing applies.'}</p>
                         </div>
                      )}
                      {(item.sizes || []).map((size, idx) => (
                        <div key={size.id} className="glass-2 p-5 rounded-[2rem] flex flex-col md:flex-row items-center gap-5 group border-border/30 hover:border-primary/20 transition-all">
                           <div className="flex items-center justify-center w-12 h-12 bg-primary/10 text-primary font-black rounded-2xl shadow-inner">
                              {idx + 1}
                           </div>
                           <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
                              <div>
                                 <label className={subLabelCls}>{lang === 'ar' ? 'المسمى' : 'Label'}</label>
                                 <input type="text" value={size.name} onChange={e => updateSize(size.id, { name: e.target.value })} className={`${inputCls} h-10 text-center font-bold text-sm`} placeholder="S / M / L" />
                              </div>
                              <div>
                                 <label className={subLabelCls}>{lang === 'ar' ? 'السعر' : 'Target Price'}</label>
                                 <input type="number" value={size.price} onChange={e => updateSize(size.id, { price: parseFloat(e.target.value) || 0 })} className={`${inputCls} h-10 bg-emerald-500/5 !border-emerald-500/20 text-emerald-500 font-bold`} />
                              </div>
                              <div>
                                 <label className={subLabelCls}>{lang === 'ar' ? 'التكلفة (مربوطة بالريسبي)' : 'Cost (From Recipe)'}</label>
                                 <div className={`${inputCls} h-10 bg-amber-500/5 !border-amber-500/20 text-amber-500 font-bold flex items-center justify-center text-sm cursor-not-allowed opacity-80`} title="Calculated from exact recipe costs">
                                    {currency} {recipeCost.toFixed(2)}
                                 </div>
                              </div>
                           </div>
                           <div className="flex items-center gap-3 w-full md:w-auto mt-2 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-border/20 md:border-none justify-end">
                              <button onClick={() => updateSize(size.id, { isAvailable: !size.isAvailable })} className={`glass-btn text-[10px] font-black uppercase tracking-widest w-24 justify-center ${size.isAvailable ? 'glass-badge-success' : 'glass-badge-danger'}`}>
                                {size.isAvailable ? (lang === 'ar' ? 'نشط' : 'Active') : (lang === 'ar' ? 'معطل' : 'Hidden')}
                              </button>
                              <button onClick={() => removeSize(size.id)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-colors">
                                <Trash2 size={16} />
                              </button>
                           </div>
                        </div>
                      ))}
                    </div>
                 </div>
               )}

               {tab === "MODIFIERS" && (
                 <div className="space-y-8 animate-fade-in relative z-10">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                       <div>
                         <h3 className="text-lg font-black text-main uppercase tracking-widest">{lang === 'ar' ? 'إدارة الإضافات' : 'Customization Groups'}</h3>
                         <p className="text-xs font-bold text-muted mt-1">{lang === 'ar' ? 'تخصيص الخيارات والزيادات للعملاء' : 'Configure upselling and modifier params'}</p>
                       </div>
                       <button onClick={addModGroup} className="glass-btn glass-btn-primary !rounded-full px-5 text-xs font-black self-start sm:self-auto">
                         <Plus size={16} /> {lang === "ar" ? "مجموعة جديدة" : "New Group"}
                       </button>
                    </div>

                    <div className="space-y-6">
                       {item.modifierGroups?.length === 0 && (
                          <div className="glass-1 border-dashed p-10 text-center rounded-[2rem] flex flex-col items-center gap-3">
                            <Layers size={32} className="text-muted/40"/>
                            <p className="text-sm font-bold text-muted">{lang === 'ar' ? 'لا توجد إضافات حالياً.' : 'No modifier groups instantiated.'}</p>
                          </div>
                       )}
                       {(item.modifierGroups || []).map(group => (
                          <div key={group.id} className="glass-2 rounded-[2.5rem] overflow-hidden border-border/30 shadow-sm relative group">
                             <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl -z-10" />
                             <div className="p-5 border-b border-border/30 bg-elevated/30 flex flex-col sm:flex-row items-center gap-4">
                                <div className="flex-1 w-full">
                                  <label className={subLabelCls}>{lang === 'ar' ? 'اسم المجموعة' : 'Group Identifier'}</label>
                                  <input type="text" value={group.name} onChange={e => updateModGroup(group.id, { name: e.target.value })} className={`${inputCls} h-11 text-sm font-black`} placeholder="e.g. Choose Extras" />
                                </div>
                                <div className="flex items-center gap-3 bg-card/60 p-2 rounded-2xl border border-border/50 shrink-0">
                                   <div className="w-20">
                                      <label className={subLabelCls}>Min</label>
                                      <input type="number" value={group.minSelection} onChange={e => updateModGroup(group.id, { minSelection: parseInt(e.target.value) || 0 })} className={`${inputCls} h-9 text-center bg-transparent border-transparent`} />
                                   </div>
                                   <div className="w-[1px] h-9 bg-border/50" />
                                   <div className="w-20">
                                      <label className={subLabelCls}>Max</label>
                                      <input type="number" value={group.maxSelection} onChange={e => updateModGroup(group.id, { maxSelection: parseInt(e.target.value) || 1 })} className={`${inputCls} h-9 text-center bg-transparent border-transparent`} />
                                   </div>
                                </div>
                                <button onClick={() => removeModGroup(group.id)} className="w-11 h-11 flex items-center justify-center bg-rose-500/10 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all shrink-0">
                                  <Trash2 size={16} />
                                </button>
                             </div>
                             
                             <div className="p-4 sm:p-6 space-y-3 bg-card/10">
                                {group.options.map((opt) => (
                                   <div key={opt.id} className="flex flex-col sm:flex-row items-center gap-3 bg-elevated/50 p-2 pl-4 pr-2 rounded-2xl border border-border/30">
                                      <input type="text" value={opt.name} onChange={e => updateModOption(group.id, opt.id, { name: e.target.value })} className="flex-1 bg-transparent border-none text-sm font-bold text-main w-full focus:ring-0" placeholder="Option Name" />
                                      <div className="flex items-center gap-3 w-full sm:w-auto">
                                         <div className="relative">
                                           <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-emerald-500/50">+</span>
                                           <input type="number" value={opt.price} onChange={e => updateModOption(group.id, opt.id, { price: parseFloat(e.target.value) || 0 })} className="w-28 h-10 pl-8 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-center font-black text-emerald-500 focus:outline-none" />
                                         </div>
                                         <button onClick={() => removeModOption(group.id, opt.id)} className="w-10 h-10 flex items-center justify-center bg-rose-500/5 text-rose-400 rounded-xl hover:bg-rose-500 hover:text-white transition-all">
                                            <Minus size={14} />
                                         </button>
                                      </div>
                                   </div>
                                ))}
                                <button onClick={() => addModOption(group.id)} className="w-full h-12 border-2 border-dashed border-border/60 hover:border-primary/40 rounded-2xl text-xs font-black text-muted hover:text-primary transition-all flex items-center justify-center uppercase tracking-widest gap-2 bg-elevated/20">
                                   <Plus size={16} /> {lang === 'ar' ? 'إضافة خيار' : 'Append Choice'}
                                </button>
                             </div>
                          </div>
                       ))}
                    </div>
                 </div>
               )}

               {tab === "RECIPE" && (
                 <div className="space-y-8 animate-fade-in relative z-10">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                       <div className="glass-2 p-6 border-amber-500/20 flex flex-col justify-center bg-amber-500/5 shadow-inner">
                         <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">{lang === 'ar' ? 'إجمالي التكلفة' : 'Cost of Goods'}</p>
                         <h4 className="text-2xl font-black text-amber-500">{currency} {recipeCost.toFixed(2)}</h4>
                       </div>
                       <div className="glass-2 p-6 border-emerald-500/20 flex flex-col justify-center bg-emerald-500/5 shadow-inner">
                         <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">{lang === 'ar' ? 'سعر البيع' : 'Retail Price'}</p>
                         <h4 className="text-2xl font-black text-emerald-500">{currency} {item.price.toFixed(2)}</h4>
                       </div>
                       <div className="glass-2 p-6 border-primary/20 flex flex-col justify-center bg-primary/10 shadow-inner">
                         <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">{lang === 'ar' ? 'الهامش المتوقع' : 'Projected Margin'}</p>
                         <h4 className="text-2xl font-black text-primary">
                           {item.price > 0 && recipeCost > 0 ? (((item.price - recipeCost) / item.price) * 100).toFixed(0) + '%' : "—"}
                         </h4>
                       </div>
                    </div>

                    <div className="glass-2 p-4 sm:p-8 border-border/40">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                           <h3 className="text-lg font-black text-main uppercase tracking-widest flex items-center gap-3">
                              <Scale size={20} className="text-primary"/> {lang === 'ar' ? 'ربط المخزون' : 'Inventory Link'}
                           </h3>
                           
                           {item.sizes && item.sizes.length > 0 && (
                             <div className="flex items-center gap-2 bg-elevated/60 p-1.5 rounded-2xl border border-border/30">
                               <button 
                                 onClick={() => setSelectedRecipeSizeId(null)}
                                 className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${!selectedRecipeSizeId ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-muted hover:text-main'}`}
                               >
                                 {lang === 'ar' ? 'عام' : 'Base'}
                               </button>
                               {item.sizes.map(size => (
                                 <button 
                                   key={size.id}
                                   onClick={() => setSelectedRecipeSizeId(size.id)}
                                   className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${selectedRecipeSizeId === size.id ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-muted hover:text-main'}`}
                                 >
                                   {lang === 'ar' ? size.nameAr || size.name : size.name}
                                 </button>
                               ))}
                             </div>
                           )}
                           
                           <span className="glass-badge glass-badge-primary">
                             {activeRecipeIngredients().length} {lang === 'ar' ? 'مكونات' : 'ASSETS'}
                           </span>
                        </div>
                        
                        <div className="flex flex-col sm:flex-row gap-4 mb-8 bg-elevated/40 p-5 rounded-3xl border border-border/30">
                           <div className="flex-1 relative">
                              <label className={subLabelCls}>{lang === 'ar' ? 'اختر صنف مخزني' : 'Select Raw Material'}</label>
                              <input
                                type="search"
                                value={recipeIngredientSearch}
                                onFocus={() => setRecipeSearchOpen(true)}
                                onChange={(e) => {
                                  setRecipeIngredientSearch(e.target.value);
                                  setRecipeIngredientId("");
                                  setRecipeSearchOpen(true);
                                }}
                                className={`${inputCls} h-12 text-sm font-bold`}
                                placeholder={lang === 'ar' ? 'ابحث بالاسم أو SKU أو الباركود...' : 'Search name, SKU, or barcode...'}
                                aria-label={lang === 'ar' ? 'بحث في الأصناف المخزنية' : 'Search inventory ingredients'}
                                autoComplete="off"
                              />
                              {recipeSearchOpen && (
                                <div className="absolute z-40 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-border/40 bg-card p-2 shadow-2xl">
                                  {recipeIngredientOptions.length === 0 ? (
                                    <p className="px-3 py-5 text-center text-xs font-bold text-muted">
                                      {lang === 'ar' ? 'لا توجد نتائج مطابقة' : 'No matching inventory items'}
                                    </p>
                                  ) : recipeIngredientOptions.map((inv) => (
                                    <button
                                      type="button"
                                      key={inv.id}
                                      onMouseDown={(event) => event.preventDefault()}
                                      onClick={() => {
                                        setRecipeIngredientId(inv.id);
                                        setRecipeIngredientSearch(lang === 'ar' ? inv.nameAr || inv.name : inv.name);
                                        setRecipeSearchOpen(false);
                                      }}
                                      className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-start transition-colors hover:bg-primary/10 ${recipeIngredientId === inv.id ? 'bg-primary/10 text-primary' : 'text-main'}`}
                                    >
                                      <span className="min-w-0 truncate text-sm font-black">{lang === 'ar' ? inv.nameAr || inv.name : inv.name}</span>
                                      <span className="shrink-0 text-[10px] font-bold text-muted">{inv.sku || inv.unit}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                           </div>
                           <div className="w-full sm:w-40">
                              <label className={subLabelCls}>{lang === 'ar' ? 'الكمية الصافية' : 'Net Qty'}</label>
                              <input type="number" value={recipeIngredientQty || ""} onChange={e => setRecipeIngredientQty(parseFloat(e.target.value) || 0)} className={`${inputCls} h-12 font-bold`} placeholder="0.00" />
                           </div>
                           <div className="flex items-end">
                              <button onClick={addRecipeIngredient} disabled={!recipeIngredientId || recipeIngredientQty <= 0} className="h-12 px-8 glass-btn glass-btn-primary w-full sm:w-auto text-xs disabled:opacity-50 !rounded-xl">
                                {lang === 'ar' ? 'ربط' : 'LINK'}
                              </button>
                           </div>
                        </div>

                        <div className="space-y-3">
                           {activeRecipeIngredients().map((ri: any) => {
                             const ingredientId = ri.itemId || ri.inventoryItemId;
                             const inv = inventory.find(i => i.id === ingredientId);
                             return (
                               <div key={ingredientId} className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-2xl bg-elevated border border-border/30 group">
                                 <div className="flex-1 flex flex-col justify-center">
                                    <p className="text-sm font-black text-main">{(lang === 'ar' ? inv?.nameAr || inv?.name : inv?.name) || ingredientId}</p>
                                    <p className="text-[10px] font-bold text-muted uppercase tracking-widest">
                                      {ri.quantity} {ri.unit} {lang === 'ar' ? 'لكل بيع' : 'requested'}
                                    </p>
                                 </div>
                                 <div className="flex items-center justify-between sm:justify-start gap-3 sm:gap-4 w-full sm:w-auto">
                                    <p className="text-sm font-black text-amber-500 w-20 text-right">{currency} {(inv ? inv.costPrice * ri.quantity : 0).toFixed(2)}</p>
                                    <input 
                                      type="number" 
                                      value={ri.quantity} 
                                      onChange={e => {
                                        const val = parseFloat(e.target.value) || 0;
                                        const recipes = Array.isArray(item.recipe) ? item.recipe : [];
                                        const isNewFormat = recipes.length > 0 && recipes[0].ingredients;
                                        
                                        if (isNewFormat) {
                                          update({ 
                                            recipe: recipes.map(r => r.sizeId === selectedRecipeSizeId 
                                              ? { ...r, ingredients: r.ingredients.map((i: any) => (i.itemId || i.inventoryItemId) === ingredientId ? { ...i, quantity: val } : i) } 
                                              : r) 
                                          });
                                        } else {
                                          update({ recipe: recipes.map(r => r.itemId === ingredientId ? { ...r, quantity: val } : r) });
                                        }
                                      }} 
                                      className="w-20 h-10 bg-card border border-border/50 text-center font-bold text-main rounded-xl focus:border-primary outline-none" 
                                    />
                                    <button onClick={() => removeRecipeIngredient(ingredientId)} className="w-10 h-10 flex items-center justify-center bg-rose-500/10 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all">
                                      <Trash2 size={16} />
                                    </button>
                                 </div>
                               </div>
                             );
                           })}
                        </div>
                    </div>
                 </div>
               )}

               {tab === "PRICING" && (
                 <div className="space-y-8 animate-fade-in relative z-10">
                    <div className="glass-2 p-4 sm:p-8 border-border/40">
                      <div className="mb-8">
                        <h3 className="text-lg font-black text-main flex items-center gap-3 tracking-widest uppercase">
                          <DollarSign size={20} className="text-emerald-500" />
                          {lang === 'ar' ? 'تخصيص تسعير الفروع' : 'Branch Profit Centers'}
                        </h3>
                        <p className="text-xs font-bold text-muted mt-2 tracking-wide">
                           {lang === 'ar' ? 'عين أسعار خاصة بناءً على الموقع الجغرافي للفرع.' : 'Allocate specialized pricing strategies per geographical node.'}
                        </p>
                      </div>
                      
                      <div className="grid gap-4">
                        {branches.length === 0 && (
                          <div className="p-6 text-center text-muted font-bold text-sm bg-elevated/40 rounded-2xl border border-dashed">
                             No branches configured
                          </div>
                        )}
                        {branches.map(branch => {
                          const bp = item.branchPricing?.find(b => b.branchId === branch.id) || { branchId: branch.id, price: item.price };
                          return (
                            <div key={branch.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-elevated/40 border border-border/30 hover:border-primary/20 transition-colors">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-card border border-border/50 flex items-center justify-center font-black text-main">
                                   {branch.name.charAt(0)}
                                </div>
                                <h4 className="font-bold text-main text-sm">{branch.name}</h4>
                              </div>
                              <div className="w-full sm:w-40 relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-bold">{currency}</span>
                                <input 
                                  type="number"
                                  value={bp.price}
                                  onChange={e => {
                                    const val = parseFloat(e.target.value) || 0;
                                    const current = item.branchPricing || [];
                                    const updated = current.some(b => b.branchId === branch.id) 
                                      ? current.map(b => b.branchId === branch.id ? { ...b, price: val } : b)
                                      : [...current, { branchId: branch.id, price: val }];
                                    update({ branchPricing: updated });
                                  }}
                                  className={`${inputCls} !pl-10 h-11 !bg-card text-center font-black shadow-inner`}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                 </div>
               )}

               {tab === "PLATFORMS" && (
                 <div className="space-y-8 animate-fade-in relative z-10">
                    <div className="glass-2 p-4 sm:p-8 border-border/40">
                      <div className="mb-8">
                        <h3 className="text-lg font-black text-main flex items-center gap-3 tracking-widest uppercase">
                          <Globe size={20} className="text-indigo-500" />
                          {lang === 'ar' ? 'أسعار تطبيقات التوصيل' : 'Delivery Aggregators'}
                        </h3>
                        <p className="text-xs font-bold text-muted mt-2 tracking-wide">
                           {lang === 'ar' ? 'امتص عمولات التطبيقات عبر وضع أسعار مخصصة.' : 'Absorb commission margins by specifying external channel parameters.'}
                        </p>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-5">
                         {platformOptions.map(p => {
                           const pp = item.platformPricing?.find(x => x.platformId === p.id) || { platformId: p.id, price: item.price };
                           return (
                             <div key={p.id} className="p-4 sm:p-6 rounded-3xl bg-elevated/40 border border-border/30 hover:shadow-md hover:border-indigo-500/20 transition-all flex flex-col gap-5">
                               <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center"><Globe size={14}/></div>
                                  <span className="font-black text-main text-sm">{p.name}</span>
                               </div>
                               <div className="relative">
                                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500 font-black">{currency}</span>
                                  <input 
                                    type="number"
                                    value={pp.price}
                                    onChange={e => {
                                      const val = parseFloat(e.target.value) || 0;
                                      const current = item.platformPricing || [];
                                      const updated = current.some(x => x.platformId === p.id) 
                                        ? current.map(x => x.platformId === p.id ? { ...x, price: val } : x)
                                        : [...current, { platformId: p.id, price: val }];
                                      update({ platformPricing: updated });
                                    }}
                                    className={`${inputCls} !pl-10 h-12 !bg-card font-black text-lg text-indigo-500 !border-indigo-500/20 focus:!border-indigo-500`}
                                  />
                               </div>
                             </div>
                           )
                         })}
                      </div>
                    </div>
                 </div>
               )}

               {tab === "SCHEDULE" && (
                 <div className="space-y-6 animate-fade-in relative z-10">
                    <div className="glass-2 p-4 sm:p-8 border-border/40">
                       <h4 className="text-sm font-black text-main uppercase tracking-widest mb-6 flex items-center gap-2">
                         <Clock size={16} className="text-primary"/> {lang === 'ar' ? 'التوفر الأسبوعي' : 'Availability Matrix'}
                       </h4>
                       <div className="flex flex-wrap gap-3">
                          {dayOptions.map(d => {
                            const isActive = item.availableDays?.includes(d.id);
                            return (
                               <button
                                 key={d.id}
                                 onClick={() => toggleDay(d.id)}
                                 className={`flex-1 min-w-[80px] h-12 rounded-xl text-xs font-black uppercase tracking-widest transition-all border
                                   ${isActive ? 'bg-primary border-primary text-white shadow-md shadow-primary/20' : 'bg-elevated/50 border-border/30 text-muted hover:border-primary/40'}`}
                               >
                                  {lang === 'ar' ? d.ar : d.en}
                               </button>
                            )
                          })}
                       </div>
                       
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mt-8">
                          <div>
                            <label className={subLabelCls}>Auto Enable</label>
                            <input type="time" value={item.availableFrom || ""} onChange={e => update({ availableFrom: e.target.value })} className={`${inputCls} h-14 text-center font-black bg-elevated text-lg`} />
                          </div>
                          <div>
                            <label className={subLabelCls}>Auto Disable</label>
                            <input type="time" value={item.availableTo || ""} onChange={e => update({ availableTo: e.target.value })} className={`${inputCls} h-14 text-center font-black bg-elevated text-lg`} />
                          </div>
                       </div>
                    </div>

                 </div>
               )}

               {tab === "PRINTERS" && (
                 <div className="space-y-6 animate-fade-in relative z-10">
                    <div className="glass-2 p-4 sm:p-8 border-border/40">
                       <h4 className="text-sm font-black text-main uppercase tracking-widest mb-2 flex items-center gap-2">
                         <PrinterIcon size={16} className="text-amber-500"/> {lang === 'ar' ? 'طابعات الصنف' : 'Item Printers'}
                       </h4>
                       <p className="mb-6 text-xs font-bold text-muted">
                         {lang === 'ar'
                           ? 'اختر طابعة أو أكثر لهذا الصنف. بدون اختيار سيستخدم الصنف طابعات القسم تلقائياً.'
                           : 'Choose one or more printers for this item. With no selection, category printers are used automatically.'}
                       </p>
                       <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {printers.map(p => {
                             const isActive = item.printerIds?.includes(p.id);
                             return (
                               <button
                                 key={p.id}
                                 type="button"
                                 onClick={() => togglePrinter(p.id)}
                                 className={`h-14 rounded-xl border flex items-center justify-center gap-2 transition-all
                                   ${isActive ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' : 'bg-elevated/40 border-border/30 text-muted hover:bg-elevated hover:text-main'}`}
                               >
                                  <PrinterIcon size={16} />
                                  <span className="text-xs font-black uppercase tracking-widest">{p.name}</span>
                               </button>
                             )
                          })}
                          {printers.length === 0 && (
                            <p className="text-xs font-bold text-muted">
                              {lang === 'ar' ? 'لا توجد طابعات مضافة بعد.' : 'No printers configured yet.'}
                            </p>
                          )}
                       </div>
                    </div>
                 </div>
               )}

               {tab === "HISTORY" && (
                 <div className="space-y-6 animate-fade-in relative z-10">
                    <div className="glass-2 p-4 sm:p-8 border-border/40 min-h-[320px] sm:min-h-[400px]">
                       <h3 className="text-sm font-black text-main uppercase tracking-widest mb-8 flex items-center gap-2">
                         <History size={16} className="text-primary"/> {lang === 'ar' ? 'سجل التعديلات' : 'Audit Trail'}
                       </h3>
                       
                       <div className="space-y-4">
                          {(!item.versionHistory || item.versionHistory.length === 0) ? (
                             <div className="py-20 text-center font-bold text-muted uppercase tracking-widest text-sm border-2 border-dashed border-border/30 rounded-3xl bg-card/20">
                                No mutations recorded
                             </div>
                          ) : (
                             [...(item.versionHistory)].reverse().map((entry, i) => (
                               <div key={i} className="p-4 sm:p-5 rounded-2xl bg-elevated/40 border border-border/30 flex flex-col sm:flex-row items-start gap-4 hover:bg-elevated transition-colors">
                                  <div className="w-1.5 h-12 rounded-full bg-primary/40 shrink-0 mt-1" />
                                  <div className="flex-1">
                                     <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs font-black text-primary uppercase tracking-widest">{entry.field}</span>
                                        <span className="text-[10px] font-bold text-muted">{new Date(entry.timestamp).toLocaleString()}</span>
                                     </div>
                                     <div className="flex items-center flex-wrap gap-3 font-mono text-xs bg-card p-3 rounded-xl border border-border/40 mt-3 inline-flex">
                                        <span className="text-rose-500/70 line-through decoration-2 px-2 border-r border-border/30">{String(entry.oldValue)}</span>
                                        <ArrowRight size={14} className="text-muted/40 shrink-0" />
                                        <span className="text-emerald-500 px-2 font-black">{String(entry.newValue)}</span>
                                     </div>
                                  </div>
                                  <div className="shrink-0 text-right ms-4 bg-card/50 p-2 px-4 rounded-xl border border-border/30">
                                     <span className="block text-[8px] font-black uppercase text-muted/60 tracking-widest mb-1">Operator</span>
                                     <span className="text-xs font-black text-main">{entry.userName}</span>
                                  </div>
                               </div>
                             ))
                          )}
                       </div>
                    </div>
                 </div>
               )}
             </div>
          </div>
        </div>

        {/* Bottom Actions Bar */}
        <div className="shrink-0 p-2.5 sm:p-5 sm:px-8 border-t border-border/30 bg-card/90 backdrop-blur-xl relative z-20">
           <div className="flex items-center gap-2 sm:gap-3 max-w-4xl mx-auto w-full">
                 <button onClick={onClose} className="h-11 sm:h-12 w-11 sm:w-auto sm:px-8 shrink-0 rounded-xl font-black text-xs uppercase tracking-widest text-muted bg-elevated/60 border border-border/40 hover:text-main hover:bg-elevated hover:shadow-sm transition-all" aria-label={lang === 'ar' ? 'رجوع' : 'Cancel'}>
                    <X size={17} className="sm:hidden mx-auto" />
                    <span className="hidden sm:inline">
                    {lang === 'ar' ? 'رجوع' : 'Cancel'}
                    </span>
                 </button>
                 {onDelete && mode === "EDIT" && (
                    <button onClick={onDelete} className="h-11 w-11 sm:h-12 sm:w-12 shrink-0 flex items-center justify-center rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500 hover:text-white shadow-sm transition-all cursor-pointer">
                       <Trash2 size={18} />
                    </button>
                 )}
                 <button 
                   onClick={() => submitItem(false)}
                   disabled={isSaving || !item.name?.trim()}
                    className="h-11 sm:h-12 min-w-0 flex-1 sm:ms-auto sm:flex-none px-2 sm:px-6 rounded-xl font-black text-[10px] sm:text-xs uppercase tracking-wide sm:tracking-widest bg-elevated/80 border border-border/50 text-main hover:bg-elevated transition-all shadow-sm active:scale-95 disabled:opacity-50 whitespace-nowrap"
                 >
                    <Save size={16} className="inline-block mr-2 rtl:ml-2 rtl:mr-0 text-muted" />
                    {lang === 'ar' ? 'حفظ مسودة' : 'Save Draft'}
                 </button>
                 <button 
                   onClick={() => submitItem(false)}
                   disabled={isSaving || !item.name?.trim()}
                    className="h-11 sm:h-12 min-w-0 flex-1 sm:flex-none px-2 sm:px-10 rounded-xl font-black text-[10px] sm:text-xs uppercase tracking-wide sm:tracking-[0.2em] glass-btn-primary transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap"
                 >
                    <Sparkles size={16} className={isSaving ? 'animate-spin' : ''} />
                    {isSaving ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ ونشر' : 'Commit')}
                 </button>
           </div>
        </div>
      </div>
    </>,
    document.body,
  );
};

export default ItemDrawer;
