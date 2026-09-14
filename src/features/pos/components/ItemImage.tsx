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

export default ItemImage;
