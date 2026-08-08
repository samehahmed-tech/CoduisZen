import React from 'react';

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

const KioskCategoryRail: React.FC<KioskCategoryRailProps> = ({ categories, activeCategoryId, onSelectCategory, lang }) => (
  <nav className="kiosk-category-rail" aria-label={lang === 'ar' ? 'أقسام المنيو' : 'Menu categories'}>
    {categories.map(category => (
      <button
        key={category.id}
        type="button"
        aria-pressed={activeCategoryId === category.id}
        onClick={() => onSelectCategory(category.id)}
        className="kiosk-category-button"
      >
        <span className="kiosk-category-icon" aria-hidden="true">{category.icon || '●'}</span>
        <span>{lang === 'ar' ? category.nameAr || category.name : category.name}</span>
      </button>
    ))}
  </nav>
);

export default KioskCategoryRail;
