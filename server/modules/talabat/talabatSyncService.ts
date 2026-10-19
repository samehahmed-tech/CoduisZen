import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db';
import { menuItems, orderItems, orders } from '../../../src/db/schema';
import { getTalabatConfigRaw } from './talabatConfig';
import { buildPutOrderBody, getTalabatToken, TalabatRateLimiter, talabatPutOrder } from './talabatClient';
import logger from '../../utils/logger';

const log = logger.child({ service: 'talabat-sync' });
const limiter = new TalabatRateLimiter(60);

/** Internal -> Talabat status per transport. Null = nothing to send (rider-owned step). */
export const mapInternalToTalabat = (
    internalStatus: string,
    transport: 'LOGISTICS_DELIVERY' | 'VENDOR_DELIVERY',
): 'READY_FOR_PICKUP' | 'DISPATCHED' | 'CANCELLED' | null => {
    const s = String(internalStatus || '').toUpperCase();
    if (s === 'CANCELLED') return 'CANCELLED';
    if (transport === 'VENDOR_DELIVERY') {
        if (s === 'READY' || s === 'OUT_FOR_DELIVERY' || s === 'DELIVERED') return 'DISPATCHED';
        return null;
    }
    // Platform delivery: we only declare READY_FOR_PICKUP; DISPATCHED comes from rider.
    if (s === 'READY') return 'READY_FOR_PICKUP';
    return null;
};

/**
 * Push internal status to Talabat (fire-and-forget from lifecycle hooks).
 * Returns skipped reason instead of throwing for non-Talabat orders.
 */
export const syncTalabatStatus = async (
    internalOrderId: string,
    nextStatus: string,
    opts?: { cancellationReason?: string },
): Promise<{ synced: boolean; reason?: string; talabatStatus?: string }> => {
    const [order] = await db.select().from(orders).where(eq(orders.id, internalOrderId));
    if (!order) return { synced: false, reason: 'ORDER_NOT_FOUND' };
    if (String((order as any).deliverySource || '').toLowerCase() !== 'talabat') return { synced: false, reason: 'NOT_TALABAT' };
    const talabatOrderId = String((order as any).platformOrderId || '').trim();
    if (!talabatOrderId) return { synced: false, reason: 'MISSING_TALABAT_ORDER_ID' };
    const config = await getTalabatConfigRaw();
    if (!config.chainId || !config.clientId || !config.clientSecret) return { synced: false, reason: 'TALABAT_NOT_CONFIGURED' };
    const talabatStatus = mapInternalToTalabat(nextStatus, config.transport || 'LOGISTICS_DELIVERY');
    if (!talabatStatus) return { synced: false, reason: 'NO_TALABAT_STEP' };
    if (!limiter.tryAcquire(Date.now())) return { synced: false, reason: 'RATE_LIMITED' };

    const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, internalOrderId));
    const menuIds = Array.from(new Set(lines.map((l: any) => l.menuItemId).filter(Boolean))) as string[];
    const skuByMenu = new Map<string, string>();
    if (menuIds.length > 0) {
        const menus = await db.select({ id: menuItems.id, sku: menuItems.sku }).from(menuItems).where(inArray(menuItems.id, menuIds));
        for (const m of menus) if (m.sku) skuByMenu.set(m.id, String(m.sku));
    }
    const token = await getTalabatToken({ clientId: config.clientId, clientSecret: String(config.clientSecret), tokenUrl: config.tokenUrl });
    const body = buildPutOrderBody({
        orderId: talabatOrderId,
        status: talabatStatus,
        items: talabatStatus === 'CANCELLED' ? undefined : lines.map((l: any) => ({
            sku: skuByMenu.get(l.menuItemId) || String(l.name || '').trim(),
            pricingType: 'UNIT',
            quantity: Number(l.quantity || 1),
            unitPrice: Number(l.price || 0),
            status: Number(l.quantity || 0) > 0 ? 'IN_CART' as const : 'NOT_FOUND' as const,
        })),
        cancellationReason: opts?.cancellationReason,
    });
    const res = await talabatPutOrder({
        baseUrl: config.baseUrl,
        chainId: config.chainId,
        orderId: talabatOrderId,
        token,
        body,
    });
    if (!res.ok) {
        log.warn({ internalOrderId, talabatStatus, status: res.status }, 'Talabat PUT failed');
        return { synced: false, reason: `TALABAT_PUT_${res.status}`, talabatStatus };
    }
    return { synced: true, talabatStatus };
};
