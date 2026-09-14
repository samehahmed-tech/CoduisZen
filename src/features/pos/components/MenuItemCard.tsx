import React, { useCallback } from 'react';
import { Minus, Plus } from 'lucide-react';
import { ItemImage } from './ItemImage';
import { useZenTilt } from './useZenTilt';
import { playPosClick } from './posClickSound';
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
    /** True on touch terminals: tilt/parallax stay off, tap still adds. */
    touch: boolean;
    onAdd: () => void;
    onRemove: () => void;
    onCardClick: () => void;
};

/* ── Helpers ── */

const stateAttrs = (quantity: number, highlighted: boolean, isAvailable: boolean, hasImage: boolean) => ({
    'data-selected': quantity > 0 ? 'true' : 'false',
    'data-highlighted': highlighted ? 'true' : 'false',
    'data-available': isAvailable ? 'true' : 'false',
    'data-has-image': hasImage ? 'true' : 'false',
});

/** Real photo? Empty/missing images collapse the media zone so data breathes. */
const hasItemImage = (item: MenuItem) => {
    const src = (item as any).image;
    return typeof src === 'string' ? src.trim().length > 0 : !!src;
};

const getItemDescription = (item: MenuItem, lang: string) =>
    String(lang === 'ar' ? ((item as any).descriptionAr || (item as any).description || '') : ((item as any).description || '')).trim();

const getCategoryLabel = (item: MenuItem, lang: string) =>
    String(lang === 'ar' ? ((item as any).categoryAr || (item as any).category || '') : ((item as any).category || '')).trim();

/** Count of customization entry points (modifier groups + sizes). */
const getOptionsCount = (item: MenuItem) =>
    ((item as any).modifierGroups?.length || 0) + ((item as any).sizes?.length || 0);

/** Fixed price? Zero/variant items show "as selected" instead of a misleading 0. */
const hasFixedPrice = (item: MenuItem) => Number(item.price || 0) > 0;
const formatPrice = (item: MenuItem) => Number(item.price || 0).toFixed(0);
const priceText = (item: MenuItem, lang: string) =>
    hasFixedPrice(item) ? formatPrice(item) : (lang === 'ar' ? 'حسب الاختيار' : 'AS SELECTED');

/** Haptic + click sound on every tap (no-ops where unsupported/muted). */
const pressFeedback = () => {
    try { (navigator as any)?.vibrate?.(10); } catch { /* noop */ }
    playPosClick();
};

/** Shared keyboard activation: Enter / Space adds, like a tap. */
const cardKeyDown = (e: React.KeyboardEvent, isAvailable: boolean, onCardClick: () => void) => {
    if (!isAvailable) return;
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pressFeedback();
        onCardClick();
    }
};

const cardClick = (e: React.MouseEvent, isAvailable: boolean, onCardClick: () => void) => {
    if (!isAvailable) return;
    if (!(e.target as HTMLElement).closest('button')) {
        pressFeedback();
        onCardClick();
    }
};

/* ═══════════════════════════════════════════
   01 · MENU POSTER  (comfortable density)
   Warm editorial card. Paper identity, serif title,
   photo hero, price + Add/stepper foot.
   ═══════════════════════════════════════════ */

