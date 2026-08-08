import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';

import { receiveStockDirect } from '../server/controllers/inventoryController';
import { db } from '../server/db';
import {
    branches,
    idempotencyKeys,
    inventoryBatches,
    inventoryItems,
    inventoryStock,
    stockMovements,
    warehouses,
} from '../src/db/schema';

const FIXTURES = {
    branchId: 'test-direct-receipt-branch',
    warehouseId: 'test-direct-receipt-warehouse',
    itemId: 'test-direct-receipt-item',
    referenceId: 'test-direct-receipt',
};

const createResponse = () => {
    const response: any = {
        statusCode: 200,
        body: null,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(body: unknown) {
            this.body = body;
            return this;
        },
    };
    return response;
};

const cleanup = async () => {
    await db.delete(idempotencyKeys).where(and(
        eq(idempotencyKeys.key, FIXTURES.referenceId),
        eq(idempotencyKeys.scope, 'DIRECT_STOCK_RECEIPT'),
    ));
    await db.delete(stockMovements).where(eq(stockMovements.referenceId, FIXTURES.referenceId));
    await db.delete(inventoryBatches).where(and(
        eq(inventoryBatches.itemId, FIXTURES.itemId),
        eq(inventoryBatches.warehouseId, FIXTURES.warehouseId),
    ));
    await db.delete(inventoryStock).where(and(
        eq(inventoryStock.itemId, FIXTURES.itemId),
        eq(inventoryStock.warehouseId, FIXTURES.warehouseId),
    ));
    await db.delete(inventoryItems).where(eq(inventoryItems.id, FIXTURES.itemId));
    await db.delete(warehouses).where(eq(warehouses.id, FIXTURES.warehouseId));
};

const receive = async () => {
    const response = createResponse();
    await receiveStockDirect({
        body: {
            warehouse_id: FIXTURES.warehouseId,
            reference_id: FIXTURES.referenceId,
            items: [{ item_id: FIXTURES.itemId, quantity: 5, unit_cost: 8 }],
        },
    } as any, response);
    return response;
};

describe('direct stock receipt costing', () => {
    beforeEach(async () => {
        await cleanup();
        await db.insert(branches).values({ id: FIXTURES.branchId, name: 'Direct Receipt Branch', isActive: true }).onConflictDoNothing();
        await db.insert(warehouses).values({
            id: FIXTURES.warehouseId,
            branchId: FIXTURES.branchId,
            name: 'Direct Receipt Warehouse',
            type: 'MAIN',
            isActive: true,
        });
        await db.insert(inventoryItems).values({
            id: FIXTURES.itemId,
            name: 'Direct Receipt Item',
            unit: 'piece',
            costPrice: 2,
            purchasePrice: 2,
            isActive: true,
        });
        await db.insert(inventoryStock).values({
            itemId: FIXTURES.itemId,
            warehouseId: FIXTURES.warehouseId,
            quantity: 10,
        });
    });

    afterEach(cleanup);

    it('persists purchase cost, updates moving-average valuation, and replays safely', async () => {
        const first = await receive();
        expect(first.statusCode).toBe(200);

        const replay = await receive();
        expect(replay).toMatchObject({ statusCode: 200, body: { idempotentReplay: true } });

        const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, FIXTURES.itemId));
        const [stock] = await db.select().from(inventoryStock).where(and(
            eq(inventoryStock.itemId, FIXTURES.itemId),
            eq(inventoryStock.warehouseId, FIXTURES.warehouseId),
        ));
        const movements = await db.select().from(stockMovements).where(eq(stockMovements.referenceId, FIXTURES.referenceId));
        const batches = await db.select().from(inventoryBatches).where(and(
            eq(inventoryBatches.itemId, FIXTURES.itemId),
            eq(inventoryBatches.warehouseId, FIXTURES.warehouseId),
        ));

        expect(Number(stock.quantity)).toBe(15);
        expect(Number(item.purchasePrice)).toBe(8);
        expect(Number(item.costPrice)).toBeCloseTo(4);
        expect(Number(stock.quantity) * Number(item.costPrice)).toBeCloseTo(60);
        expect(movements).toHaveLength(1);
        expect(Number(movements[0].unitCost)).toBe(8);
        expect(batches).toHaveLength(1);
        expect(Number(batches[0].unitCost)).toBe(8);
    });
});
