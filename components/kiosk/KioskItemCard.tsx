import React from 'react';
import { motion } from 'framer-motion';
import { ShoppingBag, Star } from 'lucide-react';
import { MenuItem } from '../../types';

interface KioskItemCardProps {
  item: MenuItem;
  onAdd: (item: MenuItem) => void;
  lang: string;
  currency: string;
}

const KioskItemCard: React.FC<KioskItemCardProps> = ({ item, onAdd, lang, currency }) => {
  const isAr = lang === 'ar';
  const tr = (en: string, ar: string) => isAr ? ar : en;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -8 }}
      className="glass-panel rounded-[28px] lg:rounded-[36px] p-4 lg:p-5 flex flex-col group transition-all duration-300"
    >
      <div className="relative aspect-[4/3] sm:aspect-square rounded-[22px] lg:rounded-[28px] overflow-hidden mb-4 bg-slate-900 shadow-inner">
        {item.image ? (
          <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-6xl opacity-30 select-none">🍱</div>
        )}
        
        {/* Quality Badge */}
        <div className="absolute top-4 right-4 h-10 px-3 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 flex items-center gap-2">
          <Star size={14} className="text-amber-400 fill-amber-400" />
          <span className="text-sm font-bold">4.9</span>
        </div>
      </div>

      <div className="px-1 lg:px-2">
        <h3 className="text-xl lg:text-2xl font-black mb-2 line-clamp-1 tracking-tight">
          {isAr ? (item.nameAr || item.name) : item.name}
        </h3>
        <p className="text-slate-400 text-sm mb-4 line-clamp-2 leading-relaxed font-medium">
          {isAr ? (item.descriptionAr || item.description) : item.description}
        </p>
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 px-1 lg:px-2">
        <div className="flex flex-col">
          <span className="text-sm font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">{tr('Price', 'السعر')}</span>
          <span className="text-2xl lg:text-3xl font-black text-indigo-400">
            {item.price} <small className="text-sm font-bold uppercase">{currency}</small>
          </span>
        </div>
        
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => onAdd(item)}
          className="h-14 w-14 lg:h-16 lg:w-16 rounded-2xl lg:rounded-3xl bg-indigo-600 flex items-center justify-center shadow-[0_10px_25px_rgba(79,70,229,0.4)] active:bg-indigo-500 transition-colors shrink-0"
        >
          <ShoppingBag size={28} />
        </motion.button>
      </div>
    </motion.div>
  );
};

export default KioskItemCard;
