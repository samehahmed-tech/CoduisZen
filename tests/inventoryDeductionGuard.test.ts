import { beforeEach, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
    branches,
    inventoryBatches,
    inventoryItems,
    inventoryStock,
    menuItems,
    productionOrderItems,
    productionOrders,
    recipes,
    recipeIngredients,
    stockMovements,
    warehouses,
} from '../src/db/schema';
import { inventoryService } from '../server/services/inventoryService';

let db: typeof import('../server/db')['db'];

const FIXTURES = {
    branchId: 'test-inventory-guard-branch',
    warehouseId: 'test-inventory-guard-warehouse',
    itemId: 'test-inventory-guard-item',
    menuItemId: 'test-inventory-guard-menu-item',
    recipeId: 'test-inventory-guard-recipe',
};

const seedRecipeStock = async ({ stockQty, batchQty }: { stockQty: number; batchQty?: number }) => {
    await db.insert(branches).values({
        id: FIXTURES.branchId,
        name: 'Inventory Guard Branch',
        isActive: true,
    }).onConflictDoNothing();

    await db.insert(warehouses).values({
        id: FIXTURES.warehouseId,
        name: 'Inventory Guard Warehouse',
        branchId: FIXTURES.branchId,
        type: 'KITCHEN',
        isActive: true,
    }).onConflictDoNothing();

    await db.insert(inventoryItems).values({
        id: FIXTURES.itemId,
        name: 'Inventory Guard Ingredient',
        unit: 'kg',
        isActive: true,
    }).onConflictDoNothing();

    await db.insert(menuItems).values({
        id: FIXTURES.menuItemId,
        name: 'Inventory Guard Menu Item',
        price: 25,
        isAvailable: true,
    }).onConflictDoNothing();

    await db.insert(recipes).values({
        id: FIXTURES.recipeId,
        menuItemId: FIXTURES.menuItemId,
        yield: 1,
    });

    await db.insert(recipeIngredients).values({
        recipeId: FIXTURES.recipeId,
        inventoryItemId: FIXTURES.itemId,
        quantity: 1,
        unit: 'kg',
    });

    await db.insert(inventoryStock).values({
        itemId: FIXTURES.itemId,
        warehouseId: FIXTURES.warehouseId,
        quantity: stockQty,
    });

    if (batchQty !== undefined) {
        await db.insert(inventoryBatches).values({
            id: 'test-inventory-guard-batch',
            itemId: FIXTURES.itemId,
            warehouseId: FIXTURES.warehouseId,
            batchNumber: 'TEST-GUARD-1',
            expiryDate: new Date(Date.now() + 1000 * 60 * 60 * 24),
            initialQty: batchQty,
            currentQty: batchQty,
            unitCost: 10,
            status: 'ACTIVE',
        });
    }
};

const getStockQuantity = async () => {
    const [stock] = await db.select()
        .from(inventoryStock)
        .where(and(
            eq(inventoryStock.itemId, FIXTURES.itemId),
            eq(inventoryStock.warehouseId, FIXTURES.warehouseId),
        ));

    return Number(stock?.quantity || 0);
};

