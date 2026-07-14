import React from 'react';
import { motion } from 'framer-motion';
import { Plus, Sparkles } from 'lucide-react';
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
      className="group flex min-h-[360px] flex-col overflow-hidden rounded-[2rem] kiosk-plate transition-all duration-300"
    >
      <div className="relative min-h-[220px] flex-1 overflow-hidden">
        {item.image ? (
          <img src={item.image} alt={item.name} className="absolute inset-0 h-full w-full object-cover opacity-90 group-hover:scale-110 transition-transform duration-700" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-7xl opacity-45 select-none">🍱</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/25 to-transparent" />
        <div className="absolute top-3 right-3 h-9 px-3 rounded-2xl bg-white/15 backdrop-blur-md border border-white/10 flex items-center gap-2 text-white">
          <Sparkles size={14} className="kiosk-accent" />
          <span className="text-xs font-black">{tr('Fresh', 'طازة')}</span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
          <h3 className="text-2xl font-black leading-tight line-clamp-2">
            {isAr ? (item.nameAr || item.name) : item.name}
          </h3>
          <p className="mt-2 text-sm font-semibold text-white/65 line-clamp-2 min-h-[2.5rem]">
            {isAr ? (item.descriptionAr || item.description) : item.description}
          </p>
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-between gap-3 bg-black/72 p-4 backdrop-blur-md">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-white/45 uppercase tracking-widest leading-none mb-1">{tr('Price', 'السعر')}</span>
          <span className="text-2xl lg:text-3xl font-black text-white">
            {item.price} <small className="text-sm font-bold uppercase">{currency}</small>
          </span>
        </div>
        
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => onAdd(item)}
          className="h-14 min-w-28 rounded-2xl kiosk-btn-primary flex items-center justify-center gap-2 shrink-0 text-sm uppercase tracking-widest"
        >
          <Plus size={30} strokeWidth={3} />
          {tr('Add', 'أضف')}
        </motion.button>
      </div>
    </motion.div>
  );
};

export default KioskItemCard;
