import React, { useState } from 'react';

/* ── ItemImage ──
   Domain-neutral item visual for sales surfaces (POS cards, ...).
   - Real photo when the item has one (with broken-URL recovery).
   - Otherwise a pure decorative pattern tile (no letters): layered mesh
     gradients + pinstripes + sheen. A stable motif picked from the item
     name keeps cards distinguishable while the overlaid item name stays
     the only text — always readable. Works for restaurants, cafes,
     supermarkets, any theme (light/dark), with no stock photo.
*/
interface ItemImageProps {
    src?: string | null;
    name: string;
    className?: string;
    eager?: boolean;
    /** Compact tile for table/list thumbnails. */
    small?: boolean;
}

const hasSrc = (value?: string | null): boolean =>
    !!value && value.trim().length > 0;

export const ItemImage: React.FC<ItemImageProps> = ({
    src, name, className = '', eager = false, small = false,
}) => {
    const [failed, setFailed] = useState(false);
    // Stable motif 0-5 from the name hash — pattern variety per item,
    // zero text rendered. Recomputed only when the name changes.
    const motif = React.useMemo(() => {
        const value = (name || '').trim();
        let hash = 0;
        for (let i = 0; i < value.length; i++) {
            hash = (hash * 31 + value.charCodeAt(i)) | 0;
        }
        return Math.abs(hash) % 6;
    }, [name]);

    if (hasSrc(src) && !failed) {
        return (
            <img
                src={src!.trim()}
                alt=""
                loading={eager ? 'eager' : 'lazy'}
                decoding="async"
                draggable={false}
                className={className}
                onError={() => setFailed(true)}
            />
        );
    }

    return (
        <div
            className={`pos-img-fallback${small ? ' pos-img-fallback--sm' : ''} ${className}`.trim()}
            data-motif={motif}
            aria-hidden="true"
        />
    );
};

/* ── NoPhoto ──
   Calm shared empty state for cards with no image (POS 8 designs +
   menu manager). Quiet theme surface + faint dotted pattern (intensity
   per theme via --pos-theme-card-pattern-opacity) + one small hero
   medallion with a minimal food/drink line illustration picked from
   the item name (Arabic + English keywords, stable hash fallback).
*/
type FoodKind = 'pizza' | 'burger' | 'coffee' | 'juice' | 'bowl' | 'dessert' | 'chicken' | 'fish';

const FOOD_KEYWORDS: { kind: FoodKind; words: string[] }[] = [
    { kind: 'pizza', words: ['بيتزا', 'pizza', 'مارغريتا', 'margherita', 'فورنو'] },
    { kind: 'burger', words: ['برجر', 'burger', 'سماش', 'همبرجر', 'شاورما', 'ساندوتش', 'سندويش', 'تاكو', 'sandwich', 'shawarma', 'taco', 'wrap', 'راب'] },
    { kind: 'coffee', words: ['قهوة', 'قهوه', 'كوفي', 'لاتيه', 'اسبريسو', 'كابتشينو', 'موكا', 'شاي', 'هوت', 'coffee', 'tea', 'latte', 'espresso', 'cappuccino', 'mocha', 'flat white'] },
    { kind: 'juice', words: ['عصير', 'سموزي', 'ميلك', 'موهيتو', 'فرابيه', 'فرابتشينو', 'juice', 'smoothie', 'mojito', 'milkshake', 'frappe'] },
    { kind: 'bowl', words: ['سلطة', 'سلطه', 'سيزر', 'باستا', 'مكرونة', 'مكرونه', 'نودلز', 'كشري', 'فول', 'طعمية', 'شوربة', 'ارز', 'أرز', 'salad', 'pasta', 'caesar', 'soup', 'rice', 'bowl'] },
    { kind: 'dessert', words: ['كيك', 'تشيز', 'حلويات', 'حلو', 'آيس', 'ايس', 'مولتن', 'دونات', 'سينابون', 'مهلبية', 'ام علي', 'cake', 'dessert', 'cheese', 'ice cream', 'donut', 'sweet'] },
    { kind: 'chicken', words: ['دجاج', 'فراخ', 'بروست', 'بروستد', 'مشوي', 'شيش', 'ناجتس', 'chicken', 'broast', 'grill', 'nuggets', 'wings'] },
    { kind: 'fish', words: ['سمك', 'سلمون', 'جمبري', 'سوشي', 'تونة', 'فيليه', 'fish', 'salmon', 'sushi', 'shrimp', 'tuna', 'seafood'] },
];

