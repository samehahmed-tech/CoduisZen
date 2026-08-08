import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import {
    createStockCount,
    freezeStockCount,
} from '../server/controllers/inventoryCountController';
import { db } from '../server/db';
import {
    branches,
    inventoryItems,
    inventoryStock,
    stockCountLines,
    stockCounts,
    warehouses,
} from '../src/db/schema';

const FIXTURES = {
    branchId: 'test-count-scope-branch',
    warehouseIds: ['test-count-scope-main', 'test-count-scope-secondary'],
    itemIds: ['test-count-scope-main-only', 'test-count-scope-other-only', 'test-count-scope-shared'],
};

let createdCountId: string | undefined;

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
    if (createdCountId) {
        await db.delete(stockCountLines).where(eq(stockCountLines.countId, createdCountId));
        await db.delete(stockCounts).where(eq(stockCounts.id, createdCountId));
        createdCountId = undefined;
    }
    await db.delete(inventoryStock).where(inArray(inventoryStock.itemId, FIXTURES.itemIds));
    await db.delete(inventoryItems).where(inArray(inventoryItems.id, FIXTURES.itemIds));
    await db.delete(warehouses).where(inArray(warehouses.id, FIXTURES.warehouseIds));
    await db.delete(branches).where(eq(branches.id, FIXTURES.branchId));
};

describe('warehouse-specific stock count scope', () => {
    beforeEach(async () => {
        await cleanup();
        await db.insert(branches).values({
            id: FIXTURES.branchId,
            name: 'Count Scope Branch',
            isActive: true,
        });
        await db.insert(warehouses).values(FIXTURES.warehouseIds.map((id, index) => ({
            id,
            branchId: FIXTURES.branchId,
            name: index === 0 ? 'Main Count Warehouse' : 'Secondary Count Warehouse',
            type: index === 0 ? 'MAIN' : 'SUB',
            isActive: true,
        })));
        await db.insert(inventoryItems).values(FIXTURES.itemIds.map((id, index) => ({
            id,
            name: `Count Scope Item ${index + 1}`,
            unit: index === 2 ? 'kg' : 'piece',
            costPrice: index + 1,
            isActive: true,
        })));
        await db.insert(inventoryStock).values([
            { itemId: FIXTURES.itemIds[0], warehouseId: FIXTURES.warehouseIds[0], quantity: 11 },
            { itemId: FIXTURES.itemIds[1], warehouseId: FIXTURES.warehouseIds[1], quantity: 22 },
            { itemId: FIXTURES.itemIds[2], warehouseId: FIXTURES.warehouseIds[0], quantity: 3 },
            { itemId: FIXTURES.itemIds[2], warehouseId: FIXTURES.warehouseIds[1], quantity: 7 },
        ]);
    });

    afterEach(cleanup);

    it('freezes only items assigned to the selected warehouse with that warehouse quantities', async () => {
        const created = createResponse();
        await createStockCount({
            body: {
                branchId: FIXTURES.branchId,
                warehouseId: FIXTURES.warehouseIds[0],
                type: 'DAILY',
                countDate: '2026-07-31',
            },
        } as any, created);
        expect(created.statusCode).toBe(201);
        createdCountId = created.body.id;

        const frozen = createResponse();
        await freezeStockCount({
            params: { id: createdCountId },
        } as any, frozen);

        expect(frozen.statusCode).toBe(200);
        expect(frozen.body).toMatchObject({
            warehouseId: FIXTURES.warehouseIds[0],
            status: 'FROZEN',
        });
        expect(frozen.body.items.map((item: any) => ({
            itemId: item.itemId,
            expectedQty: item.expectedQty,
            unit: item.unit,
        })).sort((a: any, b: any) => a.itemId.localeCompare(b.itemId))).toEqual([
            { itemId: FIXTURES.itemIds[0], expectedQty: 11, unit: 'piece' },
            { itemId: FIXTURES.itemIds[2], expectedQty: 3, unit: 'kg' },
        ]);
    });
});
