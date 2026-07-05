import React, { useMemo } from 'react';
import { Ban } from 'lucide-react';
import { MenuItem } from '@/types';
import MenuItemCard from './MenuItemCard';

interface ItemGridProps {
    items: MenuItem[];
    onAddItem: (item: MenuItem) => void;
    onRemoveItem?: (itemId: string) => void;
    cartItems?: any[];
    currencySymbol: string;
    isTouchMode: boolean;
    density?: 'comfortable' | 'compact' | 'ultra' | 'buttons';
    lang?: 'en' | 'ar';
    highlightedItemId?: string | null;
}

const ItemGrid: React.FC<ItemGridProps> = React.memo(({
    items, onAddItem, onRemoveItem, cartItems = [],
    currencySymbol, isTouchMode,
    density = 'comfortable', lang = 'en', highlightedItemId = null,
}) => {
    const quantityByItemId = useMemo(() => {
        const map: Record<string, number> = {};
        for (const ci of cartItems) {
            map[ci.id] = (map[ci.id] || 0) + (ci.quantity || 0);
        }
        return map;
    }, [cartItems]);

    if (items.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-muted/30 flex-col gap-3">
                <Ban size={32} strokeWidth={1.5} />
                <p className="text-xs font-medium">
                    {lang === 'ar' ? 'لا يوجد أصناف' : 'No items found'}
                </p>
            </div>
        );
    }

    const gridClass = (() => {
        switch (density) {
            case 'ultra':
                return 'grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2 p-2.5';
            case 'buttons':
                return 'grid-cols-[repeat(auto-fill,minmax(122px,1fr))] gap-2 p-2.5';
            case 'compact':
                return 'grid-cols-[repeat(auto-fill,minmax(158px,1fr))] gap-2.5 p-3';
            default:
                return 'grid-cols-[repeat(auto-fill,minmax(184px,1fr))] gap-3 p-3.5';
        }
    })();

    return (
        <div className="h-full min-h-0 overflow-y-auto pos-scroll overscroll-contain">
            <div className={`grid auto-rows-fr content-start ${lang === 'ar' ? 'justify-items-stretch' : ''} ${gridClass}`}>
                {items.map((item) => (
                    <MenuItemCard
                        key={item.id}
                        item={item}
                        onAddItem={onAddItem}
                        onRemoveItem={onRemoveItem}
                        quantity={quantityByItemId[item.id] || 0}
                        currencySymbol={currencySymbol}
                        isTouchMode={isTouchMode}
                        density={density}
                        lang={lang}
                        highlighted={highlightedItemId === item.id}
                    />
                ))}
            </div>
        </div>
    );
});

export default ItemGrid;
