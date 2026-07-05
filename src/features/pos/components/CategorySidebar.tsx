import React, { useMemo, useCallback } from 'react';
import { MenuCategory } from '@/types';
import {
    LayoutGrid, Coffee, Pizza, Utensils, GlassWater, IceCream,
    Salad, Soup, Sandwich, Beef, Fish, Cake, Sparkles, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';

interface CategorySidebarProps {
    categories: MenuCategory[];
    activeCategory: string;
    onSetCategory: (category: string) => void;
    lang: 'en' | 'ar';
    counts?: Record<string, number>;
    totalCount?: number;
    collapsed?: boolean;
    onToggleCollapse?: () => void;
}

const iconMap: [RegExp, React.ReactNode][] = [
    [/coffee|قهوة|ساخن/i, <Coffee size={15} />],
    [/pizza|بيتزا/i, <Pizza size={15} />],
    [/drink|مشروب|عصير|بارد/i, <GlassWater size={15} />],
    [/ice|dessert|حلو|آيس|ايس/i, <IceCream size={15} />],
    [/salad|سلط/i, <Salad size={15} />],
    [/soup|شورب/i, <Soup size={15} />],
    [/sandwich|ساندو|فطار|breakfast/i, <Sandwich size={15} />],
    [/meat|لحم|ستيك|مشوي|فراخ|دجاج|chicken/i, <Beef size={15} />],
    [/fish|سمك|بحر/i, <Fish size={15} />],
    [/cake|كيك|تورت/i, <Cake size={15} />],
    [/special|عرض|مميز/i, <Sparkles size={15} />],
];

const getIcon = (name: string) => {
    for (const [re, icon] of iconMap) {
        if (re.test(name)) return icon;
    }
    return <Utensils size={15} />;
};

/* ??? Category Button ??? */
const CategoryButton: React.FC<{
    label: string;
    image?: string;
    icon: React.ReactNode;
    count?: number;
    isActive: boolean;
    collapsed: boolean;
    isRTL: boolean;
    onClick: () => void;
}> = React.memo(({ label, image, icon, count, isActive, collapsed, isRTL, onClick }) => (
    <button
        onClick={onClick}
        title={label}
        className={`group relative w-full overflow-hidden rounded-lg border text-left transition-all duration-100 will-change-transform
            ${collapsed ? 'px-0 py-2 flex justify-center' : 'px-2 py-1.5'}
            ${isActive
                ? 'border-primary/25 bg-primary text-white shadow-sm shadow-primary/10'
                : 'border-transparent bg-transparent text-main hover:bg-elevated/60 hover:border-border/15 active:scale-[0.97]'
            }`}
    >
        <div className={`relative z-10 flex ${collapsed ? 'justify-center' : 'items-center gap-2'}`}>
            <div className={`flex shrink-0 items-center justify-center rounded-md h-7 w-7 ${isActive ? 'bg-white/15' : 'bg-elevated/50'}`}>
                {image
                    ? <img src={image} alt="" className="h-full w-full rounded-md object-cover" loading="lazy" />
                    : icon}
            </div>

            {!collapsed && (
                <div className="min-w-0 flex-1 flex items-center justify-between gap-1">
                    <span className={`truncate text-[11px] font-bold leading-tight ${isActive ? 'text-white' : 'text-main'}`}>
                        {label}
                    </span>
                    {typeof count === 'number' && count > 0 && (
                        <span className={`shrink-0 text-[8px] font-bold tabular-nums ${isActive ? 'text-white/60' : 'text-muted/60'}`}>
                            {count}
                        </span>
                    )}
                </div>
            )}
        </div>
    </button>
));

/* ??? Sidebar ??? */
const CategorySidebar: React.FC<CategorySidebarProps> = React.memo(({
    categories, activeCategory, onSetCategory, lang,
    counts, totalCount, collapsed = false, onToggleCollapse,
}) => {
    const isRTL = lang === 'ar';

    const sorted = useMemo(
        () => [...categories].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
        [categories]
    );

    const handleClick = useCallback((id: string) => {
        onSetCategory(id);
    }, [onSetCategory]);

    return (
        <aside
            className={`hidden lg:flex h-full shrink-0 flex-col overflow-hidden border-r border-border/8 bg-card/40 transition-all duration-150 will-change-[width]
                ${collapsed ? 'w-[56px]' : 'w-[148px] xl:w-[160px]'}`}
            style={{ transform: 'translate3d(0,0,0)' }}
        >
            {/* Header — minimal */}
            <div className="shrink-0 px-1.5 py-1.5 flex items-center justify-between border-b border-border/8">
                {!collapsed && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted px-1">{isRTL ? 'الأقسام' : 'Menu'}</span>
                )}
                {onToggleCollapse && (
                    <button
                        onClick={onToggleCollapse}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/10 bg-elevated/30 text-muted transition-colors hover:text-main hover:bg-elevated mx-auto"
                    >
                        {collapsed ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}
                    </button>
                )}
            </div>

            {/* All Items */}
            <div className="shrink-0 px-1.5 py-1">
                <CategoryButton
                    label={isRTL ? 'الكل' : 'All'}
                    icon={<LayoutGrid size={15} />}
                    count={totalCount}
                    isActive={activeCategory === 'all'}
                    collapsed={collapsed}
                    isRTL={isRTL}
                    onClick={() => handleClick('all')}
                />
            </div>

            <div className="mx-1.5 h-px shrink-0 bg-border/8" />

            {/* Categories */}
            <div className="flex-1 overflow-y-auto pos-scroll px-1.5 py-1 space-y-0.5">
                {sorted.map((category) => (
                    <CategoryButton
                        key={category.id}
                        label={isRTL ? (category.nameAr || category.name) : category.name}
                        image={category.image}
                        icon={getIcon(category.name)}
                        count={counts?.[category.id]}
                        isActive={activeCategory === category.id}
                        collapsed={collapsed}
                        isRTL={isRTL}
                        onClick={() => handleClick(category.id)}
                    />
                ))}
            </div>
        </aside>
    );
});

export default CategorySidebar;
