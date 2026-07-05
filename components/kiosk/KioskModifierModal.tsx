import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Plus, Minus, Info } from 'lucide-react';
import { MenuItem, ModifierGroup, ModifierOption } from '../../types';

interface KioskModifierModalProps {
  item: MenuItem;
  onClose: () => void;
  onConfirm: (item: MenuItem, selectedModifiers: any[], quantity: number) => void;
  lang: string;
  currency: string;
}

const KioskModifierModal: React.FC<KioskModifierModalProps> = ({ 
  item, 
  onClose, 
  onConfirm, 
  lang, 
  currency 
}) => {
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [error, setError] = useState('');
  const isAr = lang === 'ar';
  const tr = (en: string, ar: string) => isAr ? ar : en;

  const handleToggleOption = (groupId: string, option: ModifierOption, max: number) => {
    setSelections(prev => {
      const current = prev[groupId] || [];
      if (current.includes(option.id)) {
        return { ...prev, [groupId]: current.filter(id => id !== option.id) };
      }
      if (max === 1) {
        return { ...prev, [groupId]: [option.id] };
      }
      if (current.length < max) {
        return { ...prev, [groupId]: [...current, option.id] };
      }
      return prev;
    });
  };

  const totalPrice = useMemo(() => {
    let extra = 0;
    Object.entries(selections).forEach(([groupId, optionIds]) => {
      const group = item.modifierGroups?.find(g => g.id === groupId);
      optionIds.forEach(id => {
        const option = group?.options.find(o => o.id === id);
        if (option) extra += option.price;
      });
    });
    return (item.price + extra) * quantity;
  }, [item, selections, quantity]);

  const missingRequiredGroups = useMemo(
    () => (item.modifierGroups || []).filter(group => (selections[group.id]?.length || 0) < group.minSelection),
    [item.modifierGroups, selections]
  );

  const handleConfirm = () => {
    if (missingRequiredGroups.length > 0) {
      setError(tr('Please complete the required choices.', 'من فضلك أكمل الاختيارات المطلوبة.'));
      return;
    }
    const finalModifiers: any[] = [];
    Object.entries(selections).forEach(([groupId, optionIds]) => {
      const group = item.modifierGroups?.find(g => g.id === groupId);
      optionIds.forEach(id => {
        const opt = group?.options.find(o => o.id === id);
        if (opt) finalModifiers.push({ ...opt, groupId });
      });
    });
    onConfirm(item, finalModifiers, quantity);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xl"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        className="glass-panel w-full max-w-6xl h-[92vh] rounded-[32px] lg:rounded-[52px] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 sm:p-8 border-b border-white/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-slate-900 overflow-hidden shadow-2xl shrink-0">
              {item.image ? (
                <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl">🍱</div>
              )}
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-black mb-2 line-clamp-1">{isAr ? (item.nameAr || item.name) : item.name}</h2>
              <p className="text-slate-400 font-medium line-clamp-2">{isAr ? (item.descriptionAr || item.description) : item.description}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 active:scale-90 transition-transform shrink-0"
          >
            <X size={32} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-8 no-scrollbar">
          {item.modifierGroups?.map((group) => (
            <section key={group.id} className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl sm:text-3xl font-black tracking-tight">{isAr ? (group.nameAr || group.name) : group.name}</h3>
                  <div className="flex items-center gap-2 text-indigo-400 mt-2 font-bold uppercase tracking-wider text-xs">
                    <Info size={14} />
                    <span>{tr('Select', 'اختر')} {group.minSelection} {tr('to', 'إلى')} {group.maxSelection}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {group.options.map((opt) => {
                  const isSelected = selections[group.id]?.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      onClick={() => handleToggleOption(group.id, opt, group.maxSelection)}
                      className={`relative flex items-center justify-between p-4 sm:p-5 rounded-[24px] border-2 transition-all duration-300 ${
                        isSelected 
                          ? 'bg-indigo-600/20 border-indigo-500 shadow-[0_0_20px_rgba(79,70,229,0.1)]' 
                          : 'bg-white/5 border-white/5 hover:border-white/10'
                      }`}
                    >
                      <div className="text-left">
                        <p className="font-black text-xl mb-1">{isAr ? (opt.nameAr || opt.name) : opt.name}</p>
                        {opt.price > 0 && (
                          <p className="text-indigo-400 font-bold">+{opt.price} {currency}</p>
                        )}
                      </div>
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center transition-all ${
                        isSelected ? 'bg-indigo-500 text-white scale-110' : 'bg-white/10 text-transparent'
                      }`}>
                        <Check size={24} strokeWidth={4} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          
          {/* Quantity Section */}
          <section className="bg-white/5 p-5 sm:p-8 rounded-[32px] border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="space-y-1">
              <h3 className="text-2xl sm:text-3xl font-black tracking-tight">{tr('Quantity', 'الكمية')}</h3>
              <p className="text-slate-400 font-medium">{tr('How many would you like?', 'تحب كام قطعة؟')}</p>
            </div>
            <div className="flex items-center gap-5 bg-black/40 p-3 rounded-3xl border border-white/10">
              <button 
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="h-14 w-14 rounded-2xl bg-white/5 flex items-center justify-center active:scale-90 transition-transform"
              >
                <Minus size={32} />
              </button>
              <span className="text-4xl font-black min-w-[64px] text-center">{quantity}</span>
              <button 
                onClick={() => setQuantity(quantity + 1)}
                className="h-14 w-14 rounded-2xl bg-indigo-600 flex items-center justify-center active:scale-90 transition-transform shadow-lg shadow-indigo-600/20"
              >
                <Plus size={32} />
              </button>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="p-5 sm:p-8 border-t border-white/10 bg-white/[0.02] flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-sm mb-1">{tr('Total for items', 'إجمالي الأصناف')}</p>
            <p className="text-3xl sm:text-4xl font-black text-indigo-400">
              {totalPrice.toLocaleString()} <small className="text-xl font-bold uppercase">{currency}</small>
            </p>
            {error && <p className="mt-3 text-sm font-black text-rose-400">{error}</p>}
          </div>
          <button
            onClick={handleConfirm}
            className="h-16 sm:h-20 w-full sm:w-auto px-8 sm:px-12 rounded-[24px] bg-indigo-600 hover:bg-indigo-500 text-xl sm:text-2xl font-black shadow-[0_20px_50px_rgba(79,70,229,0.3)] active:scale-95 transition-all flex items-center justify-center gap-3"
          >
            {tr('Add to Bag', 'إضافة للطلب')}
            <Plus size={36} strokeWidth={3} />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default KioskModifierModal;
