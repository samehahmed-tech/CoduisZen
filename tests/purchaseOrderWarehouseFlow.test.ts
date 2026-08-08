import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

import { createPO } from '../server/controllers/purchaseOrderController';
import { createGRN } from '../server/controllers/procurementController';
import { db } from '../server/db';
import {
    branches,
    goodsReceiptNotes,
    grnItems,
    idempotencyKeys,
    inventoryBatches,
    inventoryItems,
    inventoryStock,
    purchaseOrderItems,
    purchaseOrders,
    stockMovements,
    suppliers,
    warehouses,
} from '../src/db/schema';

const FIXTURES = {
    branchId: 'test-po-flow-branch',
    supplierId: 'test-po-flow-supplier',
    targetWarehouseId: 'test-po-flow-target',
    otherWarehouseId: 'test-po-flow-other',
    poId: 'test-po-flow',
    itemIds: ['test-po-flow-item-a', 'test-po-flow-item-b'],
    mismatchReference: 'test-po-flow-wrong-warehouse',
    receiptReference: 'test-po-flow-receipt',
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
        inArray(idempotencyKeys.key, [FIXTURES.mismatchReference, FIXTURES.receiptReference]),
        eq(idempotencyKeys.scope, 'PURCHASE_ORDER_GRN'),
    ));
    const receipts = await db.select({ id: goodsReceiptNotes.id })
        .from(goodsReceiptNotes)
        .where(eq(goodsReceiptNotes.poId, FIXTURES.poId));
    if (receipts.length) {
        await db.delete(grnItems).where(inArray(grnItems.grnId, receipts.map(receipt => receipt.id)));
    }
    await db.delete(goodsReceiptNotes).where(eq(goodsReceiptNotes.poId, FIXTURES.poId));
    await db.delete(stockMovements).where(inArray(stockMovements.itemId, FIXTURES.itemIds));
    await db.delete(inventoryBatches).where(inArray(inventoryBatches.itemId, FIXTURES.itemIds));
    await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.poId, FIXTURES.poId));
    await db.delete(purchaseOrders).where(eq(purchaseOrders.id, FIXTURES.poId));
    await db.delete(inventoryStock).where(inArray(inventoryStock.itemId, FIXTURES.itemIds));
    await db.delete(inventoryItems).where(inArray(inventoryItems.id, FIXTURES.itemIds));
    await db.delete(warehouses).where(inArray(warehouses.id, [
        FIXTURES.targetWarehouseId,
        FIXTURES.otherWarehouseId,
    ]));
    await db.delete(suppliers).where(eq(suppliers.id, FIXTURES.supplierId));
    await db.delete(branches).where(eq(branches.id, FIXTURES.branchId));
};

describe('multi-item purchase order warehouse flow', () => {
    beforeEach(async () => {
        await cleanup();
        await db.insert(branches).values({
            id: FIXTURES.branchId,
            name: 'PO Flow Branch',
            isActive: true,
        });
        await db.insert(suppliers).values({
            id: FIXTURES.supplierId,
            name: 'PO Flow Supplier',
            isActive: true,
        });
        await db.insert(warehouses).values([
            {
                id: FIXTURES.targetWarehouseId,
                branchId: FIXTURES.branchId,
                name: 'PO Target Warehouse',
                type: 'MAIN',
                isActive: true,
            },
            {
                id: FIXTURES.otherWarehouseId,
                branchId: FIXTURES.branchId,
                name: 'PO Other Warehouse',
                type: 'SUB',
                isActive: true,
            },
        ]);
        await db.insert(inventoryItems).values(FIXTURES.itemIds.map((id, index) => ({
            id,
            name: `PO Flow Item ${index + 1}`,
            unit: index === 0 ? 'kg' : 'piece',
            costPrice: 1,
            isActive: true,
        })));
        await db.insert(inventoryStock).values(FIXTURES.itemIds.flatMap(itemId => [
            { itemId, warehouseId: FIXTURES.targetWarehouseId, quantity: 0 },
            { itemId, warehouseId: FIXTURES.otherWarehouseId, quantity: 0 },
        ]));
    });

    afterEach(cleanup);

    it('keeps supplier and target warehouse, then receives all lines only into that warehouse', async () => {
        const createResponseValue = createResponse();
        await createPO({
            body: {
                id: FIXTURES.poId,
                supplierId: FIXTURES.supplierId,
                branchId: FIXTURES.branchId,
                targetWarehouseId: FIXTURES.targetWarehouseId,
                items: [
                    { itemId: FIXTURES.itemIds[0], orderedQty: 5, unitPrice: 12 },
                    { itemId: FIXTURES.itemIds[1], orderedQty: 8, unitPrice: 3 },
                ],
            },
        } as any, createResponseValue);
        expect(createResponseValue.statusCode).toBe(201);

        await db.update(purchaseOrders)
            .set({ status: 'SENT' })
            .where(eq(purchaseOrders.id, FIXTURES.poId));

        const [savedPO] = await db.select().from(purchaseOrders)
            .where(eq(purchaseOrders.id, FIXTURES.poId));
        const lines = await db.select().from(purchaseOrderItems)
            .where(eq(purchaseOrderItems.poId, FIXTURES.poId));
        expect(savedPO).toMatchObject({
            supplierId: FIXTURES.supplierId,
            targetWarehouseId: FIXTURES.targetWarehouseId,
        });
        expect(lines).toHaveLength(2);

        const mismatch = createResponse();
        await createGRN({
            body: {
                poId: FIXTURES.poId,
                warehouseId: FIXTURES.otherWarehouseId,
                referenceNumber: FIXTURES.mismatchReference,
                items: lines.map(line => ({
                    itemId: line.itemId,
                    poItemId: line.id,
                    receivedQty: Number(line.orderedQty),
                })),
            },
        } as any, mismatch);
        expect(mismatch).toMatchObject({
            statusCode: 500,
            body: { error: 'PO_TARGET_WAREHOUSE_MISMATCH' },
        });

        const receipt = createResponse();
        await createGRN({
            body: {
                poId: FIXTURES.poId,
                warehouseId: FIXTURES.targetWarehouseId,
                referenceNumber: FIXTURES.receiptReference,
                items: lines.map(line => ({
                    itemId: line.itemId,
                    poItemId: line.id,
                    receivedQty: Number(line.orderedQty),
                })),
            },
        } as any, receipt);
        expect(receipt.statusCode).toBe(201);

        const targetStock = await db.select().from(inventoryStock)
            .where(eq(inventoryStock.warehouseId, FIXTURES.targetWarehouseId));
        const otherStock = await db.select().from(inventoryStock)
            .where(and(
                eq(inventoryStock.warehouseId, FIXTURES.otherWarehouseId),
                inArray(inventoryStock.itemId, FIXTURES.itemIds),
            ));
        const batches = await db.select().from(inventoryBatches)
            .where(inArray(inventoryBatches.itemId, FIXTURES.itemIds));
        const [receivedPO] = await db.select().from(purchaseOrders)
            .where(eq(purchaseOrders.id, FIXTURES.poId));

        expect(targetStock.filter(stock => FIXTURES.itemIds.includes(stock.itemId))
            .map(stock => Number(stock.quantity)).sort((a, b) => a - b)).toEqual([5, 8]);
        expect(otherStock.map(stock => Number(stock.quantity))).toEqual([0, 0]);
        expect(batches).toHaveLength(2);
        expect(batches.every(batch => batch.supplierId === FIXTURES.supplierId)).toBe(true);
        expect(receivedPO.status).toBe('RECEIVED');
    });
});
