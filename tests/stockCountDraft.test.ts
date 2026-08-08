import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';

import { postStockCount, submitCount } from '../server/controllers/inventoryCountController';
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
    branchId: 'test-count-draft-branch',
    warehouseId: 'test-count-draft-warehouse',
    itemId: 'test-count-draft-item',
    countId: 'test-count-draft',
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
    await db.execute(sql`DELETE FROM stock_count_lines WHERE count_id = ${FIXTURES.countId}`);
    await db.execute(sql`DELETE FROM stock_counts WHERE id = ${FIXTURES.countId}`);
    await db.execute(sql`DELETE FROM inventory_stock WHERE item_id = ${FIXTURES.itemId} AND warehouse_id = ${FIXTURES.warehouseId}`);
    await db.execute(sql`DELETE FROM inventory_items WHERE id = ${FIXTURES.itemId}`);
    await db.execute(sql`DELETE FROM warehouses WHERE id = ${FIXTURES.warehouseId}`);
    await db.execute(sql`DELETE FROM branches WHERE id = ${FIXTURES.branchId}`);
};

describe('stock count draft persistence', () => {
    beforeEach(async () => {
        await cleanup();

        await db.insert(branches).values({
            id: FIXTURES.branchId,
            name: 'Count Draft Branch',
            isActive: true,
        }).onConflictDoNothing();
        await db.insert(warehouses).values({
            id: FIXTURES.warehouseId,
            branchId: FIXTURES.branchId,
            name: 'Count Draft Warehouse',
            type: 'MAIN',
            isActive: true,
        }).onConflictDoNothing();
        await db.insert(inventoryItems).values({
            id: FIXTURES.itemId,
            name: 'Count Draft Item',
            unit: 'piece',
            isActive: true,
        }).onConflictDoNothing();
        await db.insert(inventoryStock).values({
            itemId: FIXTURES.itemId,
            warehouseId: FIXTURES.warehouseId,
            quantity: 10,
        });
        await db.insert(stockCounts).values({
            id: FIXTURES.countId,
            branchId: FIXTURES.branchId,
            warehouseId: FIXTURES.warehouseId,
            countDate: new Date('2026-07-27T00:00:00.000Z'),
            status: 'FROZEN',
            type: 'DAILY',
        });
        await db.insert(stockCountLines).values({
            countId: FIXTURES.countId,
            itemId: FIXTURES.itemId,
            expectedQty: 10,
            cost: 2,
        });
    });

    afterEach(cleanup);

    it('saves entered counts without posting stock or advancing to review', async () => {
        const response = createResponse();
        await submitCount({
            params: { id: FIXTURES.countId },
            body: {
                finalize: false,
                counts: [{ itemId: FIXTURES.itemId, countedQty: 7, notes: 'First aisle done' }],
            },
        } as any, response);

        expect(response).toMatchObject({
            statusCode: 200,
            body: { success: true, status: 'FROZEN' },
        });

        const [count] = await db.select().from(stockCounts).where(eq(stockCounts.id, FIXTURES.countId));
        const [line] = await db.select().from(stockCountLines).where(and(
            eq(stockCountLines.countId, FIXTURES.countId),
            eq(stockCountLines.itemId, FIXTURES.itemId),
        ));
        const [stock] = await db.select().from(inventoryStock).where(and(
            eq(inventoryStock.itemId, FIXTURES.itemId),
            eq(inventoryStock.warehouseId, FIXTURES.warehouseId),
        ));

        expect(count.status).toBe('FROZEN');
        expect(line).toMatchObject({ countedQty: 7, varianceQty: -3, notes: 'First aisle done' });
        expect(Number(stock.quantity)).toBe(10);
    });

    it('rejects posting while any count line is incomplete', async () => {
        await db.update(stockCounts)
            .set({ status: 'REVIEW' })
            .where(eq(stockCounts.id, FIXTURES.countId));

        const response = createResponse();
        await postStockCount({
            params: { id: FIXTURES.countId },
            body: { userId: 'test-user' },
        } as any, response);

        expect(response).toMatchObject({
            statusCode: 409,
            body: { error: 'COUNT_INCOMPLETE' },
        });

        const [count] = await db.select().from(stockCounts).where(eq(stockCounts.id, FIXTURES.countId));
        const [stock] = await db.select().from(inventoryStock).where(and(
            eq(inventoryStock.itemId, FIXTURES.itemId),
            eq(inventoryStock.warehouseId, FIXTURES.warehouseId),
        ));

        expect(count.status).toBe('REVIEW');
        expect(Number(stock.quantity)).toBe(10);
    });
});
