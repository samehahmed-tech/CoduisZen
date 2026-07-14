import { db } from '../db';
import { inventoryStock, stockMovements, recipes, recipeIngredients, inventoryBatches, batchTransactions } from '../../src/db/schema';
import { eq, and, asc, sql } from 'drizzle-orm';
import logger from '../utils/logger';

const log = logger.child({ service: 'inventory' });
const QUANTITY_EPSILON = 0.000001;

type DeductInventoryOptions = {
    performedBy?: string;
    movementType?: string;
};

export const inventoryService = {
    async deductAggregateStock(tx: any, itemId: string, warehouseId: string, deductionQty: number) {
        const stockUpdate = tx.update(inventoryStock)
            .set({
                quantity: sql`${inventoryStock.quantity} - ${deductionQty}`,
                lastUpdated: new Date(),
            })
            .where(
                and(
                    eq(inventoryStock.itemId, itemId),
                    eq(inventoryStock.warehouseId, warehouseId),
                    sql`${inventoryStock.quantity} >= ${deductionQty}`
                )
            )
            .output();
        const [updatedStock] = await stockUpdate;

        if (!updatedStock) {
            throw new Error(`INSUFFICIENT_STOCK|item=${itemId}|warehouse=${warehouseId}|requested=${deductionQty}`);
        }

        return updatedStock;
    },

    /**
     * Deduct ingredients for a given menu item from a warehouse.
     */
    async deductIngredients(tx: any, menuItemId: string, quantity: number, warehouseId: string, orderId: string, actorId: string = 'system') {
        const affectedStocks: { itemId: string; warehouseId: string; quantity: number }[] = [];
        let totalCost = 0;
        // 1. Get the recipe for this menu item
        let recipe: any | undefined;
        try {
            [recipe] = await tx
                .select({ id: recipes.id })
                .from(recipes)
                .where(eq(recipes.menuItemId, menuItemId));
        } catch (error: any) {
            log.warn({ err: error?.message, menuItemId }, 'Skipping inventory deduction; recipe lookup failed');
            return [];
        }
        if (!recipe) return []; // No recipe, no deduction needed

        // 2. Get all ingredients for this recipe
        const ingredients = await tx.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, recipe.id));

        for (const ingredient of ingredients) {
            const deductionQty = Number(ingredient.quantity || 0) * Number(quantity || 0);
            if (!Number.isFinite(deductionQty) || deductionQty <= 0) continue;

            const deduction = await this.deductInventoryFEFO(
                tx,
                ingredient.inventoryItemId,
                warehouseId,
                deductionQty,
                orderId,
                'FEFO Menu Order Deduction',
                { performedBy: actorId, movementType: 'SALE_CONSUMPTION' },
            );
            totalCost += Number(deduction?.totalCostCalculated || 0);

            const [stock] = await tx.select().from(inventoryStock).where(
                and(eq(inventoryStock.itemId, ingredient.inventoryItemId), eq(inventoryStock.warehouseId, warehouseId))
            );
            if (stock) {
                affectedStocks.push({
                    itemId: ingredient.inventoryItemId,
                    warehouseId: warehouseId,
                    quantity: Number(stock.quantity || 0)
                });
            }
        }
        return { affectedStocks, totalCost };
    },

    /**
     * FEFO (First Expired First Out) Algorithm Logic
     */
    async deductInventoryFEFO(
        tx: any,
        itemId: string,
        warehouseId: string,
        quantityToDeduct: number,
        referenceId?: string,
        reason?: string,
        options: DeductInventoryOptions = {},
    ) {
        const requestedQty = Number(quantityToDeduct);
        if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
            throw new Error(`INVALID_DEDUCTION_QUANTITY|item=${itemId}|warehouse=${warehouseId}|requested=${quantityToDeduct}`);
        }

        const [aggregateStock] = await tx.select({
            quantity: inventoryStock.quantity,
        }).from(inventoryStock).where(
            and(
                eq(inventoryStock.itemId, itemId),
                eq(inventoryStock.warehouseId, warehouseId),
            ),
        );

        const availableAggregateQty = Number(aggregateStock?.quantity || 0);
        if (availableAggregateQty + QUANTITY_EPSILON < requestedQty) {
            throw new Error(`INSUFFICIENT_STOCK|item=${itemId}|warehouse=${warehouseId}|requested=${requestedQty}|available=${availableAggregateQty}`);
        }

        // 1. Fetch available ACTIVE batches sorted by Expiry Date ASC
        // Item 27: Explicitly reject expired and depleted batches
        const now = new Date();
        const batches = await tx.select()
            .from(inventoryBatches)
            .where(and(
                eq(inventoryBatches.itemId, itemId),
                eq(inventoryBatches.warehouseId, warehouseId),
                eq(inventoryBatches.status, 'ACTIVE'),
                sql`${inventoryBatches.currentQty} > 0`,
                sql`${inventoryBatches.expiryDate} > ${now}`
            ))
            .orderBy(asc(inventoryBatches.expiryDate));

        if (batches.length === 0) {
            throw new Error(`INSUFFICIENT_STOCK_BATCHES|item=${itemId}|warehouse=${warehouseId}|requested=${requestedQty}|available=0`);
        }

        const availableBatchQty = batches.reduce((sum: number, batch: any) => sum + Number(batch.currentQty || 0), 0);
        if (availableBatchQty + QUANTITY_EPSILON < requestedQty) {
            throw new Error(`INSUFFICIENT_STOCK_BATCHES|item=${itemId}|warehouse=${warehouseId}|requested=${requestedQty}|available=${availableBatchQty}`);
        }

        await this.deductAggregateStock(tx, itemId, warehouseId, requestedQty);

        let remainingQty = requestedQty;
        let totalCost = 0;
        const transactionsToCreate = [];

        // 2. We need a stock movement record to link the batch transactions
        const [movement] = await tx.insert(stockMovements).output().values({
            itemId,
            fromWarehouseId: warehouseId,
            quantity: requestedQty,
            type: options.movementType || 'SALE_CONSUMPTION',
            referenceId,
            reason: reason || 'FEFO Auto-Deduction',
            performedBy: options.performedBy,
            createdAt: new Date(),
        });

        // 3. Loop through batches to fulfill quantity
        for (const batch of batches) {
            if (remainingQty <= QUANTITY_EPSILON) break;

            const batchQty = Number(batch.currentQty || 0);
            const usedQty = Math.min(batchQty, remainingQty);
            if (usedQty <= 0) continue;

            const nextQty = batchQty - usedQty;
            const shouldDeplete = nextQty <= QUANTITY_EPSILON;

            const [updatedBatch] = await tx.update(inventoryBatches)
                .set({
                    currentQty: shouldDeplete ? 0 : sql`${inventoryBatches.currentQty} - ${usedQty}`,
                    status: shouldDeplete ? 'DEPLETED' : 'ACTIVE',
                })
                .where(
                    and(
                        eq(inventoryBatches.id, batch.id),
                        sql`${inventoryBatches.currentQty} + ${QUANTITY_EPSILON} >= ${usedQty}`
                    )
                )
                .output();

            if (!updatedBatch) {
                throw new Error(`INVENTORY_BATCH_CONCURRENCY_CONFLICT|batch=${batch.id}|item=${itemId}`);
            }

            remainingQty -= usedQty;
            totalCost += (usedQty * Number(batch.unitCost || 0));

            transactionsToCreate.push({
                batchId: batch.id,
                stockMovementId: movement.id,
                quantityUsed: usedQty,
                costAtTime: Number(batch.unitCost || 0),
            });
        }

        if (remainingQty > QUANTITY_EPSILON) {
            log.warn({ itemId, warehouseId, shortBy: remainingQty }, 'FEFO Deduction Warning: Insufficient stock');
            throw new Error(`Insufficient inventory: Unable to fulfill ${remainingQty} units from batches.`);
        }

        // 4. Record the batch transactions
        if (transactionsToCreate.length > 0) {
            await tx.insert(batchTransactions).values(transactionsToCreate);
        }

        await tx.update(stockMovements)
            .set({ totalCost })
            .where(eq(stockMovements.id, movement.id));

        return { movementId: movement.id, totalCostCalculated: totalCost };
    },

    /**
     * Mark expired batches automatically (Cron Job)
     */
    async markExpiredBatches() {
        const currentDate = new Date();
        const result = await db.update(inventoryBatches)
            .set({ status: 'EXPIRED' })
            .where(and(
                eq(inventoryBatches.status, 'ACTIVE'),
                sql`${inventoryBatches.expiryDate} < ${currentDate}`
            ));

        log.info('Marked expired inventory batches');
    }
};
