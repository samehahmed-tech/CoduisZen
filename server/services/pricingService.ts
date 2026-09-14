/**
 * Unified pricing model — Branch × Channel × Platform.
 *
 * Single source of truth for "which unit price applies", mirrored by the
 * client helper (utils/branchPricing.ts). Resolution order:
 *   1. Platform fixed override (item.platformPricing[platformId])
 *   2. Branch + channel entry (branchPricing[{branchId, channel}])
 *   3. Branch flat entry (branchPricing[{branchId}], no channel = ALL)
 *   4. Base menu price
 * Then: platform % markup (deliveryPlatforms config) applies on top.
 * Modifiers are always added after (unchanged).
 *
 * Channels: DINE_IN | TAKEAWAY | DELIVERY (call-center orders are DELIVERY).
 * Warn-only domain: helpers never throw, fall back to base price.
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

/**
 * Resolve the branch/channel unit price.
 * Returns { price, source } where source is an audit label like
 * 'BRANCH:DELIVERY', 'BRANCH:ALL', 'BASE'. 0/empty = fall back to base.
 */
export const resolveBranchPrice = (
    branchPricing: unknown,
    branchId: string | undefined | null,
    channel?: PriceChannel | string | undefined,
): { price: number; source: string } => {
    const entries = parsePriceList(branchPricing);
    const branchKey = String(branchId || '').trim();
    if (branchKey) {
        const forBranch = entries.filter(
            (e) => String(e?.branchId ?? e?.branch_id ?? '').trim() === branchKey,
        );
        const want = typeof channel === 'string' ? normalizeChannel(channel) : channel;
        if (want) {
            const exact = forBranch.find((e) => normalizeChannel(e?.channel) === want);
            const exactPrice = Number(exact?.price);
            if (Number.isFinite(exactPrice) && exactPrice > 0) {
                return { price: exactPrice, source: `BRANCH:${want}` };
            }
        }
        const flat = forBranch.find((e) => !normalizeChannel(e?.channel));
        const flatPrice = Number(flat?.price);
        if (Number.isFinite(flatPrice) && flatPrice > 0) {
            return { price: flatPrice, source: 'BRANCH:ALL' };
        }
    }
    return { price: 0, source: 'BASE' };
};

/** Platform fixed override for an item (item.platformPricing[{platformId, price}]). */
export const resolvePlatformOverride = (platformPricing: unknown, platformId: string | undefined | null): number => {
    const key = String(platformId || '').trim().toLowerCase();
    if (!key) return 0;
    const entries = parsePriceList(platformPricing);
    const match = entries.find(
        (e) => String(e?.platformId ?? e?.platform_id ?? e?.id ?? '').trim().toLowerCase() === key,
    );
    const price = Number(match?.price);
    return Number.isFinite(price) && price > 0 ? price : 0;
};

export const applyPlatformMarkup = (base: number, pct: number, fixed: number): number => {
    const p = Number(base || 0) * (1 + Number(pct || 0) / 100) + Number(fixed || 0);
    return Number(p.toFixed(2));
};

/**
 * Quote-drift comparison: did the menu price move between the client's
 * quote and the server's authoritative recalculation? Warn-only — the sale
 * is never blocked, the drift is attached as a warning for transparency.
 */
export const QUOTE_DRIFT_TOLERANCE = 1;

export const detectQuoteDrift = (
    client: { subtotal?: number; total?: number },
    server: { subtotal: number; total: number },
): { drifted: boolean; clientSubtotal: number; serverSubtotal: number; clientTotal: number; serverTotal: number } => {
    const clientSubtotal = Number(client?.subtotal || 0);
    const serverSubtotal = Number(server?.subtotal || 0);
    const clientTotal = Number(client?.total || 0);
    const serverTotal = Number(server?.total || 0);
    const drifted =
        Math.abs(clientSubtotal - serverSubtotal) > QUOTE_DRIFT_TOLERANCE ||
        Math.abs(clientTotal - serverTotal) > QUOTE_DRIFT_TOLERANCE;
    return { drifted, clientSubtotal, serverSubtotal, clientTotal, serverTotal };
};
