import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';

import { createGRN } from '../server/controllers/procurementController';
import { db } from '../server/db';
import {
    branches,
    goodsReceiptNotes,
    grnItems,
    inventoryBatches,
    inventoryItems,
    inventoryStock,
    idempotencyKeys,
    purchaseOrderItems,
    purchaseOrders,
    stockMovements,
    suppliers,
    warehouses,
} from '../src/db/schema';

const FIXTURES = {
    branchId: 'test-po-partial-branch',
    supplierId: 'test-po-partial-supplier',
    warehouseId: 'test-po-partial-warehouse',
    itemId: 'test-po-partial-item',
    poId: 'test-po-partial',
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
        eq(idempotencyKeys.key, 'test-po-receipt-1'),
        eq(idempotencyKeys.scope, 'PURCHASE_ORDER_GRN'),
    ));
    await db.delete(idempotencyKeys).where(and(
        eq(idempotencyKeys.key, 'test-po-receipt-2'),
        eq(idempotencyKeys.scope, 'PURCHASE_ORDER_GRN'),
    ));
    const receipts = await db.select({ id: goodsReceiptNotes.id })
        .from(goodsReceiptNotes)
        .where(eq(goodsReceiptNotes.poId, FIXTURES.poId));
    for (const receipt of receipts) {
        await db.delete(grnItems).where(eq(grnItems.grnId, receipt.id));
    }
    await db.delete(stockMovements).where(eq(stockMovements.itemId, FIXTURES.itemId));
    await db.delete(inventoryBatches).where(and(
        eq(inventoryBatches.itemId, FIXTURES.itemId),
        eq(inventoryBatches.warehouseId, FIXTURES.warehouseId),
    ));
    await db.delete(goodsReceiptNotes).where(eq(goodsReceiptNotes.poId, FIXTURES.poId));
    await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.poId, FIXTURES.poId));
    await db.delete(purchaseOrders).where(eq(purchaseOrders.id, FIXTURES.poId));
    await db.delete(inventoryStock).where(and(
        eq(inventoryStock.itemId, FIXTURES.itemId),
        eq(inventoryStock.warehouseId, FIXTURES.warehouseId),
    ));
    await db.delete(inventoryItems).where(eq(inventoryItems.id, FIXTURES.itemId));
    await db.delete(warehouses).where(eq(warehouses.id, FIXTURES.warehouseId));
    await db.delete(suppliers).where(eq(suppliers.id, FIXTURES.supplierId));
    await db.delete(branches).where(eq(branches.id, FIXTURES.branchId));
};

const receive = async (referenceNumber: string, receivedQty: number) => {
    const [line] = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.poId, FIXTURES.poId));
    const response = createResponse();
    await createGRN({
        body: {
            poId: FIXTURES.poId,
            supplierId: FIXTURES.supplierId,
            branchId: FIXTURES.branchId,
            warehouseId: FIXTURES.warehouseId,
            referenceNumber,
            items: [{
                itemId: FIXTURES.itemId,
                poItemId: line.id,
                receivedQty,
                unitPrice: 999,
                batchNumber: `${referenceNumber}-batch`,
            }],
        },
    } as any, response);
    return response;
};

describe('partial and idempotent PO receiving', () => {
    beforeEach(async () => {
        await cleanup();
        await db.insert(branches).values({ id: FIXTURES.branchId, name: 'PO Partial Branch', isActive: true });
        await db.insert(suppliers).values({ id: FIXTURES.supplierId, name: 'PO Partial Supplier', isActive: true });
        await db.insert(warehouses).values({
            id: FIXTURES.warehouseId,
            branchId: FIXTURES.branchId,
            name: 'PO Partial Warehouse',
            type: 'MAIN',
            isActive: true,
        });
        await db.insert(inventoryItems).values({
            id: FIXTURES.itemId,
            name: 'PO Partial Item',
            unit: 'piece',
            costPrice: 2,
            isActive: true,
        });
        await db.insert(inventoryStock).values({
            itemId: FIXTURES.itemId,
            warehouseId: FIXTURES.warehouseId,
            quantity: 0,
        });
        await db.insert(purchaseOrders).values({
            id: FIXTURES.poId,
            supplierId: FIXTURES.supplierId,
            branchId: FIXTURES.branchId,
            status: 'SENT',
            subtotal: 50,
        });
        await db.insert(purchaseOrderItems).values({
            poId: FIXTURES.poId,
            itemId: FIXTURES.itemId,
            orderedQty: 10,
            receivedQty: 0,
            unitPrice: 5,
        });
    });

    afterEach(cleanup);

    it('supports partial receipts and replays the same reference without duplicating stock', async () => {
        const first = await receive('test-po-receipt-1', 4);
        expect(first.statusCode).toBe(201);

        const replay = await receive('test-po-receipt-1', 4);
        expect(replay).toMatchObject({ statusCode: 200, body: { idempotentReplay: true } });

        let [line] = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.poId, FIXTURES.poId));
        let [stock] = await db.select().from(inventoryStock).where(and(
            eq(inventoryStock.itemId, FIXTURES.itemId),
            eq(inventoryStock.warehouseId, FIXTURES.warehouseId),
        ));
        let [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, FIXTURES.poId));
        expect(Number(line.receivedQty)).toBe(4);
        expect(Number(stock.quantity)).toBe(4);
        expect(po.status).toBe('PARTIAL');

        const second = await receive('test-po-receipt-2', 6);
        expect(second.statusCode).toBe(201);

        [line] = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.poId, FIXTURES.poId));
        [stock] = await db.select().from(inventoryStock).where(and(
            eq(inventoryStock.itemId, FIXTURES.itemId),
            eq(inventoryStock.warehouseId, FIXTURES.warehouseId),
        ));
        [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, FIXTURES.poId));
        const receipts = await db.select().from(goodsReceiptNotes).where(eq(goodsReceiptNotes.poId, FIXTURES.poId));
        const movements = await db.select().from(stockMovements).where(eq(stockMovements.itemId, FIXTURES.itemId));

        expect(Number(line.receivedQty)).toBe(10);
        expect(Number(stock.quantity)).toBe(10);
        expect(po.status).toBe('RECEIVED');
        expect(receipts).toHaveLength(2);
        expect(movements).toHaveLength(2);
        expect(movements.map(movement => Number(movement.unitCost))).toEqual([5, 5]);
    });

    it('allows only one concurrent receipt for the same reference', async () => {
        const results = await Promise.all([
            receive('test-po-receipt-1', 4),
            receive('test-po-receipt-1', 4),
        ]);

        expect(results.some(result => result.statusCode === 201)).toBe(true);
        expect(results.every(result => [200, 201, 409].includes(result.statusCode))).toBe(true);

        const [line] = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.poId, FIXTURES.poId));
        const [stock] = await db.select().from(inventoryStock).where(and(
            eq(inventoryStock.itemId, FIXTURES.itemId),
            eq(inventoryStock.warehouseId, FIXTURES.warehouseId),
        ));
        const receipts = await db.select().from(goodsReceiptNotes).where(eq(goodsReceiptNotes.poId, FIXTURES.poId));
        const movements = await db.select().from(stockMovements).where(eq(stockMovements.itemId, FIXTURES.itemId));

        expect(Number(line.receivedQty)).toBe(4);
        expect(Number(stock.quantity)).toBe(4);
        expect(receipts).toHaveLength(1);
        expect(movements).toHaveLength(1);
    });
});
