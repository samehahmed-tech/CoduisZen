import { db } from '../db';
import { inventoryStock, stockMovements, recipes, recipeIngredients, inventoryBatches, batchTransactions, inventoryItems, productionOrders, productionOrderItems, warehouses } from '../../src/db/schema';
import { eq, and, asc, desc, sql } from 'drizzle-orm';
import logger from '../utils/logger';
import { convertQuantity } from './unitConversion';

const log = logger.child({ service: 'inventory' });
const QUANTITY_EPSILON = 0.000001;

type DeductInventoryOptions = {
    performedBy?: string;
    movementType?: string;
    allowExpired?: boolean;
};

// BOM quantities may carry an empty/unknown unit (older data) — assume the
// ingredient's own unit instead of blocking the whole operation.
const safeConvert = (value: number, from: string, to: string): number => {
    try {
        return convertQuantity(value, from || to, to);
    } catch {
        return Number(value) || 0;
    }
};

const parseEmbeddedBom = (value: unknown): { inventoryItemId: string; quantity: number; unit: string }[] => {
    if (Array.isArray(value)) return value as any[];
    if (typeof value === 'string' && value.trim()) {
        try {
            const parsed = JSON.parse(value.trim());
            if (Array.isArray(parsed)) return parsed;
        } catch { /* ignore */ }
    }
    return [];
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

    /** Produce a semi-finished item on demand when its stock has no usable batches. */
    async autoProduceForSale(tx: any, itemId: string, warehouseId: string, requestedQty: number, orderId: string, actorId: string, trail = new Set<string>()) {
        if (trail.has(itemId)) throw new Error(`INSUFFICIENT_STOCK_BATCHES|item=${itemId}|reason=RECURSIVE_BATCH_RECIPE`);
        const nextTrail = new Set(trail).add(itemId);
        const [itemRecipe] = await tx.select().from(recipes)
            .where(and(eq(recipes.inventoryItemId, itemId), sql`(${recipes.sizeId} IS NULL OR LTRIM(RTRIM(${recipes.sizeId})) = '')`))
            .orderBy(desc(recipes.updatedAt));

        const outputQty = Math.max(Number(requestedQty), 0);
        let totalCost = 0;
        const consumedComponents: { inventoryItemId: string; requiredQty: number; unit: string }[] = [];
        if (itemRecipe) {
            const ingredients = await tx.select({ ingredient: recipeIngredients, inventoryUnit: inventoryItems.unit })
                .from(recipeIngredients)
                .innerJoin(inventoryItems, eq(recipeIngredients.inventoryItemId, inventoryItems.id))
                .where(eq(recipeIngredients.recipeId, itemRecipe.id));
            if (!ingredients.length) throw new Error(`INSUFFICIENT_STOCK_BATCHES|item=${itemId}|reason=EMPTY_BATCH_RECIPE`);

            const yieldQty = Math.max(Number(itemRecipe.yield || 1), QUANTITY_EPSILON);
            for (const row of ingredients) {
                const requiredQty = safeConvert(Number(row.ingredient.quantity || 0), row.ingredient.unit, row.inventoryUnit) * outputQty / yieldQty;
                if (!Number.isFinite(requiredQty) || requiredQty <= 0) continue;
                const consumed = await this.ensureSaleStock(tx, String(row.ingredient.inventoryItemId), warehouseId, requiredQty, orderId, actorId, nextTrail, 'PRODUCTION_CONSUMPTION');
                totalCost += Number(consumed?.totalCost || 0);
                consumedComponents.push({ inventoryItemId: String(row.ingredient.inventoryItemId), requiredQty, unit: String(row.inventoryUnit || row.ingredient.unit || '') });
            }
        } else {
            // Fall back to the embedded BOM on the inventory item (per-1-unit quantities).
            const [itemRow] = await tx.select({ bom: inventoryItems.bom }).from(inventoryItems).where(eq(inventoryItems.id, itemId));
            const embedded = parseEmbeddedBom((itemRow as any)?.bom);
            if (!embedded.length) throw new Error(`INSUFFICIENT_STOCK_BATCHES|item=${itemId}|reason=NO_BATCH_RECIPE`);
            for (const ing of embedded) {
                const componentId = String((ing as any)?.inventoryItemId || (ing as any)?.itemId || '').trim();
                if (!componentId) continue;
                const [unitRow] = await tx.select({ unit: inventoryItems.unit }).from(inventoryItems).where(eq(inventoryItems.id, componentId));
                const requiredQty = safeConvert(Number((ing as any)?.quantity ?? (ing as any)?.qty ?? 0), String((ing as any)?.unit || ''), String(unitRow?.unit || '')) * outputQty;
                if (!Number.isFinite(requiredQty) || requiredQty <= 0) continue;
                const consumed = await this.ensureSaleStock(tx, componentId, warehouseId, requiredQty, orderId, actorId, nextTrail, 'PRODUCTION_CONSUMPTION');
                totalCost += Number(consumed?.totalCost || 0);
                consumedComponents.push({ inventoryItemId: componentId, requiredQty, unit: String(unitRow?.unit || (ing as any)?.unit || '') });
            }
        }

        const [stock] = await tx.select().from(inventoryStock).where(and(eq(inventoryStock.itemId, itemId), eq(inventoryStock.warehouseId, warehouseId)));
        if (stock) await tx.update(inventoryStock).set({ quantity: sql`${inventoryStock.quantity} + ${outputQty}`, lastUpdated: new Date() }).where(eq(inventoryStock.id, stock.id));
        else await tx.insert(inventoryStock).values({ itemId, warehouseId, quantity: outputQty, lastUpdated: new Date() });

        const unitCost = totalCost / outputQty;
        const expiry = new Date(); expiry.setFullYear(expiry.getFullYear() + 1);
        const autoId = `BATCH-AUTO-${orderId}-${itemId}-${Date.now()}`;
        await tx.insert(inventoryBatches).values({
            id: autoId, itemId, warehouseId, batchNumber: `AUTO-${orderId}-${itemId}`,
            expiryDate: expiry, receivedDate: new Date(), initialQty: outputQty, currentQty: outputQty,
            unitCost: Number.isFinite(unitCost) ? unitCost : 0, status: 'ACTIVE', createdAt: new Date(),
        });
        await tx.insert(stockMovements).values({
            itemId, toWarehouseId: warehouseId, quantity: outputQty, type: 'PRODUCTION',
            referenceId: orderId, reason: `Automatic batch production for sale ${orderId}`,
            performedBy: actorId, createdAt: new Date(), totalCost: Number.isFinite(totalCost) ? totalCost : 0,
        });

        // Record the automatic production as a completed production order so it
        // appears in the production log (HISTORY) for user review.
        const autoOrderId = `PROD-AUTO-${String(itemId).slice(0, 12)}-${Date.now()}`;
        const [whRow] = await tx.select({ branchId: warehouses.branchId }).from(warehouses).where(eq(warehouses.id, warehouseId));
        const now = new Date();
        await tx.insert(productionOrders).values({
            id: autoOrderId,
            branchId: (whRow as any)?.branchId || undefined,
            targetItemId: itemId,
            recipeId: itemRecipe?.id || undefined,
            batchNumber: `AUTO-${orderId}-${itemId}`,
            batchSize: 1,
            expectedYield: outputQty,
            actualYield: outputQty,
            status: 'COMPLETED',
            startedAt: now,
            completedAt: now,
            warehouseId,
            notes: `AUTO: Automatic production of ${outputQty} for ${orderId}`,
            createdBy: actorId && actorId !== 'system' ? actorId : undefined,
            createdAt: now,
            updatedAt: now,
        });
        if (consumedComponents.length) {
            await tx.insert(productionOrderItems).values(consumedComponents.map((c) => ({
                productionOrderId: autoOrderId,
                inventoryItemId: c.inventoryItemId,
                requiredQty: c.requiredQty,
                actualQty: c.requiredQty,
                unit: c.unit || 'unit',
            })));
        }
        return { totalCost, autoOrderId };
    },

    async ensureSaleStock(tx: any, itemId: string, warehouseId: string, requestedQty: number, orderId: string, actorId: string, trail = new Set<string>(), movementType = 'SALE_CONSUMPTION', reason = 'FEFO Menu Order Deduction') {
        try {
            return await this.deductInventoryFEFO(tx, itemId, warehouseId, requestedQty, orderId, reason, { performedBy: actorId, movementType });
        } catch (error: any) {
            const msg = String(error?.message || '');
            if (!/^(INSUFFICIENT_STOCK|INSUFFICIENT_STOCK_BATCHES)\|/.test(msg) && !/^Insufficient inventory:/.test(msg)) throw error;
            // Opening/legacy stock can exist in inventory_stock without a lot.
            // Materialize that balance as a traceable batch before producing
            // anything, so old stock is still consumed and logged correctly.
            const [stock] = await tx.select({ quantity: inventoryStock.quantity }).from(inventoryStock).where(and(eq(inventoryStock.itemId, itemId), eq(inventoryStock.warehouseId, warehouseId)));
            const [itemRow] = await tx.select({ costPrice: inventoryItems.costPrice }).from(inventoryItems).where(eq(inventoryItems.id, itemId));
            const [batchTotals] = await tx.select({ quantity: sql<number>`coalesce(sum(${inventoryBatches.currentQty}), 0)` })
                .from(inventoryBatches)
                .where(and(eq(inventoryBatches.itemId, itemId), eq(inventoryBatches.warehouseId, warehouseId), eq(inventoryBatches.status, 'ACTIVE'), sql`${inventoryBatches.currentQty} > 0`));
            const legacyQty = Math.max(0, Number(stock?.quantity || 0) - Number(batchTotals?.quantity || 0));
            if (legacyQty > QUANTITY_EPSILON) {
                const expiry = new Date(); expiry.setFullYear(expiry.getFullYear() + 1);
                await tx.insert(inventoryBatches).values({
                    id: `BATCH-OPENING-${itemId}-${warehouseId}-${Date.now()}`,
                    itemId, warehouseId, batchNumber: `OPENING-${itemId}`,
                    expiryDate: expiry, receivedDate: new Date(), initialQty: legacyQty, currentQty: legacyQty,
                    unitCost: Number(itemRow?.costPrice || 0), status: 'ACTIVE', createdAt: new Date(),
                });
                return await this.deductInventoryFEFO(tx, itemId, warehouseId, requestedQty, orderId, reason, { performedBy: actorId, movementType });
            }
            const produced = await this.autoProduceForSale(tx, itemId, warehouseId, requestedQty, orderId, actorId, trail);
            const deduction = await this.deductInventoryFEFO(tx, itemId, warehouseId, requestedQty, orderId, reason, { performedBy: actorId, movementType });
            return { ...(deduction as any), autoOrderId: (produced as any)?.autoOrderId };
        }
    },

    /**
     * Deduct ingredients for a given menu item from a warehouse.
     * Ingredient quantities are per recipe BATCH; per-serving consumption =
     * ingredient.quantity / recipe.yield (aligned with production scaling and
     * theoretical consumption reports). When a menu item has size-specific
     * recipes, the recipe matching the ordered size wins.
     */
    /**
     * Shared consumption computer: recipe (+size/modifier adjustments) scaled
     * by ordered quantity. Used by deductIngredients (sale) and
     * returnIngredients (cancel/edit-shrink) so both directions agree.
     */
    async computeConsumption(tx: any, menuItemId: string, quantity: number, options: { sizeId?: string; selectedModifiers?: any[] } = {}) {
        let recipeRows: any[] = [];
        try {
            recipeRows = await tx
                .select({ id: recipes.id, yield: recipes.yield, sizeId: recipes.sizeId })
                .from(recipes)
                .where(eq(recipes.menuItemId, menuItemId))
                .orderBy(desc(recipes.updatedAt));
        } catch (error: any) {
            log.warn({ err: error?.message, menuItemId }, 'Skipping inventory computation; recipe lookup failed');
            return { consumptionByItem: new Map(), recipeId: null as string | null };
        }
        if (!recipeRows.length) {
            throw new Error(`MISSING_RECIPE|menuItem=${menuItemId}`);
        }

        const requestedSizeId = String(options.sizeId || '').trim();
        const recipe = requestedSizeId
            ? (recipeRows.find((row: any) => String(row.sizeId || '').trim() === requestedSizeId)
                ?? recipeRows.find((row: any) => !String(row.sizeId || '').trim())
                ?? recipeRows[0])
            : (recipeRows.find((row: any) => !String(row.sizeId || '').trim())
                ?? recipeRows[0]);
        if (!recipe) {
            throw new Error(`MISSING_RECIPE|menuItem=${menuItemId}`);
        }

        const rawYield = Number(recipe?.yield);
        const batchServings = Number.isFinite(rawYield) && rawYield > 0 ? rawYield : 1;

        const ingredients = await tx.select({ ingredient: recipeIngredients, inventoryUnit: inventoryItems.unit })
            .from(recipeIngredients)
            .innerJoin(inventoryItems, eq(recipeIngredients.inventoryItemId, inventoryItems.id))
            .where(eq(recipeIngredients.recipeId, recipe.id));

        if (ingredients.length === 0) {
            throw new Error(`MISSING_RECIPE|menuItem=${menuItemId}|recipe=${recipe.id}`);
        }

        const consumptionByItem = new Map<string, { quantity: number; unit?: string }>();
        for (const row of ingredients) {
            const ingredient = row.ingredient;
            const perServingQty = safeConvert(Number(ingredient.quantity || 0), ingredient.unit, row.inventoryUnit) / batchServings;
            if (!Number.isFinite(perServingQty) || perServingQty <= 0) continue;
            const itemId = String(ingredient.inventoryItemId);
            const current = consumptionByItem.get(itemId);
            consumptionByItem.set(itemId, {
                quantity: Number(current?.quantity || 0) + perServingQty * Number(quantity || 0),
                unit: row.inventoryUnit,
            });
        }

        // Modifier recipes are per ordered item. REMOVE handles options such as
        // "without garlic"; ADD handles extra ingredients.
        for (const modifier of Array.isArray(options.selectedModifiers) ? options.selectedModifiers : []) {
            const sizeRecipe = options.sizeId && (modifier as any)?.recipeBySize?.[options.sizeId];
            const adjustments = Array.isArray(sizeRecipe) ? sizeRecipe : (Array.isArray((modifier as any)?.recipe) ? (modifier as any).recipe : []);
            const sign = String((modifier as any)?.recipeEffect || 'ADD').toUpperCase() === 'REMOVE' ? -1 : 1;
            for (const adjustment of adjustments) {
                const itemId = String(adjustment?.itemId || adjustment?.inventoryItemId || '').trim();
                const rawQty = Number(adjustment?.quantity || 0);
                if (!itemId || !Number.isFinite(rawQty) || rawQty <= 0) continue;
                const [inventoryRow] = await tx.select({ unit: inventoryItems.unit }).from(inventoryItems).where(eq(inventoryItems.id, itemId));
                if (!inventoryRow?.unit) continue;
                const delta = safeConvert(rawQty, adjustment.unit, inventoryRow.unit) * Number(quantity || 0) * sign;
                const current = consumptionByItem.get(itemId) || { quantity: 0, unit: inventoryRow.unit };
                consumptionByItem.set(itemId, { ...current, quantity: current.quantity + delta, unit: inventoryRow.unit });
            }
        }
        return { consumptionByItem, recipeId: String(recipe.id) };
    },

    async deductIngredients(tx: any, menuItemId: string, quantity: number, warehouseId: string, orderId: string, actorId: string = 'system', options: { sizeId?: string; selectedModifiers?: any[] } = {}) {
        const affectedStocks: { itemId: string; warehouseId: string; quantity: number }[] = [];
        let totalCost = 0;
        const { consumptionByItem, recipeId } = await this.computeConsumption(tx, menuItemId, quantity, options);
        if (!recipeId) {
            // Recipe lookup failed — same silent skip as before the refactor.
            return { affectedStocks: [], totalCost: 0 };
        }

        for (const [inventoryItemId, consumption] of consumptionByItem.entries()) {
            const deductionQty = Math.max(0, consumption.quantity);
            if (!Number.isFinite(deductionQty) || deductionQty <= 0) continue;

            const deduction = await this.ensureSaleStock(tx, inventoryItemId, warehouseId, deductionQty, orderId, actorId);
            totalCost += Number(deduction?.totalCostCalculated || 0);

            const [stock] = await tx.select().from(inventoryStock).where(
                and(eq(inventoryStock.itemId, inventoryItemId), eq(inventoryStock.warehouseId, warehouseId))
            );
            if (stock) {
                affectedStocks.push({
                    itemId: inventoryItemId,
                    warehouseId: warehouseId,
                    quantity: Number(stock.quantity || 0)
                });
            }
        }

        if (consumptionByItem.size === 0) {
            throw new Error(`MISSING_RECIPE|menuItem=${menuItemId}|recipe=${recipeId}`);
        }
        return { affectedStocks, totalCost };
    },

    /**
     * Reverse of deductIngredients: credit previously-consumed quantities back
     * (cancel / edit-shrink). Credits go to the warehouse recorded on the
     * order's SALE_CONSUMPTION movement, falling back to the given warehouse.
     * Aggregate-level credit + RETURN_* movement; depleted batches are NOT
     * resurrected (documented limitation — counts reconcile via stock count).
     */
    async returnIngredients(tx: any, menuItemId: string, quantity: number, orderId: string, actorId: string = 'system', options: { sizeId?: string; selectedModifiers?: any[]; fallbackWarehouseId?: string; reason?: string } = {}) {
        const qty = Number(quantity || 0);
        if (!Number.isFinite(qty) || qty <= 0) return { returned: [] as any[], skipped: [] as any[] };
        const { consumptionByItem, recipeId } = await this.computeConsumption(tx, menuItemId, qty, options);
        if (!recipeId) return { returned: [], skipped: [] };
        const returned: any[] = [];
        const skipped: any[] = [];
        for (const [inventoryItemId, consumption] of consumptionByItem.entries()) {
            const returnQty = Math.max(0, Number(consumption.quantity || 0));
            if (!Number.isFinite(returnQty) || returnQty <= QUANTITY_EPSILON) continue;
            // Preferred warehouse: where this order consumed it.
            let warehouseId = String(options.fallbackWarehouseId || '').trim() || null;
            try {
                const [lastMove] = await tx.select({ fromWarehouseId: stockMovements.fromWarehouseId })
                    .from(stockMovements)
                    .where(and(
                        eq(stockMovements.itemId, inventoryItemId),
                        eq(stockMovements.referenceId, orderId),
                        eq(stockMovements.type, 'SALE_CONSUMPTION'),
                    ))
                    .orderBy(desc(stockMovements.createdAt))
                    .top(1);
                if (lastMove?.fromWarehouseId) warehouseId = String(lastMove.fromWarehouseId);
            } catch { /* keep fallback */ }
            if (!warehouseId) {
                skipped.push({ itemId: inventoryItemId, reason: 'NO_WAREHOUSE' });
                continue;
            }
            try {
                const [stock] = await tx.select().from(inventoryStock).where(
                    and(eq(inventoryStock.itemId, inventoryItemId), eq(inventoryStock.warehouseId, warehouseId)),
                );
                if (stock) {
                    await tx.update(inventoryStock)
                        .set({ quantity: sql`${inventoryStock.quantity} + ${returnQty}`, lastUpdated: new Date() })
                        .where(and(eq(inventoryStock.itemId, inventoryItemId), eq(inventoryStock.warehouseId, warehouseId)));
                } else {
                    await tx.insert(inventoryStock).values({
                        itemId: inventoryItemId, warehouseId, quantity: returnQty, lastUpdated: new Date(),
                    });
                }
                await tx.insert(stockMovements).values({
                    itemId: inventoryItemId,
                    toWarehouseId: warehouseId,
                    quantity: returnQty,
                    type: 'RETURN_CANCELLED',
                    referenceId: orderId,
                    reason: options.reason || 'Order cancel/edit return',
                    performedBy: actorId,
                    createdAt: new Date(),
                });
                returned.push({ itemId: inventoryItemId, warehouseId, quantity: returnQty });
            } catch (error: any) {
                skipped.push({ itemId: inventoryItemId, reason: String(error?.message || 'RETURN_FAILED') });
            }
        }
        return { returned, skipped };
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
                options.allowExpired ? sql`${inventoryBatches.expiryDate} <= ${now} OR ${inventoryBatches.expiryDate} > ${now}` : sql`${inventoryBatches.expiryDate} > ${now}`
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

        return { movementId: movement.id, totalCostCalculated: totalCost, totalCost };
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
