import React, { useCallback, useRef } from 'react';
import { Minus, Plus, Utensils } from 'lucide-react';
import { MenuItem } from '@/types';

interface MenuItemCardProps {
    item: MenuItem;
    onAddItem: (item: MenuItem) => void;
    onRemoveItem?: (itemId: string) => void;
    quantity?: number;
    currencySymbol: string;
    isTouchMode: boolean;
    density?: 'comfortable' | 'compact' | 'ultra' | 'buttons';
    lang: 'en' | 'ar';
    highlighted?: boolean;
}

type SharedCardProps = {
    item: MenuItem;
    displayName: string;
    isAvailable: boolean;
    quantity: number;
    currencySymbol: string;
    lang: string;
    highlighted: boolean;
    onAdd: () => void;
    onRemove: () => void;
    onCardClick: () => void;
};

/* ── Helpers ── */

const stateAttrs = (quantity: number, highlighted: boolean, isAvailable: boolean) => ({
    'data-selected': quantity > 0 ? 'true' : 'false',
    'data-highlighted': highlighted ? 'true' : 'false',
    'data-available': isAvailable ? 'true' : 'false',
});

const EmptyMedia = ({ compact = false }: { compact?: boolean }) => (
    <div className="pos-menu-item-empty-media flex h-full w-full items-center justify-center">
        <Utensils size={compact ? 17 : 24} strokeWidth={1.5} className="opacity-40" />
    </div>
);

const ItemArtwork = ({ item, compact = false }: { item: MenuItem; compact?: boolean }) => (
    <div className="pos-tilt-media">
        {item.image ? (
            <img
                src={item.image}
                alt=""
                className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                loading="lazy"
            />
        ) : (
            <EmptyMedia compact={compact} />
        )}
    </div>
);

/* ── 3D Tilt Hook ── */

const use3DTilt = (enabled: boolean) => {
    const ref = useRef<HTMLDivElement>(null);

    const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!enabled || e.pointerType === 'touch') return;
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width;   // 0‥1
        const ny = (e.clientY - r.top) / r.height;
        
        // Increase rotation limits for more pronounced 3D effect (e.g. 22 deg)
        el.style.setProperty('--rx', `${((0.5 - ny) * 22).toFixed(2)}deg`);
        el.style.setProperty('--ry', `${((nx - 0.5) * 22).toFixed(2)}deg`);
        el.style.setProperty('--gx', `${(nx * 100).toFixed(0)}%`);
        el.style.setProperty('--gy', `${(ny * 100).toFixed(0)}%`);
    }, [enabled]);

    const reset = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
        el.style.setProperty('--gx', '50%');
        el.style.setProperty('--gy', '50%');
    }, []);

    return { ref, onPointerMove, onPointerLeave: reset, onPointerCancel: reset };
};

/* ═══════════════════════════════════════════
   ImageCard  (comfortable / compact density)
   ═══════════════════════════════════════════ */

