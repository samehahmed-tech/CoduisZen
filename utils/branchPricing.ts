/**
 * Client mirror of server/services/pricingService.ts (same resolution order):
 *   platform fixed override > branch+channel > branch flat > base price.
 * Channels: DINE_IN | TAKEAWAY | DELIVERY (call-center orders are DELIVERY).
 * Warn-only domain: never throws, falls back to base price.
 */

export type PriceChannel = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';

export const normalizeChannel = (value: unknown): PriceChannel | undefined => {
    const v = String(value || '').trim().toUpperCase();
    if (v === 'DINE_IN' || v === 'DINEIN' || v === 'DINE-IN') return 'DINE_IN';
    if (v === 'TAKEAWAY' || v === 'TAKE_AWAY' || v === 'TAKE-AWAY' || v === 'PICKUP') return 'TAKEAWAY';
    if (v === 'DELIVERY' || v === 'CALL_CENTER' || v === 'CALLCENTER') return 'DELIVERY';
    return undefined;
};

const parsePriceList = (raw: unknown): any[] => {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string' && raw.trim()) {
        try {
            const parsed = JSON.parse(raw.trim());
            if (Array.isArray(parsed)) return parsed;
        } catch { return []; }
    }
    return [];
};

/** Branch/channel unit price, or base price when no entry matches. */
export const resolveBranchPrice = (item: any, branchId: string | undefined | null, channel?: PriceChannel | string): number => {
    const base = Number(item?.price || 0);
    const branchKey = String(branchId || '').trim();
    if (!branchKey) return base;
    const raw = item?.branchPricing ?? item?.branch_pricing;
    const entries = parsePriceList(raw).filter(
        (e) => String(e?.branchId ?? e?.branch_id ?? '').trim() === branchKey,
    );
    const want = typeof channel === 'string' ? normalizeChannel(channel) : channel;
    if (want) {
        const exact = entries.find((e) => normalizeChannel(e?.channel) === want);
        const exactPrice = Number(exact?.price);
        if (Number.isFinite(exactPrice) && exactPrice > 0) return exactPrice;
    }
    const flat = entries.find((e) => !normalizeChannel(e?.channel));
    const flatPrice = Number(flat?.price);
    return Number.isFinite(flatPrice) && flatPrice > 0 ? flatPrice : base;
};

/** Where the quoted price came from (same labels as the server audit). */
export const resolvePriceSource = (item: any, branchId: string | undefined | null, channel?: PriceChannel | string): string => {
    const branchKey = String(branchId || '').trim();
    if (branchKey) {
        const raw = item?.branchPricing ?? item?.branch_pricing;
        const entries = parsePriceList(raw).filter(
            (e) => String(e?.branchId ?? e?.branch_id ?? '').trim() === branchKey,
        );
        const want = typeof channel === 'string' ? normalizeChannel(channel) : channel;
        if (want && entries.some((e) => normalizeChannel(e?.channel) === want && Number(e?.price) > 0)) {
            return `BRANCH:${want}`;
        }
        if (entries.some((e) => !normalizeChannel(e?.channel) && Number(e?.price) > 0)) return 'BRANCH:ALL';
    }
    return 'BASE';
};

/** Re-price a cart/menu line for the target branch+channel, keeping the rest intact. */
export const withBranchPrice = <T extends Record<string, any>>(
    item: T, branchId: string | undefined | null, channel?: PriceChannel | string,
): T => ({
    ...item,
    price: resolveBranchPrice(item, branchId, channel),
});
