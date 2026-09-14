import type { DeliveryPlatform } from '../types';

export interface PlatformMarkup {
    platformId: string;
    pct: number;
    fixed: number;
}

const round2 = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

/**
 * Silent platform pricing (e.g. Talabat): the customer-facing unit price
 * INCLUDES the platform markup. The markup never appears as a receipt line —
 * it is baked into the item price, while basePrice keeps the original menu
 * price for margin/reporting audit.
 *
 * Formula mirrors the server (orderController.createOrder) exactly:
 *   inclusive = round2(base * (1 + pct/100) + fixed)
 * Modifiers are intentionally NOT marked up (server parity).
 */
export const applyPlatformMarkup = (basePrice: number, pct: number, fixed: number): number => {
    const base = Number(basePrice || 0);
    const p = Number(pct || 0);
    const f = Number(fixed || 0);
    if (!(p > 0) && !(f > 0)) return round2(base);
    return round2(base * (1 + p / 100) + f);
};

export const platformMarkupAmount = (basePrice: number, pct: number, fixed: number): number =>
    Math.max(0, round2(applyPlatformMarkup(basePrice, pct, fixed) - Number(basePrice || 0)));

/** Match a deliverySource key (platform id or name) to an active markup config. */
export const matchPlatformMarkup = (
    platforms: DeliveryPlatform[] | undefined | null,
    deliverySource: string | undefined | null,
): PlatformMarkup | null => {
    const key = String(deliverySource || '').trim().toLowerCase();
    if (!key || key === 'restaurant') return null;
    const platform = (platforms || []).find((p) => {
        if (!p || p.isActive === false || !p.applyFeesToMenuPrice) return false;
        return String(p.id || '').trim().toLowerCase() === key
            || String(p.name || '').trim().toLowerCase() === key;
    });
    if (!platform) return null;
    const pct = Number(platform.priceMarkupPercentage || 0);
    const fixed = Number(platform.priceMarkupFixed || 0);
    if (!(pct > 0) && !(fixed > 0)) return null;
    return { platformId: String(platform.id), pct, fixed };
};