const ImageCard: React.FC<SharedCardProps & { compact: boolean }> = ({
    item, displayName, isAvailable, compact, quantity, currencySymbol, lang,
    highlighted, onAdd, onRemove, onCardClick
}) => {
    const isAr = lang === 'ar';
    const addLabel = isAr ? 'أضف' : 'Add';
    const soldOutLabel = isAr ? 'نفد' : 'Sold out';
    const itemDescription = String(isAr ? ((item as any).descriptionAr || (item as any).description || '') : ((item as any).description || '')).trim();
    const quickInfo = itemDescription || (isAr ? 'إضافة سريعة للطلب مع تحكم مباشر في الكمية.' : 'Quick add with direct quantity control.');
    const tilt = use3DTilt(isAvailable);

    const hasImage = !!item.image;

    return (
        <div
            ref={tilt.ref}
            onPointerMove={tilt.onPointerMove}
            onPointerLeave={tilt.onPointerLeave}
            onPointerCancel={tilt.onPointerCancel}
            {...stateAttrs(quantity, highlighted, isAvailable)}
            onClick={(e) => {
                if (!isAvailable) return;
                if (!(e.target as HTMLElement).closest('button')) onCardClick();
            }}
            className={`pos-tilt-card group ${hasImage ? 'pos-tilt-card--image' : ''} ${compact ? 'pos-tilt-card--compact min-h-[138px]' : 'min-h-[174px]'} ${isAvailable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60 grayscale'}`}
        >
            {/* Glare layer */}
            <div className="pos-tilt-glare" aria-hidden="true" />

            {/* Background image */}
            {hasImage && (
                <div className="pos-tilt-bg" aria-hidden="true">
                    <img src={item.image} alt="" loading="lazy" />
                </div>
            )}



            {/* Content */}
            <div className={`pos-tilt-content flex flex-col h-full justify-between ${compact ? 'p-3 pt-10' : 'p-4 pt-12'}`}>
                <div className="flex flex-col flex-1 items-center justify-start w-full">
                    {!isAvailable && (
                        <div className="mb-2 inline-flex self-center rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[10px] font-black text-rose-500 backdrop-blur-md">
                            {soldOutLabel}
                        </div>
                    )}
                    {item.isPopular && isAvailable && (
                        <div className="pos-tilt-popular mb-2">
                            {isAr ? 'مميز' : 'Popular'}
                        </div>
                    )}
                    <h3 className="pos-tilt-title w-full text-center px-4 leading-[1.2]" style={{ wordBreak: 'break-word' }} title={displayName}>
                        {displayName}
                    </h3>
                </div>
                
                <div className="flex flex-col items-center mt-auto w-full shrink-0">
                    <div className="pos-tilt-price">
                        {item.price.toFixed(0)}
                        <span>{currencySymbol}</span>
                    </div>

                    {quantity > 0 ? (
                        <div className="pos-tilt-stepper w-full max-w-[140px] mt-3">
                            <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="pos-tilt-qty-btn">
                                <Minus size={14} strokeWidth={2.5} />
                            </button>
                            <span className="pos-tilt-qty-val w-8">{quantity}</span>
                            <button onClick={(e) => { e.stopPropagation(); onAdd(); }} className="pos-tilt-qty-btn pos-tilt-qty-btn--add">
                                <Plus size={14} strokeWidth={2.5} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={(e) => { e.stopPropagation(); onAdd(); }}
                            disabled={!isAvailable}
                            className="pos-tilt-add-btn w-full max-w-[140px] mt-3"
                        >
                            {addLabel}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

/* ═══════════════════════════════════════════
   ListCard  (ultra density)
   ═══════════════════════════════════════════ */

const ListCard: React.FC<SharedCardProps> = ({
    item, displayName, isAvailable, quantity, currencySymbol, highlighted, onAdd, onRemove, onCardClick
}) => {
    const tilt = use3DTilt(isAvailable);
    return (
        <div
            ref={tilt.ref}
            onPointerMove={tilt.onPointerMove}
            onPointerLeave={tilt.onPointerLeave}
            onPointerCancel={tilt.onPointerCancel}
            {...stateAttrs(quantity, highlighted, isAvailable)}
            onClick={(e) => {
                if (!isAvailable) return;
                if (!(e.target as HTMLElement).closest('button')) onCardClick();
            }}
            className={`pos-tilt-card pos-tilt-card--list group ${isAvailable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
        >
            <div className="pos-tilt-glare" aria-hidden="true" />
            <ItemArtwork item={item} compact />
            
            <div className="pos-tilt-content">
                <div className="flex-1 flex flex-col min-w-0">
                    <h3 className="pos-tilt-title truncate" title={displayName}>{displayName}</h3>
                    <div className="pos-tilt-price !text-[16px]">
                        {item.price.toFixed(2)}
                        <span>{currencySymbol}</span>
                        {quantity > 0 && <span className="ms-2 !text-primary !text-[12px]">({quantity}x)</span>}
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-1 ms-4">
                    {quantity > 0 ? (
                        <div className="pos-tilt-stepper !mt-0 !p-1">
                            <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="pos-tilt-qty-btn !w-7 !h-7">
                                <Minus size={13} strokeWidth={2.5} />
                            </button>
                            <span className="pos-tilt-qty-val w-5 !text-xs">{quantity}</span>
                            <button onClick={(e) => { e.stopPropagation(); onAdd(); }} className="pos-tilt-qty-btn pos-tilt-qty-btn--add !w-7 !h-7">
                                <Plus size={13} strokeWidth={2.5} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={(e) => { e.stopPropagation(); onAdd(); }}
                            disabled={!isAvailable}
                            className="pos-tilt-qty-btn pos-tilt-qty-btn--add !w-8 !h-8"
                        >
                            <Plus size={15} strokeWidth={2.5} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

/* ═══════════════════════════════════════════
   ButtonCard  (buttons density)
   ═══════════════════════════════════════════ */

const ButtonCard: React.FC<{
    item: MenuItem; displayName: string; isAvailable: boolean; currencySymbol: string;
    quantity: number; highlighted: boolean; onAdd: () => void; onRemove: () => void;
}> = ({ item, displayName, isAvailable, currencySymbol, quantity, highlighted, onAdd, onRemove }) => {
    const tilt = use3DTilt(isAvailable);
    return (
        <div
            ref={tilt.ref}
            onPointerMove={tilt.onPointerMove}
            onPointerLeave={tilt.onPointerLeave}
            onPointerCancel={tilt.onPointerCancel}
            {...stateAttrs(quantity, highlighted, isAvailable)}
            onClick={() => { if (isAvailable) onAdd(); }}
            aria-disabled={!isAvailable}
            className={`pos-tilt-card pos-tilt-card--button group ${isAvailable ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}
        >
            <div className="pos-tilt-glare" aria-hidden="true" />
            
            <div className="flex justify-between items-start w-full relative z-10">
                <h3 className="pos-tilt-title !text-[14px] !mb-0 !text-start flex-1" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'normal', lineHeight: 1.2 }} title={displayName}>{displayName}</h3>
                {quantity > 0 && (
                    <span className="pos-tilt-badge !static !min-w-[20px] !h-[20px] !text-[10px] !rounded-md !p-0 !ms-2 !shadow-none !border-none">
                        {quantity}
                    </span>
                )}
            </div>

            <div className="flex items-end justify-between w-full relative z-10 mt-3">
                <div className="pos-tilt-price !text-[16px] !text-start">
                    {item.price.toFixed(0)}
                    <span className="!text-[10px]">{currencySymbol}</span>
                </div>
                
                {quantity > 0 && (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onRemove(); }}
                        className="pos-tilt-qty-btn !w-7 !h-7 !bg-rose-500/10 !text-rose-500 hover:!bg-rose-500/20 border-rose-500/20"
                    >
                        <Minus size={14} strokeWidth={2.5} />
                    </button>
                )}
            </div>
        </div>
    );
};

/* ═══════════════════════════════════════════
   Main export
   ═══════════════════════════════════════════ */

const MenuItemCard: React.FC<MenuItemCardProps> = React.memo(({
    item, onAddItem, onRemoveItem, quantity = 0,
    currencySymbol, density = 'comfortable', lang, highlighted = false,
}) => {
    const displayName = (item as any).displayName || item.name;
    const isAvailable = (item as any).isActuallyAvailable !== false && item.isAvailable !== false;

    const handleAdd = useCallback(() => { if (isAvailable) onAddItem(item); }, [isAvailable, onAddItem, item]);
    const handleRemove = useCallback(() => { if (onRemoveItem) onRemoveItem(item.id); }, [onRemoveItem, item.id]);

    const shared = {
        item, displayName, isAvailable, quantity, currencySymbol, lang, highlighted,
        onAdd: handleAdd, onRemove: handleRemove, onCardClick: handleAdd
    };

    switch (density) {
        case 'buttons':
            return <ButtonCard item={item} displayName={displayName} isAvailable={isAvailable} currencySymbol={currencySymbol} quantity={quantity} highlighted={highlighted} onAdd={handleAdd} onRemove={handleRemove} />;
        case 'ultra':
            return <ListCard {...shared} />;
        case 'compact':
            return <ImageCard {...shared} compact />;
        default:
            return <ImageCard {...shared} compact={false} />;
    }
});

export default MenuItemCard;
