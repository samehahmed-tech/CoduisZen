// QuickAddCard — Memoized to isolate input state from parent re-renders
import React, { memo, useState, useCallback } from 'react';
import { Plus, Sparkles, DollarSign } from 'lucide-react';

interface QuickAddCardProps {
  categoryId: string;
  lang: 'en' | 'ar';
  onQuickAdd: (categoryId: string, name: string, price: string) => void;
}

const QuickAddCard: React.FC<QuickAddCardProps> = memo(({ categoryId, lang, onQuickAdd }) => {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [isActive, setIsActive] = useState(false);

  const handleSubmit = useCallback(() => {
    if (!name.trim() || !price) return;
    onQuickAdd(categoryId, name.trim(), price);
    setName('');
    setPrice('');
  }, [categoryId, name, price, onQuickAdd]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  }, [handleSubmit]);

  return (
    <div className="bg-card/40  rounded-[2.5rem] border border-dashed border-border/40 p-6 flex flex-col items-center justify-center min-h-[300px] hover:bg-card/60 transition-all duration-150 group">
      <div className="w-full space-y-4 relative z-10 transition-all duration-150">
        <div className="bg-elevated/30 rounded-[1.5rem] p-4 flex flex-col gap-3 group-hover:bg-elevated/50 transition-colors border border-border/20">
          <div className="flex items-center gap-2 text-indigo-400 font-black text-[10px] uppercase tracking-[0.2em] mb-2">
            <Sparkles size={14} className="text-cyan-400" />
            {lang === 'ar' ? 'إضافة سريعة' : 'Quick Add'}
          </div>
          <input
            type="text"
            placeholder={lang === 'ar' ? 'اسم الصنف الجديد...' : 'New item name...'}
            value={name}
            onChange={(e) => { setName(e.target.value); setIsActive(true); }}
            onKeyDown={handleKeyDown}
            className="w-full bg-card/50 px-4 py-3 rounded-xl border border-border/30 text-sm font-bold text-main outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-muted/50"
          />
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-muted w-4 h-4" />
              <input
                type="number"
                placeholder="0.00"
                value={price}
                onChange={(e) => { setPrice(e.target.value); setIsActive(true); }}
                onKeyDown={handleKeyDown}
                className="w-full bg-card/50 pl-9 pr-4 py-3 rounded-xl border border-border/30 text-sm font-black text-emerald-400 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all placeholder:text-muted/50"
              />
            </div>
            <button
              onClick={handleSubmit}
              disabled={!name.trim() || !price}
              className="bg-indigo-500/20 text-indigo-400 hover:bg-gradient-to-r hover:from-indigo-500 hover:to-cyan-500 hover:text-white p-3 rounded-xl transition-all disabled:opacity-50 disabled:pointer-events-none active:scale-95"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>
      </div>
      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40 group-hover:opacity-0 transition-opacity">
          <Plus size={48} className="text-muted" />
        </div>
      )}
    </div>
  );
});

QuickAddCard.displayName = 'QuickAddCard';

export default QuickAddCard;
