// MenuCategoryList — Memoized wrapper that prevents re-render when modal state changes
// This is the KEY performance component: it wraps the entire item grid and only re-renders
// when categories/items actually change, NOT when modals open/close.
import React, { memo } from 'react';
import {
  Edit3, Trash2, Layers,
  UtensilsCrossed, ShoppingBag, Map, Truck,
  Printer as PrinterIcon
} from 'lucide-react';
import { MenuCategory, MenuItem } from '../../types';
import MenuItemCard from './MenuItemCard';
import QuickAddCard from './QuickAddCard';

interface MenuCategoryListProps {
  categories: MenuCategory[];
  selectedMenuId: string;
  lang: 'en' | 'ar';
  currencySymbol: string;
  onEditCategory: (category: MenuCategory) => void;
  onDeleteCategory: (menuId: string, categoryId: string) => void;
  onToggleAvailability: (menuId: string, categoryId: string, item: MenuItem) => void;
  onEditItem: (menuId: string, categoryId: string, item: MenuItem) => void;
  onRecipeItem: (menuId: string, categoryId: string, item: MenuItem) => void;
  onDeleteItem: (menuId: string, categoryId: string, itemId: string) => void;
  onQuickAdd: (categoryId: string, name: string, price: string) => void;
}

const MenuCategoryList: React.FC<MenuCategoryListProps> = memo(({
  categories, selectedMenuId, lang, currencySymbol,
  onEditCategory, onDeleteCategory,
  onToggleAvailability, onEditItem, onRecipeItem, onDeleteItem,
  onQuickAdd
}) => {
  if (categories.length === 0) {
    return (
      <div className="py-20 text-center bg-card rounded-[3rem] border border-border">
        <p className="text-muted font-black uppercase tracking-widest">
          {lang === 'ar' ? 'لا توجد مجموعات مرتبطة' : 'No sections linked to this menu'}
        </p>
      </div>
    );
  }

  return (
    <>
      {categories.map(category => (
        <div key={category.id} className="relative z-10 pb-10">
          <div className="flex justify-between items-end mb-8 px-4 border-b border-border/20 pb-6">
            <div className="flex items-center gap-5">
              {category.image ? (
                <div className="relative w-16 h-16">
                  <img src={category.image} alt={category.name} width={64} height={64} loading="lazy" decoding="async" className="relative w-full h-full rounded-[1.2rem] object-cover shadow-lg border border-border/30" />
                </div>
              ) : (
                <div className="p-4 bg-gradient-to-br from-indigo-500/10 to-cyan-500/10 rounded-[1.2rem] text-indigo-400 border border-border/20 shadow-inner">
                  <Layers size={24} />
                </div>
              )}
              <div>
                <h4 className="text-2xl md:text-3xl font-black text-main uppercase tracking-tight drop-shadow-sm">{lang === 'ar' ? (category.nameAr || category.name) : category.name}</h4>
                <div className="flex items-center gap-3 mt-2">
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest px-2.5 py-1 bg-indigo-500/10 rounded-lg border border-indigo-500/20">{category.items.length} {lang === 'ar' ? 'صنف' : 'Items'}</p>
                  {category.printerIds && category.printerIds.length > 0 && (
                    <span className="px-2.5 py-1 bg-elevated/70 text-muted text-[10px] font-black rounded-lg flex items-center gap-1.5 border border-border/20 shadow-sm">
                      <PrinterIcon size={12} /> {category.printerIds.length}
                    </span>
                  )}
                  {category.targetOrderTypes && category.targetOrderTypes.length > 0 && (
                    <div className="flex gap-1">
                      {category.targetOrderTypes.includes('DINE_IN' as any) && <span className="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-500 shadow-sm" title="Dine In"><UtensilsCrossed size={12} /></span>}
                      {category.targetOrderTypes.includes('TAKEAWAY' as any) && <span className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-500 shadow-sm" title="Takeaway"><ShoppingBag size={12} /></span>}
                      {category.targetOrderTypes.includes('PICKUP' as any) && <span className="p-1.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-500 shadow-sm" title="Pickup"><Map size={12} /></span>}
                      {category.targetOrderTypes.includes('DELIVERY' as any) && <span className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 shadow-sm" title="Delivery"><Truck size={12} /></span>}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onEditCategory(category)}
                className="p-3 bg-card/60 rounded-[1rem] border border-border/20 text-muted hover:text-indigo-400 hover:border-indigo-500/30 hover:bg-indigo-500/10 transition-all shadow-sm active:scale-95"
              >
                <Edit3 size={18} />
              </button>
              <button onClick={() => onDeleteCategory(selectedMenuId, category.id)} className="p-3 bg-card/60 rounded-[1rem] border border-border/20 text-muted hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-500/10 transition-all shadow-sm active:scale-95">
                <Trash2 size={18} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {category.items.map((item, idx) => (
              <MenuItemCard
                key={item.id}
                item={item}
                idx={idx}
                menuId={selectedMenuId}
                categoryId={category.id}
                lang={lang}
                currencySymbol={currencySymbol}
                onToggleAvailability={onToggleAvailability}
                onEdit={onEditItem}
                onRecipe={onRecipeItem}
                onDelete={onDeleteItem}
              />
            ))}
            <QuickAddCard
              categoryId={category.id}
              lang={lang}
              onQuickAdd={onQuickAdd}
            />
          </div>
        </div>
      ))}
    </>
  );
}, (prev, next) => {
  // Only re-render when actual data changes
  return (
    prev.categories === next.categories &&
    prev.selectedMenuId === next.selectedMenuId &&
    prev.lang === next.lang &&
    prev.currencySymbol === next.currencySymbol
  );
});

MenuCategoryList.displayName = 'MenuCategoryList';

export default MenuCategoryList;
