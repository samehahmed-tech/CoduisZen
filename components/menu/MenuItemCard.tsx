// MenuItemCard — Memoized for INP performance
import React, { memo } from 'react';
import {
  Trash2, Eye, EyeOff, Scale,
  Printer as PrinterIcon
} from 'lucide-react';
import { MenuItem } from '../../types';
import { ItemImage } from '../../src/features/pos/components/ItemImage';

interface MenuItemCardProps {
  item: MenuItem;
  idx: number;
  menuId: string;
  categoryId: string;
  lang: 'en' | 'ar';
  currencySymbol: string;
  onToggleAvailability: (menuId: string, categoryId: string, item: MenuItem) => void;
  onEdit: (menuId: string, categoryId: string, item: MenuItem) => void;
  onRecipe: (menuId: string, categoryId: string, item: MenuItem) => void;
  onDelete: (menuId: string, categoryId: string, itemId: string) => void;
}

const MenuItemCard: React.FC<MenuItemCardProps> = memo(({
  item, idx, menuId, categoryId, lang, currencySymbol,
  onToggleAvailability, onEdit, onRecipe, onDelete
}) => {
  const isWide = item.layoutType === 'wide';

  return (
    <div
      className={`bg-card/60 rounded-[2.5rem] border border-border/20 p-6 shadow-lg hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)] hover:-translate-y-2 hover:border-border/30 transition-all duration-150 group relative flex flex-col h-full overflow-hidden ${isWide ? 'md:col-span-2' : ''}`}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 420px' }}
    >
      <div className="absolute top-6 left-6 flex gap-2 z-10">
        {item.sortOrder !== undefined && <span className="px-3 py-1.5 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white text-[9px] font-black rounded-[0.8rem] shadow-lg tracking-widest border border-indigo-400/50">#{item.sortOrder}</span>}
        {item.printerIds && item.printerIds.length > 0 && <span className="px-3 py-1.5 bg-card/80 border border-border/30 text-muted text-[9px] font-black rounded-[0.8rem] flex items-center gap-1.5 shadow-sm"><PrinterIcon size={10} /> {item.printerIds.length}</span>}
      </div>
      <button
        onClick={() => onToggleAvailability(menuId, categoryId, item)}
        className={`absolute top-6 right-6 p-3 rounded-xl z-10 transition-all duration-150 hover:scale-110 active:scale-95 shadow-lg border ${item.isAvailable ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20'}`}
        title={item.isAvailable ? (lang === 'ar' ? 'تعطيل الصنف (86)' : 'Disable item (86)') : (lang === 'ar' ? 'تفعيل الصنف' : 'Enable item')}
      >
        {item.isAvailable ? <Eye size={16} /> : <EyeOff size={16} />}
      </button>

      <div className={`mb-8 flex ${isWide ? 'justify-start gap-8 mt-12' : 'justify-center flex-col items-center mt-6'} relative z-10`}>
        <div className={`relative ${isWide ? 'w-40 h-40' : 'w-48 h-48'}`}>
            <ItemImage
              src={item.image}
              name={lang === 'ar' ? (item.nameAr || item.name) : item.name}
              className="rounded-[2.5rem] shadow-[0_10px_20px_rgba(0,0,0,0.3)] border border-border/30"
            />
        </div>

        <div className={`${isWide ? 'text-left flex-1 py-4' : 'text-center mt-8'}`}>
          <h5 className="font-black text-xl lg:text-2xl text-main mb-2 tracking-tight group-hover:text-indigo-400 transition-colors duration-150 drop-shadow-sm">{lang === 'ar' ? (item.nameAr || item.name) : item.name}</h5>
          <p className="text-2xl lg:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400 tracking-tighter drop-shadow-sm">{currencySymbol} {item.price.toFixed(2)}</p>
          {isWide && item.description && <p className="text-xs text-muted font-bold line-clamp-3 mt-4 leading-relaxed">{lang === 'ar' ? (item.descriptionAr || item.description) : item.description}</p>}
        </div>
      </div>

      <div className="mt-auto flex gap-3 pt-6 border-t border-border/20 relative z-10">
        <button onClick={() => onEdit(menuId, categoryId, item)} className="flex-[3] py-4 bg-indigo-500/10 hover:bg-gradient-to-r hover:from-indigo-500 hover:to-cyan-500 text-indigo-400 hover:text-white border border-indigo-500/20 rounded-[1.2rem] text-[10px] font-black uppercase tracking-[0.2em] transition-all hover:shadow-[0_10px_20px_rgba(99,102,241,0.3)] active:scale-95 duration-150">Edit Details</button>
        <button onClick={() => onRecipe(menuId, categoryId, item)} className="flex-1 flex items-center justify-center p-4 bg-card/60 border border-border/20 text-muted hover:text-amber-400 hover:border-amber-400/30 rounded-[1.2rem] transition-all shadow-sm hover:bg-amber-500/10 active:scale-95 duration-150" title="Manage Recipe"><Scale size={18} /></button>
        <button onClick={() => onDelete(menuId, categoryId, item.id)} className="flex-1 flex items-center justify-center p-4 bg-card/60 border border-border/20 text-muted hover:text-rose-400 hover:border-rose-400/30 rounded-[1.2rem] transition-all shadow-sm hover:bg-rose-500/10 active:scale-95 duration-150" title="Delete Item"><Trash2 size={18} /></button>
      </div>
    </div>
  );
}, (prev, next) => {
  // Deep comparison on actual data fields, not object reference
  // Store creates new objects on every update, so reference equality always fails
  if (prev.menuId !== next.menuId) return false;
  if (prev.categoryId !== next.categoryId) return false;
  if (prev.lang !== next.lang) return false;
  if (prev.currencySymbol !== next.currencySymbol) return false;
  if (prev.idx !== next.idx) return false;
  // Compare actual item data fields that affect rendering
  const a = prev.item, b = next.item;
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.nameAr === b.nameAr &&
    a.price === b.price &&
    a.image === b.image &&
    a.isAvailable === b.isAvailable &&
    a.sortOrder === b.sortOrder &&
    a.layoutType === b.layoutType &&
    a.description === b.description &&
    a.descriptionAr === b.descriptionAr &&
    a.printerIds?.length === b.printerIds?.length
  );
});

MenuItemCard.displayName = 'MenuItemCard';

export default MenuItemCard;
