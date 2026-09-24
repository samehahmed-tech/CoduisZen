import React, { useMemo } from 'react';
import { Ban } from 'lucide-react';
import { MenuItem } from '@/types';
import MenuItemCard, { resolveCardDesign, type CardDensity, type CardSize } from './MenuItemCard';

interface ItemGridProps {
    items: MenuItem[];
    onAddItem: (item: MenuItem) => void;
    onRemoveItem?: (itemId: string) => void;
    cartItems?: any[];
    currencySymbol: string;
    isTouchMode: boolean;
    density?: CardDensity;
    /** Card footprint: small / medium / large. */
    cardSize?: CardSize;
    lang?: 'en' | 'ar';
    highlightedItemId?: string | null;
}

const ItemGrid: React.FC<ItemGridProps> = React.memo(({
    items, onAddItem, onRemoveItem, cartItems = [],
    currencySymbol, isTouchMode,
    density = 'sahara', cardSize = 'medium', lang = 'en', highlightedItemId = null,
}) => {
    const design = resolveCardDesign(density);

    const quantityByItemId = useMemo(() => {
        const map: Record<string, number> = {};
        for (const ci of cartItems) {
            map[ci.id] = (map[ci.id] || 0) + (ci.quantity || 0);
        }
        return map;
    }, [cartItems]);

    // Ticket grouping: consecutive category sections with
    // sticky headers, preserving catalog order. Falls back to one group.
    const ticketGroups = useMemo(() => {
        if (design !== 'ticket') return null;
        const groups: { key: string; label: string; items: MenuItem[] }[] = [];
        const fallback = lang === 'ar' ? 'أصناف' : 'Items';
        for (const item of items) {
            const raw = lang === 'ar'
                ? ((item as any).categoryAr || (item as any).category || (item as any).categoryName || '')
                : ((item as any).category || (item as any).categoryAr || (item as any).categoryName || '');
            const label = String(raw || '').trim() || fallback;
            const last = groups[groups.length - 1];
            if (last && last.label === label) last.items.push(item);
            else groups.push({ key: `${label}__${groups.length}`, label, items: [item] });
        }
        return groups;
    }, [design, items, lang]);

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

    /* NOTE: every grid class below must stay a full literal string —
       Tailwind JIT only generates classes it can read statically.
       Never interpolate minmax() floors (that silently drops the rule
       and the grid collapses to the base column count). */
    const GRID_CLASSES: Record<string, Record<CardSize, string>> = {
        // Ticket rows: always full-width single column.
        ticket: {
            small: 'grid-cols-1 gap-1.5 p-2 sm:p-2.5',
            medium: 'grid-cols-1 gap-1.5 p-2.5 sm:p-3',
            large: 'grid-cols-1 gap-2 p-2.5 sm:p-3',
        },
        // Kiosk minis: maximum density.
        kiosk: {
            small: 'grid-cols-4 gap-1.5 p-2 sm:grid-cols-[repeat(auto-fill,minmax(96px,1fr))] sm:gap-2 sm:p-2',
            medium: 'grid-cols-3 gap-2 p-2 sm:grid-cols-[repeat(auto-fill,minmax(140px,1fr))] sm:gap-2.5 sm:p-3',
            large: 'grid-cols-2 gap-2 p-2.5 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] sm:gap-3 sm:p-3',
        },
        // Typo reads best slightly wider.
        typo: {
            small: 'grid-cols-2 gap-1.5 p-2 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-2 sm:p-2',
            medium: 'grid-cols-1 gap-2.5 p-2.5 min-[480px]:grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(215px,1fr))] sm:gap-3 sm:p-3',
            large: 'grid-cols-1 gap-2.5 p-2.5 min-[480px]:grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(285px,1fr))] sm:gap-3 sm:p-3',
        },
        // Gold wants presence: wider floor.
        gold: {
            small: 'grid-cols-2 gap-1.5 p-2 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] sm:gap-2 sm:p-2',
            medium: 'grid-cols-1 gap-2.5 p-2.5 min-[480px]:grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(225px,1fr))] sm:gap-3 sm:p-3',
            large: 'grid-cols-1 gap-2.5 p-2.5 min-[480px]:grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] sm:gap-3 sm:p-3',
        },
        // Circle: round cards pack tighter.
        circle: {
            small: 'grid-cols-3 gap-1.5 p-2 sm:grid-cols-[repeat(auto-fill,minmax(118px,1fr))] sm:gap-2 sm:p-2',
            medium: 'grid-cols-2 gap-2 p-2.5 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] sm:gap-3 sm:p-3',
            large: 'grid-cols-1 gap-2.5 p-2.5 min-[480px]:grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(250px,1fr))] sm:gap-3 sm:p-3',
        },
        // Noir: photo-bleed cards.
        noir: {
            small: 'grid-cols-3 gap-1.5 p-2 sm:grid-cols-[repeat(auto-fill,minmax(132px,1fr))] sm:gap-2 sm:p-2',
            medium: 'grid-cols-2 gap-2 p-2.5 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] sm:gap-3 sm:p-3',
            large: 'grid-cols-1 gap-2.5 p-2.5 min-[480px]:grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(250px,1fr))] sm:gap-3 sm:p-3',
        },
        // Pop: playful pills need a bit of room.
        pop: {
            small: 'grid-cols-2 gap-1.5 p-2 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:gap-2 sm:p-2',
            medium: 'grid-cols-2 gap-2 p-2.5 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] sm:gap-3 sm:p-3',
            large: 'grid-cols-1 gap-2.5 p-2.5 min-[480px]:grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(250px,1fr))] sm:gap-3 sm:p-3',
        },
        // Sahara + fallback: balanced photo cards.
        sahara: {
            small: 'grid-cols-3 gap-1.5 p-2 sm:grid-cols-[repeat(auto-fill,minmax(118px,1fr))] sm:gap-2 sm:p-2',
            medium: 'grid-cols-2 gap-2 p-2.5 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] sm:gap-3 sm:p-3 lg:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]',
            large: 'grid-cols-1 gap-2.5 p-2.5 min-[480px]:grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(250px,1fr))] sm:gap-3 sm:p-3',
        },
    };

    const gridClass = (GRID_CLASSES[design] ?? GRID_CLASSES.sahara)[cardSize] ?? GRID_CLASSES.sahara.medium;

    const intrinsicSize = (() => {
        if (design === 'ticket') return cardSize === 'small' ? 'auto 60px' : cardSize === 'large' ? 'auto 92px' : 'auto 78px';
        if (design === 'kiosk') return cardSize === 'small' ? 'auto 160px' : cardSize === 'large' ? 'auto 300px' : 'auto 240px';
        return cardSize === 'small' ? 'auto 220px' : cardSize === 'large' ? 'auto 460px' : 'auto 340px';
    })();

    let staggerIndex = 0;
    const renderCard = (item: MenuItem) => {
        const i = staggerIndex++;
        return (
            <div key={`${item.id}__${i}`} className="min-w-0" style={{ '--zen-i': i % 12, contentVisibility: 'auto', containIntrinsicSize: intrinsicSize } as React.CSSProperties}>
                <MenuItemCard
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
            </div>
        );
    };

    return (
        <div className="h-full min-h-0 overflow-y-auto pos-scroll overscroll-contain">
            <div data-card-size={cardSize} className={`grid content-start fluid-stagger ${lang === 'ar' ? 'justify-items-stretch' : ''} ${gridClass}`}>
                {/* content-visibility skips off-screen cards; the intrinsic-size
                    estimate keeps the scrollbar stable while scrolling. */}
                {ticketGroups
                    ? ticketGroups.map((group) => (
                        <React.Fragment key={group.key}>
                            <div className="zen-ledger-group">
                                <span>{group.label}</span>
                                <span className="tabular-nums">{group.items.length}</span>
                            </div>
                            {group.items.map((item) => renderCard(item))}
                        </React.Fragment>
                    ))
                    : items.map((item) => renderCard(item))}
            </div>
        </div>
    );
});

export default ItemGrid;
