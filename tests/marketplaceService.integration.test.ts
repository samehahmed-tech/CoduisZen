import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db } from '../server/db';
import { branches, deliveryPlatforms, orderItems, orders } from '../src/db/schema';
import { marketplaceService, type MarketplaceOrder } from '../server/services/marketplaceService';

const externalNumber = `TEST-MARKETPLACE-${Date.now()}`;
const orderId = `ext-talabat-${externalNumber}`;
const platformId = `test-platform-${Date.now()}`;
let branchId = '';

const payload = (overrides: Partial<MarketplaceOrder> = {}): MarketplaceOrder => ({
    orderNumber: externalNumber,
    provider: 'TALABAT',
    isPaid: false,
    total: 125,
    customer: { name: 'Marketplace Guest', phone: '01000000000', address: 'Cairo' },
    items: [{ id: 'external-item-1', name: 'Burger', price: 100, quantity: 1 }, { id: 'external-item-2', name: 'Fries', price: 25, quantity: 1 }],
    ...overrides,
});

describe('marketplace order ingestion', () => {
    beforeAll(async () => {
        const [branch] = await db.select({ id: branches.id }).top(1).from(branches);
        if (!branch) throw new Error('MARKETPLACE_TEST_BRANCH_MISSING');
        branchId = branch.id;
        await db.execute(sql`IF COL_LENGTH('delivery_platforms', 'api_key') IS NULL ALTER TABLE delivery_platforms ADD api_key nvarchar(500) NULL`);
        await db.insert(deliveryPlatforms).values({ id: platformId, name: 'TALABAT', isActive: true, applyFeesToMenuPrice: false });
    });

    beforeEach(async () => {
        await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
        await db.delete(orders).where(eq(orders.id, orderId));
    });

    afterAll(async () => {
        await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
        await db.delete(orders).where(eq(orders.id, orderId));
        await db.delete(deliveryPlatforms).where(eq(deliveryPlatforms.id, platformId));
    });

    it('replays the same external order without creating a duplicate', async () => {
        const first = await marketplaceService.ingestOrder(branchId, payload());
        const replay = await marketplaceService.ingestOrder(branchId, payload());
        const saved = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId));
        const savedItems = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, orderId));

        expect(first).toEqual({ success: true, orderId, replayed: false });
        expect(replay).toEqual({ success: true, orderId, replayed: true });
        expect(saved).toHaveLength(1);
        expect(savedItems).toHaveLength(2);
    });

    it('rejects a changed payload for the same external order number', async () => {
        await expect(marketplaceService.ingestOrder(branchId, payload())).resolves.toMatchObject({ success: true });
        await expect(marketplaceService.ingestOrder(branchId, payload({ total: 999 }))).resolves.toEqual({
            success: false,
            error: 'MARKETPLACE_ORDER_PAYLOAD_CONFLICT',
        });
    });
});