const PosterCard: React.FC<SharedCardProps> = ({
    item, displayName, isAvailable, quantity, currencySymbol, lang,
    highlighted, touch, onAdd, onRemove, onCardClick,
}) => {
    const isAr = lang === 'ar';
    const addLabel = isAr ? 'أضف +' : 'ADD +';
    const unavailableLabel = isAr ? 'غير متاح' : 'SOLD OUT';
    const metaLine = getCategoryLabel(item, lang) || (isAr ? 'مميز · طازج' : 'PREMIUM · FRESH');
    const fixed = hasFixedPrice(item);
    const showImage = hasItemImage(item);
    const tilt = useZenTilt<HTMLDivElement>({ maxRX: 6, maxRY: 8 }, touch || !isAvailable);
    return (
        <div
            {...stateAttrs(quantity, highlighted, isAvailable, showImage)}
            role="button"
            tabIndex={isAvailable ? 0 : -1}
            aria-disabled={!isAvailable}
            aria-label={`${displayName}, ${priceText(item, lang)} ${currencySymbol}${quantity > 0 ? `, ${quantity}` : ''}`}
            onClick={(e) => cardClick(e, isAvailable, onCardClick)}
            onKeyDown={(e) => cardKeyDown(e, isAvailable, onCardClick)}
            className="zen-card zen-poster zen-tilt"
            ref={tilt.ref}
            onPointerMove={tilt.onPointerMove}
            onPointerLeave={tilt.onPointerLeave}
            onPointerCancel={tilt.onPointerCancel}
            onPointerDown={tilt.onPointerDown}
            onPointerUp={tilt.onPointerUp}
        >
            <span className="zen-glare" aria-hidden="true" />
            <div className="photo">
                {showImage ? <ItemImage src={item.image} name={displayName} className="zen-img" /> : null}
                {item.isPopular && isAvailable && (
                    <span className="stamp">★ {isAr ? 'الأكثر مبيعًا' : 'Best Seller'}</span>
                )}
                <span className="qty-dot" aria-hidden="true">{quantity}</span>
                {!isAvailable && <span className="zen-veil">{unavailableLabel}</span>}
            </div>
            <div className="pbody">
                <div className="pmeta">{metaLine}</div>
                <h3 title={displayName}>{displayName}</h3>
                <div className="pfoot">
                    {fixed ? (
                        <div className="price">{formatPrice(item)}<small>{currencySymbol}</small></div>
                    ) : (
                        <div className="price-note">{isAr ? 'حسب الاختيار' : 'As selected'}</div>
                    )}
                    {quantity > 0 ? (
                        <div className="step" role="group" aria-label={displayName}>
                            <button onClick={(e) => { e.stopPropagation(); pressFeedback(); onRemove(); }} aria-label={isAr ? 'إنقاص' : 'Decrease'}><Minus size={16} strokeWidth={3} /></button>
                            <b aria-live="polite">{quantity}</b>
                            <button onClick={(e) => { e.stopPropagation(); pressFeedback(); onAdd(); }} aria-label={isAr ? 'زيادة' : 'Increase'}><Plus size={16} strokeWidth={3} /></button>
                        </div>
                    ) : (
                        <button
                            className="add"
                            onClick={(e) => { e.stopPropagation(); pressFeedback(); onAdd(); }}
                            disabled={!isAvailable}
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
   02 · EDGE RAIL  (compact density)
   Dense horizontal operations row: thumb + status,
   name, price stub, + / stepper.
   ═══════════════════════════════════════════ */

const RailCard: React.FC<SharedCardProps> = ({
    item, displayName, isAvailable, quantity, currencySymbol, lang,
    highlighted, touch, onAdd, onRemove, onCardClick,
}) => {
    const isAr = lang === 'ar';
    const description = getItemDescription(item, lang);
    const prep = (item as any).preparationTime;
    const statusLine = isAvailable
        ? `● ${isAr ? 'متاح' : 'Available'}${prep ? ` · ${prep} ${isAr ? 'د' : 'MIN'}` : ''}`
        : `● ${isAr ? 'غير متاح' : 'Unavailable'}`;
    const fixed = hasFixedPrice(item);
    const showImage = hasItemImage(item);
    const tilt = useZenTilt<HTMLDivElement>({ maxRX: 3, maxRY: 4 }, touch || !isAvailable);
    return (
        <div
            {...stateAttrs(quantity, highlighted, isAvailable, showImage)}
            role="button"
            tabIndex={isAvailable ? 0 : -1}
            aria-disabled={!isAvailable}
            aria-label={`${displayName}, ${priceText(item, lang)} ${currencySymbol}${quantity > 0 ? `, ${quantity}` : ''}`}
            onClick={(e) => cardClick(e, isAvailable, onCardClick)}
            onKeyDown={(e) => cardKeyDown(e, isAvailable, onCardClick)}
            className="zen-card zen-rail zen-tilt"
            ref={tilt.ref}
            onPointerMove={tilt.onPointerMove}
            onPointerLeave={tilt.onPointerLeave}
            onPointerCancel={tilt.onPointerCancel}
            onPointerDown={tilt.onPointerDown}
            onPointerUp={tilt.onPointerUp}
        >
            <span className="zen-glare" aria-hidden="true" />
            <div className="rimg">
                {showImage ? <ItemImage src={item.image} name={displayName} className="zen-img" /> : null}
                <span className="rqty" aria-hidden="true">{quantity}</span>
                {!isAvailable && <span className="zen-veil">{isAr ? 'غير متاح' : 'OUT'}</span>}
            </div>
            <div className="rinfo">
                <div className="status">{statusLine}</div>
                <h3 title={displayName}>{displayName}</h3>
                <p className="sub">{description || (item.isPopular ? (isAr ? '★ صنف مميز' : '★ Popular pick') : (isAr ? 'إضافة سريعة بضغطة واحدة' : 'One-tap quick add'))}</p>
                <div className="rbottom">
                    {fixed ? (
                        <div className="rprice"><small>{isAr ? 'السعر' : 'PRICE'}</small>{formatPrice(item)} <span className="cur">{currencySymbol}</span></div>
                    ) : (
                        <div className="rprice-note">{isAr ? 'حسب الاختيار' : 'As selected'}</div>
                    )}
                    {quantity > 0 ? (
                        <div className="step" role="group" aria-label={displayName}>
                            <button onClick={(e) => { e.stopPropagation(); pressFeedback(); onRemove(); }} aria-label={isAr ? 'إنقاص' : 'Decrease'}><Minus size={15} strokeWidth={3} /></button>
                            <b aria-live="polite">{quantity}</b>
                            <button onClick={(e) => { e.stopPropagation(); pressFeedback(); onAdd(); }} aria-label={isAr ? 'زيادة' : 'Increase'}><Plus size={15} strokeWidth={3} /></button>
                        </div>
                    ) : (
                        <button
                            className="radd"
                            onClick={(e) => { e.stopPropagation(); pressFeedback(); onAdd(); }}
                            disabled={!isAvailable}
                            aria-label={`${isAr ? 'أضف' : 'Add'} ${displayName}`}
                        >
                            +
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

/* ═══════════════════════════════════════════
   03 · GLASS TILE  (ultra density)
   Translucent premium theme card: media, title +
   price, chips, full-width action.
   ═══════════════════════════════════════════ */

const GlassCard: React.FC<SharedCardProps> = ({
    item, displayName, isAvailable, quantity, currencySymbol, lang,
    highlighted, touch, onAdd, onRemove, onCardClick,
}) => {
    const isAr = lang === 'ar';
    const description = getItemDescription(item, lang);
    const optionsCount = getOptionsCount(item);
    const prep = (item as any).preparationTime;
    const fixed = hasFixedPrice(item);
    const unitSuffix = fixed ? `${formatPrice(item)} ${currencySymbol}` : (isAr ? 'حسب الاختيار' : 'As selected');
    const addLabel = `${isAr ? 'أضف للطلب' : 'ADD TO TICKET'} · ${unitSuffix}`;
    const addedLabel = `✓ ${quantity} · ${unitSuffix}`;
    const showImage = hasItemImage(item);
    const tilt = useZenTilt<HTMLDivElement>({ maxRX: 7, maxRY: 10 }, touch || !isAvailable);
    return (
        <div
            {...stateAttrs(quantity, highlighted, isAvailable, showImage)}
            role="button"
            tabIndex={isAvailable ? 0 : -1}
            aria-disabled={!isAvailable}
            aria-label={`${displayName}, ${priceText(item, lang)} ${currencySymbol}${quantity > 0 ? `, ${quantity}` : ''}`}
            onClick={(e) => cardClick(e, isAvailable, onCardClick)}
            onKeyDown={(e) => cardKeyDown(e, isAvailable, onCardClick)}
            className="zen-card zen-glass zen-tilt"
            ref={tilt.ref}
            onPointerMove={tilt.onPointerMove}
            onPointerLeave={tilt.onPointerLeave}
            onPointerCancel={tilt.onPointerCancel}
            onPointerDown={tilt.onPointerDown}
            onPointerUp={tilt.onPointerUp}
        >
            <span className="zen-glare" aria-hidden="true" />
            <div className="gmedia">
                {showImage ? <ItemImage src={item.image} name={displayName} className="zen-img" /> : null}
                {optionsCount > 0
                    ? <span className="gbadge">{isAr ? `قابل للتخصيص · ${optionsCount} خيارات` : `Customizable · ${optionsCount} options`}</span>
                    : item.isPopular && <span className="gbadge">★ {isAr ? 'مميز' : 'Popular'}</span>}
                <span className="gqty" aria-hidden="true">{quantity}</span>
                {!isAvailable && <span className="zen-veil">{isAr ? 'غير متاح' : 'SOLD OUT'}</span>}
            </div>
            <div className="gbody">
                <div className="gtop">
                    <h3 title={displayName}>{displayName}</h3>
                    {fixed ? (
                        <div className="gprice">{formatPrice(item)} <small>{currencySymbol}</small></div>
                    ) : (
                        <div className="gprice-note">{isAr ? 'حسب الاختيار' : 'As selected'}</div>
                    )}
                </div>
                <div className="gsub">{description || getCategoryLabel(item, lang) || (isAr ? 'إضافة سريعة بضغطة واحدة' : 'One-tap quick add')}</div>
                <div className="chips" aria-hidden="true">
                    {optionsCount > 0 && <span>{isAr ? `${optionsCount} خيارات` : `${optionsCount} options`}</span>}
                    {prep ? <span>{prep} {isAr ? 'د' : 'MIN'}</span> : <span>{isAr ? 'سريع' : 'QUICK'}</span>}
                </div>
                {quantity > 0 ? (
                    <div className="gstep" role="group" aria-label={displayName}>
                        <button onClick={(e) => { e.stopPropagation(); pressFeedback(); onRemove(); }} aria-label={isAr ? 'إنقاص' : 'Decrease'}><Minus size={16} strokeWidth={3} /></button>
                        <b aria-live="polite">{quantity > 0 ? addedLabel : addLabel}</b>
                        <button onClick={(e) => { e.stopPropagation(); pressFeedback(); onAdd(); }} aria-label={isAr ? 'زيادة' : 'Increase'}><Plus size={16} strokeWidth={3} /></button>
                    </div>
                ) : (
                    <button
                        className="gact"
                        onClick={(e) => { e.stopPropagation(); pressFeedback(); onAdd(); }}
                        disabled={!isAvailable}
                    >
                        {addLabel}
                    </button>
                )}
            </div>
        </div>
    );
};

/* ═══════════════════════════════════════════
   04 · SPLIT ACTION  (buttons density)
   Bold image-first card: circular price object,
   unmistakable dual action zone.
   ═══════════════════════════════════════════ */

const SplitCard: React.FC<SharedCardProps> = ({
    item, displayName, isAvailable, quantity, currencySymbol, lang,
    highlighted, touch, onAdd, onRemove, onCardClick,
}) => {
    const isAr = lang === 'ar';
    const description = getItemDescription(item, lang);
    const fixed = hasFixedPrice(item);
    const addLabel = quantity > 0
        ? `✓ ${isAr ? 'تمت الإضافة' : 'ADDED'} ×${quantity}`
        : (isAr ? 'أضف للطلب' : 'ADD TO TICKET');
    const showImage = hasItemImage(item);
    const tilt = useZenTilt<HTMLDivElement>({ maxRX: 5, maxRY: 6 }, touch || !isAvailable);
    return (
        <div
            {...stateAttrs(quantity, highlighted, isAvailable, showImage)}
            role="button"
            tabIndex={isAvailable ? 0 : -1}
            aria-disabled={!isAvailable}
            aria-label={`${displayName}, ${priceText(item, lang)} ${currencySymbol}${quantity > 0 ? `, ${quantity}` : ''}`}
            onClick={(e) => cardClick(e, isAvailable, onCardClick)}
            onKeyDown={(e) => cardKeyDown(e, isAvailable, onCardClick)}
            className="zen-card zen-split zen-tilt"
            ref={tilt.ref}
            onPointerMove={tilt.onPointerMove}
            onPointerLeave={tilt.onPointerLeave}
            onPointerCancel={tilt.onPointerCancel}
            onPointerDown={tilt.onPointerDown}
            onPointerUp={tilt.onPointerUp}
        >
            <span className="zen-glare" aria-hidden="true" />
            <div className="smedia">
                {showImage ? <ItemImage src={item.image} name={displayName} className="zen-img" /> : null}
                {item.isPopular && isAvailable && (
                    <span className="sstamp">★ {isAr ? 'مميز' : 'Popular'}</span>
                )}
                <span className="sqty" aria-hidden="true">{quantity}</span>
                <div className="ring-price" aria-hidden="true">
                    {fixed ? (
                        <div>{formatPrice(item)}<small>{currencySymbol}</small></div>
                    ) : (
                        <div className="ring-price-note">{isAr ? 'حسب الاختيار' : 'As selected'}</div>
                    )}
                </div>
                {!isAvailable && <span className="zen-veil">{isAr ? 'غير متاح' : 'SOLD OUT'}</span>}
            </div>
            <div className="sbody">
                <h3 title={displayName}>{displayName}</h3>
                <div className="sdesc">{description || getCategoryLabel(item, lang) || (isAr ? 'إضافة سريعة بضغطة واحدة' : 'One-tap quick add')}</div>
                <div className="sactions">
                    {quantity > 0 ? (
                        <div className="sstep" role="group" aria-label={displayName}>
                            <button onClick={(e) => { e.stopPropagation(); pressFeedback(); onRemove(); }} aria-label={isAr ? 'إنقاص' : 'Decrease'}><Minus size={16} strokeWidth={3} /></button>
                            <b aria-live="polite">{quantity}</b>
                            <button onClick={(e) => { e.stopPropagation(); pressFeedback(); onAdd(); }} aria-label={isAr ? 'زيادة' : 'Increase'}><Plus size={16} strokeWidth={3} /></button>
                        </div>
                    ) : (
                        <button
                            className="sadd"
                            onClick={(e) => { e.stopPropagation(); pressFeedback(); onAdd(); }}
                            disabled={!isAvailable}
                        >
                            {addLabel}
                        </button>
                    )}
                    <button
                        className="splus"
                        onClick={(e) => { e.stopPropagation(); pressFeedback(); onAdd(); }}
                        disabled={!isAvailable}
                        aria-label={`${isAr ? 'أضف' : 'Add'} ${displayName}`}
                    >
                        +
                    </button>
                </div>
            </div>
        </div>
    );
};

/* ═══════════════════════════════════════════
   Main export — density selects personality.
   comfortable → Poster · compact → Rail
   ultra → Glass · buttons → Split
   ═══════════════════════════════════════════ */

const MenuItemCard: React.FC<MenuItemCardProps> = React.memo(({
    item, onAddItem, onRemoveItem, quantity = 0,
    currencySymbol, isTouchMode, density = 'comfortable', lang, highlighted = false,
}) => {
    const displayName = (item as any).displayName || item.name;
    const isAvailable = (item as any).isActuallyAvailable !== false && item.isAvailable !== false;

    const handleAdd = useCallback(() => { if (isAvailable) onAddItem(item); }, [isAvailable, onAddItem, item]);
    const handleRemove = useCallback(() => { if (onRemoveItem) onRemoveItem(item.id); }, [onRemoveItem, item.id]);

    const shared = {
        item, displayName, isAvailable, quantity, currencySymbol, lang, highlighted,
        touch: isTouchMode,
        onAdd: handleAdd, onRemove: handleRemove, onCardClick: handleAdd,
    };

    switch (density) {
        case 'buttons':
            return <SplitCard {...shared} />;
        case 'ultra':
            return <GlassCard {...shared} />;
        case 'compact':
            return <RailCard {...shared} />;
        default:
            return <PosterCard {...shared} />;
    }
});

export default MenuItemCard;
