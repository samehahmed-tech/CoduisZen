import React, { useCallback } from 'react';
import { Minus, Plus } from 'lucide-react';
import { ItemImage, NoPhoto } from './ItemImage';
import { useZenTilt } from './useZenTilt';
import { playPosClick } from './posClickSound';
import { MenuItem } from '@/types';

/* ═══════════════════════════════════════════════════════════════════
   8 card designs (from menu-item-card-concept.html), theme-aware via
   rgb(var(--…)) tokens + .dark overrides in pos-zen-cards.css.
   density accepts legacy values and normalizes them:
     comfortable → sahara · compact → ticket
     ultra → kiosk · buttons → circle
   ═══════════════════════════════════════════════════════════════════ */

export type CardDesign =
    | 'sahara' | 'typo' | 'noir' | 'ticket'
    | 'circle' | 'kiosk' | 'pop' | 'gold';

/** Legacy density ids (persisted user prefs) + new design ids. */
export type CardDensity = CardDesign | 'comfortable' | 'compact' | 'ultra' | 'buttons';

const LEGACY_DENSITY_MAP: Record<string, CardDesign> = {
    comfortable: 'sahara',
    compact: 'ticket',
    ultra: 'kiosk',
    buttons: 'circle',
};

export const CARD_DESIGNS: CardDesign[] = [
    'sahara', 'typo', 'noir', 'ticket', 'circle', 'kiosk', 'pop', 'gold',
];

export const resolveCardDesign = (density?: string | null): CardDesign => {
    if (!density) return 'sahara';
    if ((CARD_DESIGNS as string[]).includes(density)) return density as CardDesign;
    return LEGACY_DENSITY_MAP[density] ?? 'sahara';
};

/** Card footprint: small / medium / large (persisted POS pref). */
export type CardSize = 'small' | 'medium' | 'large';
export const CARD_SIZES: CardSize[] = ['small', 'medium', 'large'];

