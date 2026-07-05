import React from 'react';
import { motion } from 'framer-motion';

interface Category {
  id: string;
  name: string;
  nameAr?: string;
  icon?: string;
}

interface KioskCategoryRailProps {
  categories: Category[];
  activeCategoryId: string | null;
  onSelectCategory: (id: string) => void;
  lang: string;
}

const KioskCategoryRail: React.FC<KioskCategoryRailProps> = ({ 
  categories, 
  activeCategoryId, 
  onSelectCategory,
  lang 
}) => {
  return (
    <div className="flex w-full lg:w-44 xl:w-48 flex-row lg:flex-col gap-3 lg:gap-4 overflow-x-auto lg:overflow-y-auto pb-2 lg:pb-8 lg:pr-2 no-scrollbar shrink-0">
      {categories.map((cat, idx) => (
        <motion.button
          key={cat.id}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: idx * 0.05 }}
          onClick={() => onSelectCategory(cat.id)}
          className={`min-w-[8rem] lg:min-w-0 flex flex-row lg:flex-col items-center justify-center gap-3 lg:gap-0 p-4 lg:p-5 rounded-[24px] lg:rounded-[28px] transition-all duration-300 border-2 group ${
            activeCategoryId === cat.id 
              ? 'bg-indigo-600 border-indigo-400 shadow-[0_15px_35px_rgba(79,70,229,0.4)] scale-105' 
              : 'bg-white/5 border-white/5 hover:border-white/10'
          }`}
        >
          <span className="text-3xl lg:text-4xl lg:mb-3 group-hover:scale-110 transition-transform duration-300">
            {cat.icon || '🍔'}
          </span>
          <span className="text-xs lg:text-sm font-black text-center leading-tight tracking-wide">
            {lang === 'ar' ? (cat.nameAr || cat.name) : cat.name}
          </span>
        </motion.button>
      ))}
    </div>
  );
};

export default KioskCategoryRail;
