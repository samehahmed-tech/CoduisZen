
import React from 'react';
import {
    UtensilsCrossed, Gift, Clock, Archive,
    ChevronRight, Layers, Plus, Edit3, GripVertical, DollarSign
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { RestaurantMenu, MenuCategory, MenuItem } from '../../types';

interface Props {
    menus: RestaurantMenu[];
    categories: MenuCategory[];
    selectedMenuId: string;
    onSelectMenu: (id: string) => void;
    selectedCategoryId?: string | 'all';
    onSelectCategory?: (id: string | 'all') => void;
    section: 'menus' | 'offers' | 'scheduled' | 'archived' | 'pricing';
    onChangeSection: (s: 'menus' | 'offers' | 'scheduled' | 'archived' | 'pricing') => void;
    onAddCategory: () => void;
    onEditCategory: (cat: MenuCategory) => void;
    onReorderCategories?: (reorderedCategories: MenuCategory[]) => void;
    allItems: (MenuItem & { _categoryName: string })[];
    totalRevenue: number;
    avgMargin: number;
    lang: string;
    currency: string;
}

const MenuSidebar: React.FC<Props> = ({
    menus, categories, selectedMenuId, onSelectMenu,
    selectedCategoryId, onSelectCategory,
    section, onChangeSection, onAddCategory, onEditCategory,
    onReorderCategories,
    allItems, totalRevenue, avgMargin, lang, currency
}) => {

    const getHealthDot = (cat: MenuCategory) => {
        const items = cat.items.filter(i => !i.archivedAt);
        const withCost = items.filter(i => i.cost && i.price > 0);
        if (withCost.length === 0) return 'bg-gray-400';
        const avg = withCost.reduce((s, i) => s + ((i.price - (i.cost || 0)) / i.price) * 100, 0) / withCost.length;
        if (avg >= 50) return 'bg-emerald-500';
        if (avg >= 30) return 'bg-amber-500';
        return 'bg-rose-500';
    };

    const sections = [
        { id: 'menus' as const, icon: UtensilsCrossed, labelEn: 'Menus', labelAr: 'القوائم' },
        { id: 'pricing' as const, icon: DollarSign, labelEn: 'Pricing Engine', labelAr: 'إدارة التسعير' },
        { id: 'offers' as const, icon: Gift, labelEn: 'Offers', labelAr: 'العروض' },
        { id: 'scheduled' as const, icon: Clock, labelEn: 'Scheduled Promotions', labelAr: 'العروض المجدولة' },
        { id: 'archived' as const, icon: Archive, labelEn: 'Archived Items', labelAr: 'الأرشيف' },
    ];

    const currentMenuCategories = categories.filter(c => c.menuIds.includes(selectedMenuId))
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    const onDragEnd = (result: DropResult) => {
        if (!result.destination || !onReorderCategories) return;

        const items = Array.from(currentMenuCategories);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);

        // Update sortOrder for the reordered items
        const updatedItems = items.map((item, index) => ({
            ...item,
            sortOrder: index
        }));

        onReorderCategories(updatedItems);
    };

    return (
        <div className="w-full lg:w-60 max-h-[42vh] lg:max-h-none bg-card border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-white/[0.06] flex flex-col overflow-hidden shrink-0">
            {/* Header */}
            <div className="px-4 py-4 border-b border-gray-100 dark:border-white/[0.04]">
                <h2 className="text-[13px] font-semibold text-gray-900 dark:text-main">
                    {lang === 'ar' ? 'هيكل المنيو' : 'Menu Structure'}
                </h2>
            </div>

            {/* Section Navigation */}
            <div className="px-3 pt-3 space-y-0.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-1 lg:gap-0">
                {sections.map(s => (
                    <button
                        key={s.id}
                        onClick={() => onChangeSection(s.id)}
                        className={`w-full text-left px-3 py-2 rounded-md text-[12px] font-medium transition-colors flex items-center gap-2.5 ${section === s.id
                            ? 'bg-blue-50 text-blue-700 dark:bg-indigo-500/10 dark:text-indigo-400'
                            : 'text-gray-500 dark:text-muted/70 hover:bg-gray-50 dark:hover:bg-white/[0.03] hover:text-gray-700 dark:hover:text-main'
                            }`}
                    >
                        <s.icon size={14} />
                        {lang === 'ar' ? s.labelAr : s.labelEn}
                    </button>
                ))}
            </div>

            <div className="border-t border-gray-100 dark:border-white/[0.04] mt-3" />

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-3 py-3 no-scrollbar">
                {section === 'menus' && (
                    <>
                        {/* Menu List */}
                        <p className="text-[10px] font-semibold text-gray-400 dark:text-muted/50 uppercase tracking-wider mb-2 px-2">
                            {lang === 'ar' ? 'القوائم' : 'Menus'}
                        </p>
                        <div className="space-y-0.5 mb-4">
                            {menus.map(menu => {
                                const menuCats = categories.filter(c => c.menuIds.includes(menu.id));
                                const itemCount = menuCats.reduce((s, c) => s + c.items.filter(i => !i.archivedAt).length, 0);
                                const activeCount = menuCats.reduce((s, c) => s + c.items.filter(i => i.isAvailable && !i.archivedAt).length, 0);
                                return (
                                    <button
                                        key={menu.id}
                                        onClick={() => onSelectMenu(menu.id)}
                                        className={`w-full text-left px-3 py-2 rounded-md text-[12px] font-medium transition-colors flex items-center justify-between ${selectedMenuId === menu.id
                                            ? 'bg-blue-50 text-blue-700 dark:bg-indigo-500/10 dark:text-indigo-400'
                                            : 'text-gray-600 dark:text-muted/80 hover:bg-gray-50 dark:hover:bg-white/[0.03]'
                                            }`}
                                    >
                                        <span className="truncate">{menu.name}</span>
                                        <span className="text-[10px] text-gray-400 dark:text-muted/50 shrink-0 ml-2">
                                            {activeCount}/{itemCount}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Categories */}
                        <div className="flex items-center justify-between mt-4 mb-2 px-2">
                            <p className="text-[10px] font-semibold text-gray-400 dark:text-muted/50 uppercase tracking-wider">
                                {lang === 'ar' ? 'الأقسام' : 'Categories'}
                            </p>
                            <button
                                onClick={onAddCategory}
                                className="text-gray-400 hover:text-blue-600 dark:hover:text-indigo-400 transition-colors p-0.5 rounded"
                                aria-label={lang === 'ar' ? 'إضافة قسم' : 'Add category'}
                                title={lang === 'ar' ? 'إضافة قسم' : 'Add category'}
                            >
                                <Plus size={14} />
                            </button>
                        </div>
                        <div className="space-y-0.5">
                            <div
                                onClick={() => onSelectCategory?.('all')}
                                className={`px-3 py-2 rounded-md transition-colors cursor-pointer group flex items-center justify-between ${selectedCategoryId === 'all' || !selectedCategoryId
                                    ? 'bg-blue-50 dark:bg-indigo-500/10'
                                    : 'hover:bg-gray-50 dark:hover:bg-white/[0.03]'
                                    }`}
                            >
                                <p className={`text-[12px] font-medium pl-6 ${selectedCategoryId === 'all' || !selectedCategoryId ? 'text-blue-700 dark:text-indigo-400' : 'text-gray-700 dark:text-main'}`}>
                                    {lang === 'ar' ? 'كل الأقسام' : 'All Categories'}
                                </p>
                                <span className="text-[10px] text-gray-400 dark:text-muted/50 shrink-0 tabular-nums">
                                    {allItems.filter(i => !i.archivedAt).length}
                                </span>
                            </div>

                            <DragDropContext onDragEnd={onDragEnd}>
                                <Droppable droppableId="categoriesList">
                                    {(provided) => (
                                        <div {...provided.droppableProps} ref={provided.innerRef}>
                                            {currentMenuCategories.map((cat, index) => {
                                                const activeItems = cat.items.filter(i => !i.archivedAt);
                                                const isSelected = selectedCategoryId === cat.id;

                                                return (
                                                    <Draggable key={cat.id} draggableId={cat.id} index={index}>
                                                        {(provided, snapshot) => (
                                                            <div
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                                onClick={() => onSelectCategory?.(cat.id)}
                                                                className={`px-3 py-2 rounded-md transition-colors cursor-pointer group ${isSelected
                                                                    ? 'bg-blue-50 dark:bg-indigo-500/10'
                                                                    : 'hover:bg-gray-50 dark:hover:bg-white/[0.03]'
                                                                    } ${snapshot.isDragging ? 'shadow-lg bg-white dark:bg-elevated ring-1 ring-blue-500/50' : ''}`}
                                                                style={provided.draggableProps.style}
                                                            >
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                        <div
                                                                            {...provided.dragHandleProps}
                                                                            className="text-gray-300 hover:text-gray-500 dark:text-white/10 dark:hover:text-white/30 cursor-grab active:cursor-grabbing p-1 -ml-1"
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        >
                                                                            <GripVertical size={14} />
                                                                        </div>
                                                                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getHealthDot(cat)}`} />
                                                                        <p className={`text-[12px] font-medium truncate ${isSelected ? 'text-blue-700 dark:text-indigo-400' : 'text-gray-700 dark:text-main'}`}>
                                                                            {lang === 'ar' ? (cat.nameAr || cat.name) : cat.name}
                                                                        </p>
                                                                    </div>
                                                                    <span className="text-[10px] text-gray-400 dark:text-muted/50 shrink-0 tabular-nums">
                                                                        {activeItems.length}
                                                                    </span>
                                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); onEditCategory(cat); }}
                                                                            className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-elevated/60"
                                                                            aria-label={lang === 'ar' ? `تعديل قسم ${cat.nameAr || cat.name}` : `Edit category ${cat.name}`}
                                                                            title={lang === 'ar' ? 'تعديل القسم' : 'Edit category'}
                                                                        >
                                                                            <Edit3 size={12} />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </Draggable>
                                                );
                                            })}
                                            {provided.placeholder}
                                        </div>
                                    )}
                                </Droppable>
                            </DragDropContext>
                        </div>
                    </>
                )}

                {section === 'offers' && (
                    <div className="text-center py-12 px-4">
                        <Gift size={28} className="mx-auto text-gray-300 dark:text-muted/20 mb-3" />
                        <p className="text-[12px] font-medium text-gray-600 dark:text-main">{lang === 'ar' ? 'لا توجد عروض نشطة' : 'No Active Offers'}</p>
                        <p className="text-[11px] text-gray-400 dark:text-muted/60 mt-1">{lang === 'ar' ? 'أضف أو فعّل العروض من إدارة الأسعار لتظهر هنا.' : 'Create or activate offers from pricing management to show them here.'}</p>
                    </div>
                )}

                {section === 'scheduled' && (
                    <div className="text-center py-12 px-4">
                        <Clock size={28} className="mx-auto text-gray-300 dark:text-muted/20 mb-3" />
                        <p className="text-[12px] font-medium text-gray-600 dark:text-main">{lang === 'ar' ? 'لا توجد عروض مجدولة' : 'No Scheduled Promotions'}</p>
                        <p className="text-[11px] text-gray-400 dark:text-muted/60 mt-1">{lang === 'ar' ? 'لم تتم جدولة أي عرض حتى الآن.' : 'Nothing scheduled yet.'}</p>
                    </div>
                )}

                {section === 'archived' && (
                    <div className="text-center py-12 px-4">
                        <Archive size={28} className="mx-auto text-gray-300 dark:text-muted/20 mb-3" />
                        <p className="text-[12px] font-medium text-gray-600 dark:text-main">{lang === 'ar' ? 'لا توجد عناصر مؤرشفة' : 'No Archived Items'}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MenuSidebar;