interface MenuItemCardProps {
    item: MenuItem;
    onAddItem: (item: MenuItem) => void;
    onRemoveItem?: (itemId: string) => void;
    quantity?: number;
    currencySymbol: string;
    isTouchMode: boolean;
    density?: CardDensity;
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

/** Real photo? Empty/missing images collapse to the monogram state. */
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

const tiltHandlers = (tilt: ReturnType<typeof useZenTilt>) => ({
    ref: tilt.ref,
    onPointerMove: tilt.onPointerMove,
    onPointerLeave: tilt.onPointerLeave,
    onPointerCancel: tilt.onPointerCancel,
    onPointerDown: tilt.onPointerDown,
    onPointerUp: tilt.onPointerUp,
});

/* ═══════════════════════════════════════════
   01 · SAHARA EDITORIAL — warm balanced hero
   ═══════════════════════════════════════════ */

const SaharaCard: React.FC<SharedCardProps> = ({
    item, displayName, isAvailable, quantity, currencySymbol, lang,
    highlighted, touch, onAdd, onRemove, onCardClick,
}) => {
    const isAr = lang === 'ar';
    const addLabel = isAr ? 'أضف +' : 'ADD +';
    const unavailableLabel = isAr ? 'غير متاح' : 'SOLD OUT';
    const metaLine = getCategoryLabel(item, lang) || (isAr ? 'مميز · طازج' : 'PREMIUM · FRESH');
    const description = getItemDescription(item, lang);
    const fixed = hasFixedPrice(item);
    const showImage = hasItemImage(item);
    const optionsCount = getOptionsCount(item);
    const prep = (item as any).preparationTime;
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
            className="zen-card zen-sahara zen-tilt"
            {...tiltHandlers(tilt)}
        >
            <span className="zen-glare" aria-hidden="true" />
            <span className="zen-shine" aria-hidden="true" />
            <div className="sh-media">
                {showImage ? (
                    <ItemImage src={item.image} name={displayName} className="zen-img" />
                ) : (
                    <NoPhoto name={displayName} />
                )}
                {item.isPopular && isAvailable && (
                    <span className="sh-stamp">★ {isAr ? 'الأكثر مبيعًا' : 'Best Seller'}</span>
                )}
                {quantity > 0 && <span className="sh-qty" aria-hidden="true">{quantity}</span>}
                {fixed && <span className="sh-price">{formatPrice(item)}<small>{currencySymbol}</small></span>}
                {!isAvailable && <span className="zen-veil">{unavailableLabel}</span>}
            </div>
            <div className="sh-body">
                <div className="sh-eyebrow">{metaLine}</div>
                <h3 title={displayName}>{displayName}</h3>
                {description && <div className="sh-desc">{description}</div>}
                <div className="sh-chips" aria-hidden="true">
                    {optionsCount > 0 && <span>{optionsCount} {isAr ? 'خيارات' : 'options'}</span>}
                    {prep ? <span>⏱ {prep} {isAr ? 'د' : 'MIN'}</span> : null}
                </div>
                <div className="sh-foot">
                    {quantity > 0 ? (
                        <div className="sh-step" role="group" aria-label={displayName}>
                            <button className="ghost" onClick={(e) => { e.stopPropagation(); pressFeedback(); onRemove(); }} aria-label={isAr ? 'إنقاص' : 'Decrease'}><Minus size={16} strokeWidth={3} /></button>
                            <b aria-live="polite">{quantity}</b>
                            <button onClick={(e) => { e.stopPropagation(); pressFeedback(); onAdd(); }} aria-label={isAr ? 'زيادة' : 'Increase'}><Plus size={16} strokeWidth={3} /></button>
                        </div>
                    ) : (
                        <button
                            className="sh-add"
                            onClick={(e) => { e.stopPropagation(); pressFeedback(); onAdd(); }}
                            disabled={!isAvailable}
                        >
                            {isAvailable ? addLabel : unavailableLabel}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

/* ═══════════════════════════════════════════
   02 · TYPO BRUTALIST — print-first, no-photo-proof
   ═══════════════════════════════════════════ */

const TypoCard: React.FC<SharedCardProps> = ({
    item, displayName, isAvailable, quantity, currencySymbol, lang,
    highlighted, touch, onAdd, onRemove, onCardClick,
}) => {
    const isAr = lang === 'ar';
    const unavailableLabel = isAr ? 'غير متاح' : 'SOLD OUT';
    const catLine = getCategoryLabel(item, lang) || (isAr ? 'أصناف' : 'ITEMS');
    const description = getItemDescription(item, lang);
    const fixed = hasFixedPrice(item);
    const showImage = hasItemImage(item);
    const tilt = useZenTilt<HTMLDivElement>({ maxRX: 4, maxRY: 5 }, touch || !isAvailable);
    return (
        <div
            {...stateAttrs(quantity, highlighted, isAvailable, showImage)}
            role="button"
            tabIndex={isAvailable ? 0 : -1}
            aria-disabled={!isAvailable}
            aria-label={`${displayName}, ${priceText(item, lang)} ${currencySymbol}${quantity > 0 ? `, ${quantity}` : ''}`}
            onClick={(e) => cardClick(e, isAvailable, onCardClick)}
            onKeyDown={(e) => cardKeyDown(e, isAvailable, onCardClick)}
            className="zen-card zen-typo zen-tilt"
            {...tiltHandlers(tilt)}
        >
            <span className="zen-glare" aria-hidden="true" />
            <span className="zen-shine" aria-hidden="true" />
            <div className="ty-row">
                {showImage ? (
                    <ItemImage src={item.image} name={displayName} className="zen-img ty-thumb" />
                ) : (
                    <div className="ty-thumb"><NoPhoto name={displayName} /></div>
                )}
                <div className="ty-head">
                    <span className="ty-kicker">{catLine}</span>
                    <h3 title={displayName}>{displayName}</h3>
                </div>
                {quantity > 0 && <span className="ty-qty" aria-hidden="true">{quantity}</span>}
            </div>
            {description && <div className="ty-desc">{description}</div>}
            <div className="ty-price">
                {fixed ? <>{formatPrice(item)} <small>{currencySymbol}</small></> : <span className="ty-var">{isAr ? 'حسب الاختيار' : 'As selected'}</span>}
            </div>
            <div className="ty-foot">
                {quantity > 0 ? (
                    <div className="ty-step" role="group" aria-label={displayName}>
                        <button onClick={(e) => { e.stopPropagation(); pressFeedback(); onRemove(); }} aria-label={isAr ? 'إنقاص' : 'Decrease'}><Minus size={16} strokeWidth={3} /></button>
                        <b aria-live="polite">{quantity}</b>
                        <button onClick={(e) => { e.stopPropagation(); pressFeedback(); onAdd(); }} aria-label={isAr ? 'زيادة' : 'Increase'}><Plus size={16} strokeWidth={3} /></button>
                    </div>
                ) : (
                    <button
                        className="ty-add"
                        onClick={(e) => { e.stopPropagation(); pressFeedback(); onAdd(); }}
                        disabled={!isAvailable}
                    >
                        {isAvailable ? (isAr ? 'أضف للطلب +' : 'ADD TO ORDER +') : unavailableLabel}
                    </button>
                )}
            </div>
            {!isAvailable && <span className="zen-veil">{unavailableLabel}</span>}
        </div>
    );
};

/* ═══════════════════════════════════════════
   03 · GLASS NOIR — premium night card
   ═══════════════════════════════════════════ */

const NoirCard: React.FC<SharedCardProps> = ({
    item, displayName, isAvailable, quantity, currencySymbol, lang,
    highlighted, touch, onAdd, onRemove, onCardClick,
}) => {
    const isAr = lang === 'ar';
    const unavailableLabel = isAr ? 'غير متاح' : 'SOLD OUT';
    const metaLine = getCategoryLabel(item, lang) || (isAr ? 'مميز · طازج' : 'PREMIUM · FRESH');
    const description = getItemDescription(item, lang);
    const fixed = hasFixedPrice(item);
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
            className="zen-card zen-noir zen-tilt"
            {...tiltHandlers(tilt)}
        >
            <span className="zen-glare" aria-hidden="true" />
            <span className="zen-shine" aria-hidden="true" />
            {showImage ? (
                <ItemImage src={item.image} name={displayName} className="zen-img nr-bg" />
            ) : (
                <NoPhoto name={displayName} />
            )}
            {item.isPopular && isAvailable && (
                <span className="nr-stamp">★ {isAr ? 'الأكثر مبيعًا' : 'Best Seller'}</span>
            )}
            {quantity > 0 && <span className="nr-qty" aria-hidden="true">{quantity}</span>}
            <div className="nr-body">
                <div className="nr-eyebrow">{metaLine}</div>
                <h3 title={displayName}>{displayName}</h3>
                {description && <div className="nr-desc">{description}</div>}
                <div className="nr-foot">
                    {fixed ? (
                        <div className="nr-price">{formatPrice(item)} <small>{currencySymbol}</small></div>
                    ) : (
                        <div className="nr-var">{isAr ? 'حسب الاختيار' : 'As selected'}</div>
                    )}
                    {quantity > 0 ? (
                        <div className="nr-step" role="group" aria-label={displayName}>
                            <button onClick={(e) => { e.stopPropagation(); pressFeedback(); onRemove(); }} aria-label={isAr ? 'إنقاص' : 'Decrease'}><Minus size={15} strokeWidth={3} /></button>
                            <b aria-live="polite">{quantity}</b>
                            <button onClick={(e) => { e.stopPropagation(); pressFeedback(); onAdd(); }} aria-label={isAr ? 'زيادة' : 'Increase'}><Plus size={15} strokeWidth={3} /></button>
                        </div>
                    ) : (
                        <button
                            className="nr-add"
                            onClick={(e) => { e.stopPropagation(); pressFeedback(); onAdd(); }}
                            disabled={!isAvailable}
                        >
                            {isAr ? 'أضف +' : 'ADD +'}
                        </button>
                    )}
                </div>
            </div>
            {!isAvailable && <span className="zen-veil">{unavailableLabel}</span>}
        </div>
    );
};

/* ═══════════════════════════════════════════
   04 · TICKET LEDGER — rush-hour rows
   ═══════════════════════════════════════════ */

const TicketRow: React.FC<SharedCardProps> = ({
    item, displayName, isAvailable, quantity, currencySymbol, lang,
    highlighted, onAdd, onRemove, onCardClick,
}) => {
    const isAr = lang === 'ar';
    const optionsCount = getOptionsCount(item);
    const prep = (item as any).preparationTime;
    const fixed = hasFixedPrice(item);
    const showImage = hasItemImage(item);
    const meta = [
        item.isPopular ? (isAr ? '★ مميز' : '★ Popular') : null,
        optionsCount > 0 ? (isAr ? `${optionsCount} خيارات` : `${optionsCount} options`) : null,
        prep ? `${prep} ${isAr ? 'د' : 'MIN'}` : null,
    ].filter(Boolean).join(' · ');
    return (
        <div
            {...stateAttrs(quantity, highlighted, isAvailable, showImage)}
            role="button"
            tabIndex={isAvailable ? 0 : -1}
            aria-disabled={!isAvailable}
            aria-label={`${displayName}, ${priceText(item, lang)} ${currencySymbol}${quantity > 0 ? `, ${quantity}` : ''}`}
            onClick={(e) => cardClick(e, isAvailable, onCardClick)}
            onKeyDown={(e) => cardKeyDown(e, isAvailable, onCardClick)}
            className="zen-card zen-ticket"
        >
            {showImage ? (
                <ItemImage src={item.image} name={displayName} className="zen-img tk-thumb" />
            ) : (
                <div className="tk-thumb"><NoPhoto name={displayName} /></div>
            )}
            <div className="tk-info">
                <h3 title={displayName}>{displayName}</h3>
                <p className="tk-meta">{meta || (isAr ? 'إضافة سريعة بضغطة واحدة' : 'One-tap quick add')}</p>
            </div>
            {fixed ? (
                <div className="tk-price">{formatPrice(item)}<small>{currencySymbol}</small></div>
            ) : (
                <div className="tk-var">{isAr ? 'حسب الاختيار' : 'As selected'}</div>
            )}
            {quantity > 0 ? (
                <div className="tk-step" role="group" aria-label={displayName}>
                    <button onClick={(e) => { e.stopPropagation(); pressFeedback(); onRemove(); }} aria-label={isAr ? 'إنقاص' : 'Decrease'}><Minus size={15} strokeWidth={3} /></button>
                    <b aria-live="polite">{quantity}</b>
                    <button onClick={(e) => { e.stopPropagation(); pressFeedback(); onAdd(); }} aria-label={isAr ? 'زيادة' : 'Increase'}><Plus size={15} strokeWidth={3} /></button>
                </div>
            ) : (
                <button
                    className="tk-add"
                    onClick={(e) => { e.stopPropagation(); pressFeedback(); onAdd(); }}
                    disabled={!isAvailable}
                    aria-label={`${isAr ? 'أضف' : 'Add'} ${displayName}`}
                >
                    <Plus size={15} strokeWidth={3} />
                    <span>{isAvailable ? (isAr ? 'أضف' : 'ADD') : (isAr ? 'نفد' : 'OUT')}</span>
                </button>
            )}
        </div>
    );
};

/* ═══════════════════════════════════════════
   05 · SPLIT CIRCLE — friendly touch-first
   ═══════════════════════════════════════════ */

const CircleCard: React.FC<SharedCardProps> = ({
    item, displayName, isAvailable, quantity, currencySymbol, lang,
    highlighted, touch, onAdd, onRemove, onCardClick,
}) => {
    const isAr = lang === 'ar';
    const unavailableLabel = isAr ? 'غير متاح' : 'SOLD OUT';
    const description = getItemDescription(item, lang) || getCategoryLabel(item, lang) || (isAr ? 'إضافة سريعة بضغطة واحدة' : 'One-tap quick add');
    const fixed = hasFixedPrice(item);
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
            className="zen-card zen-circle zen-tilt"
            {...tiltHandlers(tilt)}
        >
            <span className="zen-glare" aria-hidden="true" />
            <span className="zen-shine" aria-hidden="true" />
            <div className="cc-wrap">
                {showImage ? (
                    <ItemImage src={item.image} name={displayName} className="zen-img cc-photo" />
                ) : (
                    <div className="cc-photo"><NoPhoto name={displayName} /></div>
                )}
                <div className="cc-ring" aria-hidden="true">
                    {fixed ? <>{formatPrice(item)}<small>{currencySymbol}</small></> : <span className="cc-var">{isAr ? 'حسب الاختيار' : 'As selected'}</span>}
                </div>
                {quantity > 0 && <span className="cc-qty" aria-hidden="true">{quantity}</span>}
            </div>
            <h3 title={displayName}>{displayName}</h3>
            <div className="cc-desc">{description}</div>
            <div className="cc-actions">
                {quantity > 0 ? (
                    <div className="cc-step" role="group" aria-label={displayName}>
                        <button onClick={(e) => { e.stopPropagation(); pressFeedback(); onRemove(); }} aria-label={isAr ? 'إنقاص' : 'Decrease'}><Minus size={16} strokeWidth={3} /></button>
                        <b aria-live="polite">{quantity}</b>
                        <button onClick={(e) => { e.stopPropagation(); pressFeedback(); onAdd(); }} aria-label={isAr ? 'زيادة' : 'Increase'}><Plus size={16} strokeWidth={3} /></button>
                    </div>
                ) : (
                    <>
                        <button
                            className="cc-add"
                            onClick={(e) => { e.stopPropagation(); pressFeedback(); onAdd(); }}
                            disabled={!isAvailable}
                        >
                            {isAvailable ? (isAr ? 'أضف للطلب' : 'ADD TO TICKET') : unavailableLabel}
                        </button>
                        <button
                            className="cc-plus"
                            onClick={(e) => { e.stopPropagation(); pressFeedback(); onAdd(); }}
                            disabled={!isAvailable}
                            aria-label={`${isAr ? 'أضف' : 'Add'} ${displayName}`}
                        >
                            +
                        </button>
                    </>
                )}
            </div>
            {!isAvailable && <span className="zen-veil">{unavailableLabel}</span>}
        </div>
    );
};

/* ═══════════════════════════════════════════
   06 · KIOSK MINI — maximum density tiles
   ═══════════════════════════════════════════ */

const KioskTile: React.FC<SharedCardProps> = ({
    item, displayName, isAvailable, quantity, currencySymbol, lang,
    highlighted, onAdd, onRemove, onCardClick,
}) => {
    const isAr = lang === 'ar';
    const fixed = hasFixedPrice(item);
    const showImage = hasItemImage(item);
    return (
        <div
            {...stateAttrs(quantity, highlighted, isAvailable, showImage)}
            role="button"
            tabIndex={isAvailable ? 0 : -1}
            aria-disabled={!isAvailable}
            aria-label={`${displayName}, ${priceText(item, lang)} ${currencySymbol}${quantity > 0 ? `, ${quantity}` : ''}`}
            onClick={(e) => cardClick(e, isAvailable, onCardClick)}
            onKeyDown={(e) => cardKeyDown(e, isAvailable, onCardClick)}
            className="zen-card zen-kiosk"
        >
            <div className="kk-media">
                {showImage ? (
                    <ItemImage src={item.image} name={displayName} className="zen-img" />
                ) : (
                    <NoPhoto name={displayName} />
                )}
                {quantity > 0 && <span className="kk-qty" aria-hidden="true">{quantity}</span>}
                {!isAvailable && <span className="zen-veil">{isAr ? 'نفد' : 'OUT'}</span>}
            </div>
            <div className="kk-body">
                <h3 title={displayName}>{displayName}</h3>
                <div className="kk-price">{fixed ? <>{formatPrice(item)} <small>{currencySymbol}</small></> : <span className="kk-var">{isAr ? 'حسب الاختيار' : 'As selected'}</span>}</div>
                {quantity > 0 ? (
                    <div className="kk-step" role="group" aria-label={displayName}>
                        <button onClick={(e) => { e.stopPropagation(); pressFeedback(); onRemove(); }} aria-label={isAr ? 'إنقاص' : 'Decrease'}>−</button>
                        <b aria-live="polite">{quantity}</b>
                        <button onClick={(e) => { e.stopPropagation(); pressFeedback(); onAdd(); }} aria-label={isAr ? 'زيادة' : 'Increase'}>+</button>
                    </div>
                ) : (
                    <button
                        className="kk-add"
                        onClick={(e) => { e.stopPropagation(); pressFeedback(); onAdd(); }}
                        disabled={!isAvailable}
                    >
                        {isAr ? 'أضف' : 'ADD'}
                    </button>
                )}
            </div>
        </div>
    );
};

/* ═══════════════════════════════════════════
   07 · CAFÉ POP — playful morning card
   ═══════════════════════════════════════════ */

const PopCard: React.FC<SharedCardProps> = ({
    item, displayName, isAvailable, quantity, currencySymbol, lang,
    highlighted, touch, onAdd, onRemove, onCardClick,
}) => {
    const isAr = lang === 'ar';
    const unavailableLabel = isAr ? 'غير متاح' : 'SOLD OUT';
    const description = getItemDescription(item, lang);
    const fixed = hasFixedPrice(item);
    const showImage = hasItemImage(item);
    const tilt = useZenTilt<HTMLDivElement>({ maxRX: 5, maxRY: 7 }, touch || !isAvailable);
    return (
        <div
            {...stateAttrs(quantity, highlighted, isAvailable, showImage)}
            role="button"
            tabIndex={isAvailable ? 0 : -1}
            aria-disabled={!isAvailable}
            aria-label={`${displayName}, ${priceText(item, lang)} ${currencySymbol}${quantity > 0 ? `, ${quantity}` : ''}`}
            onClick={(e) => cardClick(e, isAvailable, onCardClick)}
            onKeyDown={(e) => cardKeyDown(e, isAvailable, onCardClick)}
            className="zen-card zen-pop zen-tilt"
            {...tiltHandlers(tilt)}
        >
            <span className="zen-glare" aria-hidden="true" />
            <span className="zen-shine" aria-hidden="true" />
            <div className="pp-media">
                {showImage ? (
                    <ItemImage src={item.image} name={displayName} className="zen-img" />
                ) : (
                    <NoPhoto name={displayName} />
                )}
                {fixed && <span className="pp-float">{formatPrice(item)} {currencySymbol}</span>}
                {quantity > 0 && <span className="pp-qty" aria-hidden="true">{quantity}</span>}
            </div>
            <h3 title={displayName}>{displayName}</h3>
            {description && <div className="pp-desc">{description}</div>}
            <div className="pp-foot">
                <div className="pp-price">{fixed ? formatPrice(item) : (isAr ? 'حسب الاختيار' : 'As selected')}</div>
                {quantity > 0 ? (
                    <div className="pp-step" role="group" aria-label={displayName}>
                        <button onClick={(e) => { e.stopPropagation(); pressFeedback(); onRemove(); }} aria-label={isAr ? 'إنقاص' : 'Decrease'}><Minus size={15} strokeWidth={3} /></button>
                        <b aria-live="polite">{quantity}</b>
                        <button onClick={(e) => { e.stopPropagation(); pressFeedback(); onAdd(); }} aria-label={isAr ? 'زيادة' : 'Increase'}><Plus size={15} strokeWidth={3} /></button>
                    </div>
                ) : (
                    <button
                        className="pp-add"
                        onClick={(e) => { e.stopPropagation(); pressFeedback(); onAdd(); }}
                        disabled={!isAvailable}
                    >
                        {isAvailable ? (isAr ? 'أضف +' : 'ADD +') : unavailableLabel}
                    </button>
                )}
            </div>
            {!isAvailable && <span className="zen-veil">{unavailableLabel}</span>}
        </div>
    );
};

/* ═══════════════════════════════════════════
   08 · MAISON GOLD — fine-dining card
   ═══════════════════════════════════════════ */

const GoldCard: React.FC<SharedCardProps> = ({
    item, displayName, isAvailable, quantity, currencySymbol, lang,
    highlighted, touch, onAdd, onRemove, onCardClick,
}) => {
    const isAr = lang === 'ar';
    const unavailableLabel = isAr ? 'غير متاح' : 'SOLD OUT';
    const metaLine = getCategoryLabel(item, lang) || (isAr ? 'اختيار الشيف' : "CHEF'S SELECTION");
    const description = getItemDescription(item, lang);
    const fixed = hasFixedPrice(item);
    const showImage = hasItemImage(item);
    const tilt = useZenTilt<HTMLDivElement>({ maxRX: 4, maxRY: 6 }, touch || !isAvailable);
    return (
        <div
            {...stateAttrs(quantity, highlighted, isAvailable, showImage)}
            role="button"
            tabIndex={isAvailable ? 0 : -1}
            aria-disabled={!isAvailable}
            aria-label={`${displayName}, ${priceText(item, lang)} ${currencySymbol}${quantity > 0 ? `, ${quantity}` : ''}`}
            onClick={(e) => cardClick(e, isAvailable, onCardClick)}
            onKeyDown={(e) => cardKeyDown(e, isAvailable, onCardClick)}
            className="zen-card zen-gold zen-tilt"
            {...tiltHandlers(tilt)}
        >
            <span className="zen-glare" aria-hidden="true" />
            <span className="zen-shine" aria-hidden="true" />
            <div className="gd-media">
                {showImage ? (
                    <ItemImage src={item.image} name={displayName} className="zen-img" />
                ) : (
                    <NoPhoto name={displayName} />
                )}
                <div className="gd-frame" aria-hidden="true" />
                {quantity > 0 && <span className="gd-qty" aria-hidden="true">{quantity}</span>}
            </div>
            <div className="gd-body">
                <div className="gd-eyebrow">{metaLine}</div>
                <h3 title={displayName}>{displayName}</h3>
                {description && <div className="gd-desc">{description}</div>}
                <div className="gd-div" aria-hidden="true">
                    <span className="gd-price">{fixed ? <>{formatPrice(item)} {currencySymbol}</> : (isAr ? 'حسب الاختيار' : 'As selected')}</span>
                </div>
                {quantity > 0 ? (
                    <div className="gd-step" role="group" aria-label={displayName}>
                        <button onClick={(e) => { e.stopPropagation(); pressFeedback(); onRemove(); }} aria-label={isAr ? 'إنقاص' : 'Decrease'}><Minus size={15} strokeWidth={3} /></button>
                        <b aria-live="polite">{quantity}</b>
                        <button onClick={(e) => { e.stopPropagation(); pressFeedback(); onAdd(); }} aria-label={isAr ? 'زيادة' : 'Increase'}><Plus size={15} strokeWidth={3} /></button>
                    </div>
                ) : (
                    <button
                        className="gd-add"
                        onClick={(e) => { e.stopPropagation(); pressFeedback(); onAdd(); }}
                        disabled={!isAvailable}
                    >
                        {isAvailable ? (isAr ? 'أضف إلى الطلب' : 'ADD TO ORDER') : unavailableLabel}
                    </button>
                )}
            </div>
            {!isAvailable && <span className="zen-veil">{unavailableLabel}</span>}
        </div>
    );
};

/* ═══════════════════════════════════════════
   Main export — design selects personality.
   ═══════════════════════════════════════════ */

const MenuItemCard: React.FC<MenuItemCardProps> = React.memo(({
    item, onAddItem, onRemoveItem, quantity = 0,
    currencySymbol, isTouchMode, density = 'sahara', lang, highlighted = false,
}) => {
    const design = resolveCardDesign(density);
    const displayName = (item as any).displayName || item.name;
    const isAvailable = (item as any).isActuallyAvailable !== false && item.isAvailable !== false;

    const handleAdd = useCallback(() => { if (isAvailable) onAddItem(item); }, [isAvailable, onAddItem, item]);
    const handleRemove = useCallback(() => { if (onRemoveItem) onRemoveItem(item.id); }, [onRemoveItem, item.id]);

    const shared = {
        item, displayName, isAvailable, quantity, currencySymbol, lang, highlighted,
        touch: isTouchMode,
        onAdd: handleAdd, onRemove: handleRemove, onCardClick: handleAdd,
    };

    switch (design) {
        case 'typo':
            return <TypoCard {...shared} />;
        case 'noir':
            return <NoirCard {...shared} />;
        case 'ticket':
            return <TicketRow {...shared} />;
        case 'circle':
            return <CircleCard {...shared} />;
        case 'kiosk':
            return <KioskTile {...shared} />;
        case 'pop':
            return <PopCard {...shared} />;
        case 'gold':
            return <GoldCard {...shared} />;
        default:
            return <SaharaCard {...shared} />;
    }
});

export default MenuItemCard;
