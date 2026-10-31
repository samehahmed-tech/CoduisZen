import React from 'react';
import { Edit3, GripVertical, Layers3, Plus } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { RestaurantMenu, MenuCategory, MenuItem } from '../../types';

interface Props {
    menus: RestaurantMenu[]; categories: MenuCategory[]; selectedMenuId: string;
    onSelectMenu: (id: string) => void; selectedCategoryId?: string | 'all';
    onSelectCategory?: (id: string | 'all') => void;
    section: 'menus' | 'offers' | 'scheduled' | 'archived' | 'pricing';
    onAddCategory: () => void; onEditCategory: (cat: MenuCategory) => void;
    onReorderCategories?: (reorderedCategories: MenuCategory[]) => void;
    allItems: (MenuItem & { _categoryName: string })[];
    totalRevenue: number; avgMargin: number; lang: string; currency: string;
}

const padCount = (count: number) => String(count).padStart(2, '0');

const MenuSidebar: React.FC<Props> = ({
    menus, categories, selectedMenuId, onSelectMenu, selectedCategoryId, onSelectCategory,
    section, onAddCategory, onEditCategory, onReorderCategories, allItems, lang,
}) => {
    const currentMenuCategories = categories
        .filter((category) => category.menuIds.includes(selectedMenuId))
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const archived = section === 'archived';

    const onDragEnd = (result: DropResult) => {
        if (!result.destination || !onReorderCategories) return;
        const reordered = [...currentMenuCategories];
        const [moved] = reordered.splice(result.source.index, 1);
        reordered.splice(result.destination.index, 0, moved);
        onReorderCategories(reordered.map((category, index) => ({ ...category, sortOrder: index })));
    };

    const totalVisible = allItems.filter((item) => archived ? item.archivedAt : !item.archivedAt).length;
    const totalAvailable = allItems.filter((item) => !item.archivedAt && item.isAvailable).length;
    const totalUnavailable = allItems.filter((item) => !item.archivedAt && !item.isAvailable).length;

    const statusLine = (items: MenuItem[]) => {
        if (archived) return lang === 'ar' ? 'سجل مؤرشف' : 'Archived';
        const off = items.filter((item) => !item.isAvailable).length;
        if (!off) return lang === 'ar' ? 'كلها متاحة' : 'All available';
        return lang === 'ar' ? `${items.length - off} متاح · ${off} متوقف` : `${items.length - off} live · ${off} off`;
    };

    return (
        <section className="atelier-ribbon" aria-label={lang === 'ar' ? 'تنظيم المنيو' : 'Menu structure'}>
            <div className="atelier-ribbon-menu">
                <span><Layers3 size={15} />{lang === 'ar' ? 'القائمة' : 'Menu'}</span>
                <select value={selectedMenuId} onChange={(event) => onSelectMenu(event.target.value)} aria-label={lang === 'ar' ? 'اختيار القائمة' : 'Select menu'}>
                    {menus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name}</option>)}
                </select>
            </div>
            <div className="atelier-ribbon-scroll no-scrollbar">
                <button
                    type="button"
                    className={`atelier-cat-card atelier-cat-all ${selectedCategoryId === 'all' || !selectedCategoryId ? 'is-active' : ''}`}
                    onClick={() => onSelectCategory?.('all')}
                >
                    <span className="atelier-cat-copy">
                        <b>{lang === 'ar' ? (archived ? 'كل المؤرشف' : 'كل الأصناف') : (archived ? 'All archived' : 'All items')}</b>
                        <small>{archived ? (lang === 'ar' ? `${totalVisible} سجل` : `${totalVisible} records`) : (lang === 'ar' ? `${totalAvailable} متاح · ${totalUnavailable} متوقف` : `${totalAvailable} live · ${totalUnavailable} off`)}</small>
                    </span>
                    <strong className="atelier-cat-count">{padCount(totalVisible)}</strong>
                </button>
                <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable droppableId="categoriesRibbon" direction="horizontal">
                        {(provided) => (
                            <div ref={provided.innerRef} {...provided.droppableProps} className="atelier-cat-list">
                                {currentMenuCategories.map((category, index) => {
                                    const visibleItems = category.items.filter((item) => archived ? item.archivedAt : !item.archivedAt);
                                    return (
                                        <Draggable key={category.id} draggableId={category.id} index={index}>
                                            {(dragProvided, snapshot) => (
                                                <div
                                                    ref={dragProvided.innerRef}
                                                    {...dragProvided.draggableProps}
                                                    className={`atelier-cat-card ${selectedCategoryId === category.id ? 'is-active' : ''} ${snapshot.isDragging ? 'is-dragging' : ''}`}
                                                >
                                                    <button type="button" className="atelier-cat-main" onClick={() => onSelectCategory?.(category.id)}>
                                                        <span className="atelier-cat-copy">
                                                            <b>{lang === 'ar' ? (category.nameAr || category.name) : category.name}</b>
                                                            <small>{statusLine(visibleItems)}</small>
                                                        </span>
                                                        <strong className="atelier-cat-count">{padCount(visibleItems.length)}</strong>
                                                    </button>
                                                    {!archived && <button type="button" className="atelier-cat-edit" onClick={() => onEditCategory(category)} aria-label={lang === 'ar' ? 'تعديل القسم' : 'Edit category'}><Edit3 size={12} /></button>}
                                                    <span className="atelier-cat-grip" {...dragProvided.dragHandleProps} aria-hidden="true"><GripVertical size={13} /></span>
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
                {!archived && <button type="button" className="atelier-cat-add" onClick={onAddCategory}><Plus size={16} /><span>{lang === 'ar' ? 'قسم جديد' : 'New section'}</span></button>}
            </div>
        </section>
    );
};

export default MenuSidebar;
