import React from 'react';
import { MenuCategory } from '@/types';

interface CategoryTabsProps {
    categories: MenuCategory[];
    activeCategory: string;
    onSetCategory: (category: string) => void;
    isTouchMode: boolean;
    lang: 'en' | 'ar';
    t?: any;
    counts?: Record<string, number>;
    totalCount?: number;
    hasActiveFiltering?: boolean;
}

const CategoryTabs: React.FC<CategoryTabsProps> = React.memo(({
    categories,
    activeCategory,
    onSetCategory,
    isTouchMode,
    lang,
    counts = {},
    totalCount = 0,
    hasActiveFiltering = false,
}) => {
    const validCategories = categories
        .filter(c => c.isActive !== false)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    const isRTL = lang === 'ar';

    return (
        <div className="w-full bg-card/80  border-b border-border/30">
            <div className="flex items-center gap-2 px-3 md:px-5 py-3 overflow-x-auto no-scrollbar scroll-smooth">
                {validCategories.map((cat) => {
                    const isActive = activeCategory === cat.id;
                    const count = counts[cat.id] || 0;
                    const isDisabled = hasActiveFiltering && count === 0;

                    return (
                        <button
                            key={cat.id}
                            onClick={() => onSetCategory(cat.id)}
                            disabled={isDisabled}
                            className={`
                                shrink-0 inline-flex items-center gap-2 px-5 py-3.5 rounded-xl text-sm font-bold transition-all border outline-none
                                ${isActive
                                    ? 'bg-primary text-white border-transparent shadow-md'
                                    : 'bg-card text-muted border-border/40 hover:border-primary/40 hover:text-main'
                                }
                                ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer active:scale-95'}
                            `}
                        >
                            <span className="whitespace-nowrap relative z-10 text-[11px]">
                                {isRTL ? ((cat as any).nameAr || cat.name) : cat.name}
                            </span>
                            {hasActiveFiltering && (
                                <span className={`text-[10px] tabular-nums font-black px-2 py-0.5 rounded-lg shadow-inner relative z-10 ${isActive ? 'bg-white/20 text-white font-bold' : 'bg-elevated/80 border border-border/50 text-primary'
                                    }`}>
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
});

export default CategoryTabs;