describe('inventory deduction guard', () => {
    beforeEach(async () => {
        if (!db) {
            const dbModule = await import('../server/db');
            db = dbModule.db;
        }
        await db.execute(sql`DELETE FROM batch_transactions WHERE stock_movement_id IN (SELECT id FROM stock_movements WHERE item_id IN (${FIXTURES.itemId}, 'test-inventory-guard-batch-item', 'test-inventory-guard-batch-source'))`);
        await db.execute(sql`DELETE FROM batch_transactions WHERE batch_id IN ('test-inventory-guard-batch', 'test-inventory-guard-source-batch')`);
        await db.execute(sql`DELETE FROM stock_movements WHERE item_id IN (${FIXTURES.itemId}, 'test-inventory-guard-batch-item', 'test-inventory-guard-batch-source')`);
        await db.execute(sql`DELETE FROM recipe_ingredients WHERE recipe_id = ${FIXTURES.recipeId}`);
        await db.execute(sql`DELETE FROM recipes WHERE id = ${FIXTURES.recipeId}`);
        await db.execute(sql`DELETE FROM inventory_stock WHERE item_id = ${FIXTURES.itemId} AND warehouse_id = ${FIXTURES.warehouseId}`);
        await db.execute(sql`DELETE FROM inventory_batches WHERE id IN ('test-inventory-guard-batch', 'test-inventory-guard-source-batch')`);
    });

    it('rejects recipe deduction before aggregate stock can go negative', async () => {
        await seedRecipeStock({ stockQty: 0.5, batchQty: 5 });

        await expect(db.transaction((tx) => inventoryService.deductIngredients(
            tx,
            FIXTURES.menuItemId,
            1,
            FIXTURES.warehouseId,
            'test-inventory-guard-order-aggregate',
            'test-inventory-guard-user',
        ))).rejects.toThrow(/INSUFFICIENT_STOCK/);

        expect(await getStockQuantity()).toBe(0.5);

        const movements = await db.select()
            .from(stockMovements)
            .where(eq(stockMovements.referenceId, 'test-inventory-guard-order-aggregate'));
        expect(movements).toHaveLength(0);
    });

    it('materializes legacy aggregate stock when no batch exists', async () => {
        await seedRecipeStock({ stockQty: 5 });

        const result = await db.transaction((tx) => inventoryService.deductIngredients(
            tx,
            FIXTURES.menuItemId,
            1,
            FIXTURES.warehouseId,
            'test-inventory-guard-order-batches',
            'test-inventory-guard-user',
        ));

        expect(result.affectedStocks[0]?.quantity).toBe(4);
        expect(await getStockQuantity()).toBe(4);

        const movements = await db.select()
            .from(stockMovements)
            .where(eq(stockMovements.referenceId, 'test-inventory-guard-order-batches'));
        expect(movements).toHaveLength(1);
    });

    it('allows only one concurrent deduction when stock can cover one order', async () => {
        await seedRecipeStock({ stockQty: 1, batchQty: 1 });

        const attempts = await Promise.allSettled([
            db.transaction((tx) => inventoryService.deductIngredients(
                tx,
                FIXTURES.menuItemId,
                1,
                FIXTURES.warehouseId,
                'test-inventory-guard-order-concurrent-a',
                'test-inventory-guard-user',
            )),
            db.transaction((tx) => inventoryService.deductIngredients(
                tx,
                FIXTURES.menuItemId,
                1,
                FIXTURES.warehouseId,
                'test-inventory-guard-order-concurrent-b',
                'test-inventory-guard-user',
            )),
        ]);

        expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
        expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
        expect(await getStockQuantity()).toBe(0);

        const [batch] = await db.select()
            .from(inventoryBatches)
            .where(eq(inventoryBatches.id, 'test-inventory-guard-batch'));
        expect(Number(batch.currentQty || 0)).toBe(0);

        const movements = await db.select()
            .from(stockMovements)
            .where(eq(stockMovements.itemId, FIXTURES.itemId));
        const concurrentMovements = movements.filter((movement) => (
            movement.referenceId === 'test-inventory-guard-order-concurrent-a'
            || movement.referenceId === 'test-inventory-guard-order-concurrent-b'
        ));
        expect(concurrentMovements).toHaveLength(1);
    });

    it('auto-produces a batch item before sale consumption when its batch stock is missing', async () => {
        const batchItemId = 'test-inventory-guard-batch-item';
        const batchRecipeId = 'test-inventory-guard-batch-recipe';
        const batchSourceId = 'test-inventory-guard-batch-source';
        await db.insert(inventoryItems).values([
            { id: batchItemId, name: 'Auto Batch Item', unit: 'kg', isActive: true },
            { id: batchSourceId, name: 'Auto Batch Source', unit: 'kg', isActive: true },
        ]).onConflictDoNothing();
        await db.insert(recipes).values({ id: batchRecipeId, inventoryItemId: batchItemId, yield: 1 });
        await db.insert(recipeIngredients).values({ recipeId: batchRecipeId, inventoryItemId: batchSourceId, quantity: 1, unit: 'kg' });
        await db.insert(inventoryStock).values({ itemId: batchSourceId, warehouseId: FIXTURES.warehouseId, quantity: 2 });
        await db.insert(inventoryBatches).values({
            id: 'test-inventory-guard-source-batch', itemId: batchSourceId, warehouseId: FIXTURES.warehouseId,
            batchNumber: 'SOURCE-1', expiryDate: new Date(Date.now() + 86400000), initialQty: 2, currentQty: 2,
            unitCost: 4, status: 'ACTIVE',
        });

        const result = await db.transaction((tx) => inventoryService.ensureSaleStock(
            tx, batchItemId, FIXTURES.warehouseId, 1, 'test-inventory-guard-auto-order', 'test-user',
        ));
        expect(Number(result.totalCost)).toBe(4);
        const movements = await db.select().from(stockMovements).where(eq(stockMovements.referenceId, 'test-inventory-guard-auto-order'));
        expect(movements.map((m) => m.type).sort()).toEqual(['PRODUCTION', 'PRODUCTION_CONSUMPTION', 'SALE_CONSUMPTION'].sort());
        await db.execute(sql`DELETE FROM batch_transactions WHERE stock_movement_id IN (SELECT id FROM stock_movements WHERE reference_id = 'test-inventory-guard-auto-order')`);
        await db.execute(sql`DELETE FROM stock_movements WHERE reference_id = 'test-inventory-guard-auto-order'`);
        await db.execute(sql`DELETE FROM inventory_batches WHERE item_id IN (${batchItemId}, ${batchSourceId})`);
        await db.execute(sql`DELETE FROM inventory_stock WHERE item_id IN (${batchItemId}, ${batchSourceId})`);
        await db.execute(sql`DELETE FROM recipe_ingredients WHERE recipe_id = ${batchRecipeId}`);
        await db.execute(sql`DELETE FROM recipes WHERE id = ${batchRecipeId}`);
        await db.execute(sql`DELETE FROM inventory_items WHERE id IN (${batchItemId}, ${batchSourceId})`);
    });

    it('executes a planned production order automatically when its target is sold', async () => {
        const targetItemId = 'test-inventory-guard-planned-target';
        const sourceItemId = 'test-inventory-guard-planned-source';
        const productionOrderId = 'test-inventory-guard-planned-order';

        await db.insert(inventoryItems).values([
            { id: targetItemId, name: 'Planned Production Target', unit: 'kg', isActive: true },
            { id: sourceItemId, name: 'Planned Production Source', unit: 'kg', isActive: true, costPrice: 4 },
        ]).onConflictDoNothing();
        await db.insert(inventoryStock).values({ itemId: sourceItemId, warehouseId: FIXTURES.warehouseId, quantity: 2 });
        await db.insert(inventoryBatches).values({
            id: 'test-inventory-guard-planned-source-batch', itemId: sourceItemId, warehouseId: FIXTURES.warehouseId,
            batchNumber: 'PLANNED-SOURCE-1', expiryDate: new Date(Date.now() + 86400000), initialQty: 2, currentQty: 2,
            unitCost: 4, status: 'ACTIVE',
        });
        await db.insert(productionOrders).values({
            id: productionOrderId, branchId: FIXTURES.branchId, targetItemId, batchNumber: 'PLANNED-1',
            batchSize: 1, quantity: 2, expectedYield: 2, status: 'PLANNED', warehouseId: FIXTURES.warehouseId,
            createdBy: 'test-user',
        });
        await db.insert(productionOrderItems).values({
            productionOrderId, inventoryItemId: sourceItemId, requiredQty: 1, unit: 'kg',
        });

        await db.transaction((tx) => inventoryService.ensureSaleStock(
            tx, targetItemId, FIXTURES.warehouseId, 1, 'test-inventory-guard-planned-sale', 'test-user',
        ));

        const [production] = await db.select().from(productionOrders).where(eq(productionOrders.id, productionOrderId));
        expect(production.status).toBe('COMPLETED');
        expect(Number(production.actualYield)).toBe(2);

        const [targetStock] = await db.select().from(inventoryStock).where(and(
            eq(inventoryStock.itemId, targetItemId), eq(inventoryStock.warehouseId, FIXTURES.warehouseId),
        ));
        const [sourceStock] = await db.select().from(inventoryStock).where(and(
            eq(inventoryStock.itemId, sourceItemId), eq(inventoryStock.warehouseId, FIXTURES.warehouseId),
        ));
        expect(Number(targetStock?.quantity)).toBe(1);
        expect(Number(sourceStock?.quantity)).toBe(1);

        await db.execute(sql`DELETE FROM batch_transactions WHERE stock_movement_id IN (SELECT id FROM stock_movements WHERE reference_id IN ('test-inventory-guard-planned-order', 'test-inventory-guard-planned-sale'))`);
        await db.execute(sql`DELETE FROM stock_movements WHERE reference_id IN ('test-inventory-guard-planned-order', 'test-inventory-guard-planned-sale')`);
        await db.execute(sql`DELETE FROM inventory_batches WHERE id IN ('test-inventory-guard-planned-source-batch', 'BATCH-PROD-${productionOrderId}')`);
        await db.execute(sql`DELETE FROM inventory_stock WHERE item_id IN (${targetItemId}, ${sourceItemId}) AND warehouse_id = ${FIXTURES.warehouseId}`);
        await db.execute(sql`DELETE FROM production_order_items WHERE production_order_id = ${productionOrderId}`);
        await db.execute(sql`DELETE FROM production_orders WHERE id = ${productionOrderId}`);
        await db.execute(sql`DELETE FROM inventory_items WHERE id IN (${targetItemId}, ${sourceItemId})`);
    });
});