const FOOD_KINDS: FoodKind[] = ['pizza', 'burger', 'coffee', 'juice', 'bowl', 'dessert', 'chicken', 'fish'];

const pickFoodKind = (name: string): FoodKind => {
    const n = ` ${String(name || '').toLowerCase()} `;
    for (const { kind, words } of FOOD_KEYWORDS) {
        if (words.some((w) => n.includes(w))) return kind;
    }
    let h = 0;
    const s = String(name || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return FOOD_KINDS[Math.abs(h) % FOOD_KINDS.length];
};

/** Layered food-scene art (96px grid): soft shadow + plate + appetizing
 *  dish drawn from 5-9 filled shapes with highlights. Real little scenes,
 *  not line icons — food keeps natural gourmet colors on any theme. */
const FOOD_ART: Record<FoodKind, React.ReactNode> = {
    pizza: (<>
        <ellipse cx="48" cy="82" rx="26" ry="6" fill="rgba(0,0,0,.25)" />
        <circle cx="48" cy="48" r="34" fill="#FCF7EC" />
        <circle cx="48" cy="48" r="28" fill="none" stroke="rgba(0,0,0,.10)" strokeWidth="1.5" />
        <circle cx="48" cy="48" r="22" fill="#D6502F" />
        <circle cx="48" cy="48" r="17.5" fill="#F6C445" />
        <circle cx="39" cy="41" r="3.6" fill="#B23A2A" />
        <circle cx="57" cy="39" r="3.6" fill="#B23A2A" />
        <circle cx="47" cy="52" r="3.6" fill="#B23A2A" />
        <circle cx="58" cy="55" r="3.6" fill="#B23A2A" />
        <circle cx="37" cy="55" r="3.6" fill="#B23A2A" />
        <ellipse cx="50" cy="44" rx="3" ry="1.6" fill="#3E7C46" transform="rotate(-20 50 44)" />
        <ellipse cx="44" cy="58" rx="3" ry="1.6" fill="#3E7C46" transform="rotate(15 44 58)" />
        <path d="M35 42a15 15 0 0 1 8-8" stroke="#FFF" strokeWidth="2.5" opacity=".5" fill="none" strokeLinecap="round" />
    </>),
    burger: (<>
        <ellipse cx="48" cy="82" rx="26" ry="6" fill="rgba(0,0,0,.25)" />
        <circle cx="48" cy="48" r="34" fill="#FCF7EC" />
        <circle cx="48" cy="48" r="28" fill="none" stroke="rgba(0,0,0,.10)" strokeWidth="1.5" />
        <rect x="30" y="60" width="36" height="9" rx="4.5" fill="#E8A24B" />
        <rect x="28.5" y="54" width="39" height="7" rx="3.5" fill="#6B4226" />
        <rect x="32" y="49.5" width="32" height="4.5" rx="2" fill="#F6C445" />
        <rect x="35" y="45.5" width="26" height="4" rx="2" fill="#D6502F" />
        <path d="M29 44q4.5-4.5 9 0t9 0 9 0 9 0" stroke="#55A05B" strokeWidth="3.2" fill="none" strokeLinecap="round" />
        <path d="M29 41c0-9 8.5-16 19-16s19 7 19 16H29Z" fill="#EFA94E" />
        <circle cx="40" cy="30" r="1.2" fill="#FFF3D6" />
        <circle cx="48" cy="27.5" r="1.2" fill="#FFF3D6" />
        <circle cx="56" cy="30" r="1.2" fill="#FFF3D6" />
        <circle cx="44" cy="35" r="1.2" fill="#FFF3D6" />
        <path d="M36 32a12 12 0 0 1 6-5" stroke="#FFF" strokeWidth="2.2" opacity=".55" fill="none" strokeLinecap="round" />
    </>),
    coffee: (<>
        <ellipse cx="48" cy="82" rx="24" ry="5.5" fill="rgba(0,0,0,.25)" />
        <ellipse cx="48" cy="72" rx="25" ry="7" fill="#EFE6D2" />
        <ellipse cx="48" cy="71" rx="17" ry="4.5" fill="#E0D2B4" />
        <path d="M61 48h3.5a5 5 0 0 1 0 10H60" stroke="rgba(0,0,0,.12)" strokeWidth="5.5" fill="none" strokeLinecap="round" />
        <path d="M35 42h26l-2.6 24a5 5 0 0 1-5 4.4H42.6a5 5 0 0 1-5-4.4L35 42Z" fill="#FCF7EC" stroke="rgba(0,0,0,.10)" strokeWidth="1.5" />
        <ellipse cx="48" cy="42" rx="13" ry="4" fill="#6F4E37" />
        <ellipse cx="48" cy="41.5" rx="8" ry="2.3" fill="#A97C50" />
        <path d="M61 48h3.5a5 5 0 0 1 0 10H60" stroke="#FCF7EC" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M43 30c-2-2.5 2-4 0-6.5M53 30c-2-2.5 2-4 0-6.5" stroke="#FFF" strokeWidth="2.2" opacity=".75" fill="none" strokeLinecap="round" />
    </>),
    juice: (<>
        <ellipse cx="48" cy="82" rx="24" ry="5.5" fill="rgba(0,0,0,.25)" />
        <path d="M37 32h22l-2.6 40a4 4 0 0 1-4 3.4H43.6a4 4 0 0 1-4-3.4L37 32Z" fill="rgba(255,255,255,.55)" stroke="rgba(255,255,255,.8)" strokeWidth="1.5" />
        <path d="M39 46h18l-1.9 29a2.5 2.5 0 0 1-2.5 2.2h-9.2a2.5 2.5 0 0 1-2.5-2.2L39 46Z" fill="#F2994A" />
        <path d="M42 51l-1.2 20" stroke="#FFF" strokeWidth="2" opacity=".5" strokeLinecap="round" />
        <path d="M52 46l4.5-20 4.5-.5" stroke="#D6502F" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="61" cy="30" r="6.5" fill="#F6C445" stroke="#FFF3D6" strokeWidth="1.5" />
        <path d="M61 30v-5M61 30l4.5 2.5M61 30l-4.5 2.5" stroke="#FFF" strokeWidth="1" opacity=".8" strokeLinecap="round" />
    </>),
    bowl: (<>
        <ellipse cx="48" cy="82" rx="26" ry="6" fill="rgba(0,0,0,.25)" />
        <path d="M24 50h48c0 13-10.5 23-24 23S24 63 24 50Z" fill="#EFE6D2" />
        <ellipse cx="48" cy="50" rx="24" ry="5.5" fill="#FCF7EC" />
        <circle cx="37" cy="42" r="8" fill="#55A05B" />
        <circle cx="48" cy="36" r="9" fill="#3E7C46" />
        <circle cx="59" cy="43" r="8" fill="#6FBF73" />
        <circle cx="44" cy="46" r="6" fill="#3E7C46" />
        <circle cx="42" cy="40" r="3" fill="#D6502F" />
        <circle cx="54" cy="38" r="3" fill="#D6502F" />
        <circle cx="50" cy="47" r="3" fill="#D6502F" />
        <rect x="45" y="41" width="4.5" height="4.5" rx="1" fill="#FFF3D6" transform="rotate(18 47 43)" />
        <path d="M36 44q6 4 12 0t12 0" stroke="#FFF7EA" strokeWidth="2" opacity=".9" fill="none" strokeLinecap="round" />
        <rect x="42" y="73" width="12" height="4" rx="2" fill="#D9C9A8" />
    </>),
    dessert: (<>
        <ellipse cx="48" cy="82" rx="26" ry="6" fill="rgba(0,0,0,.25)" />
        <circle cx="48" cy="52" r="34" fill="#FCF7EC" />
        <circle cx="48" cy="52" r="28" fill="none" stroke="rgba(0,0,0,.10)" strokeWidth="1.5" />
        <clipPath id="np-cake"><polygon points="36,70 64,70 64,42" /></clipPath>
        <g clipPath="url(#np-cake)">
            <rect x="34" y="40" width="32" height="32" fill="#E9B44C" />
            <rect x="34" y="57" width="32" height="4" fill="#FFF7EA" />
            <rect x="34" y="46" width="32" height="6" fill="#C13B5E" />
            <rect x="34" y="40" width="32" height="3" fill="#A92E4E" />
        </g>
        <circle cx="63" cy="37" r="3.6" fill="#C13B5E" />
        <path d="M63 33.5c0-2 1-3 2.5-3.5" stroke="#3E7C46" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <ellipse cx="58" cy="33" rx="2.6" ry="1.3" fill="#55A05B" transform="rotate(-24 58 33)" />
        <path d="M42 52l6-6" stroke="#FFF" strokeWidth="2" opacity=".55" strokeLinecap="round" />
    </>),
    chicken: (<>
        <ellipse cx="48" cy="82" rx="26" ry="6" fill="rgba(0,0,0,.25)" />
        <circle cx="48" cy="50" r="34" fill="#FCF7EC" />
        <circle cx="48" cy="50" r="28" fill="none" stroke="rgba(0,0,0,.10)" strokeWidth="1.5" />
        <rect x="57" y="57" width="17" height="5.5" rx="2.75" transform="rotate(45 65 60)" fill="#F3E9D2" />
        <circle cx="72" cy="67" r="3" fill="#F3E9D2" stroke="rgba(0,0,0,.08)" strokeWidth="1" />
        <circle cx="75" cy="70" r="2.4" fill="#F3E9D2" stroke="rgba(0,0,0,.08)" strokeWidth="1" />
        <ellipse cx="44" cy="48" rx="17" ry="14" transform="rotate(-18 44 48)" fill="#A8642F" />
        <ellipse cx="42" cy="46" rx="11" ry="8.5" transform="rotate(-18 42 46)" fill="#C98A4B" opacity=".9" />
        <path d="M33 44a13 13 0 0 1 7-6" stroke="#FFF" strokeWidth="2.2" opacity=".5" fill="none" strokeLinecap="round" />
        <ellipse cx="52" cy="54" rx="2.4" ry="1.2" fill="#3E7C46" transform="rotate(-18 52 54)" />
    </>),
    fish: (<>
        <ellipse cx="48" cy="82" rx="26" ry="6" fill="rgba(0,0,0,.25)" />
        <circle cx="48" cy="50" r="34" fill="#FCF7EC" />
        <circle cx="48" cy="50" r="28" fill="none" stroke="rgba(0,0,0,.10)" strokeWidth="1.5" />
        <ellipse cx="46" cy="50" rx="19" ry="13.5" fill="#EE7B57" />
        <ellipse cx="46" cy="50" rx="13.5" ry="9" fill="#F49B7E" />
        <path d="M38 42l3 16M45 40.5l2 19M52 40.5l-2 19" stroke="#C65A3E" strokeWidth="2" opacity=".75" strokeLinecap="round" />
        <circle cx="36" cy="47" r="1.4" fill="#7A3B28" />
        <polygon points="60,63 72,63 66,72" fill="#F6D55C" stroke="rgba(0,0,0,.08)" strokeWidth="1" />
        <ellipse cx="56" cy="60" rx="2.6" ry="1.2" fill="#3E7C46" transform="rotate(-20 56 60)" />
    </>),
};

export const NoPhoto: React.FC<{ name: string }> = ({ name }) => (
    <div className="np-empty" aria-hidden="true">
        <svg viewBox="0 0 96 96" aria-hidden="true">
            {FOOD_ART[pickFoodKind(name)]}
        </svg>
    </div>
);

export default ItemImage;
