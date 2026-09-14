import { Request, Response } from 'express';
import { db } from '../db';
import { inventoryStock, stockMovements, inventoryItems, inventoryBatches, warehouses, productionOrders, productionOrderItems, recipes, recipeIngredients } from '../../src/db/schema';
import { and, eq, desc, sql } from 'drizzle-orm';
import { postProductionCompletionEntry } from '../services/financePostingService';
import { inventoryService } from '../services/inventoryService';
import { getStringParam } from '../utils/request';
import { convertQuantity } from '../services/unitConversion';

const ensureProductionTables = async () => {
    await db.execute(sql`
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'production_orders')
        CREATE TABLE production_orders (
            id nvarchar(255) PRIMARY KEY,
            branch_id nvarchar(max),
            target_item_id nvarchar(max) NOT NULL,
            recipe_id nvarchar(max),
            batch_number nvarchar(max) NOT NULL,
            batch_size real DEFAULT 1 NOT NULL,
            expected_yield real NOT NULL,
            actual_yield real,
            status nvarchar(max) DEFAULT 'PLANNED' NOT NULL,
            started_at datetime2,
            completed_at datetime2,
            warehouse_id nvarchar(max) NOT NULL,
            notes nvarchar(max),
            created_by nvarchar(max),
            created_at datetime2 DEFAULT GETDATE(),
            updated_at datetime2 DEFAULT GETDATE()
        )
    `);
    await db.execute(sql`
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'production_order_items')
        CREATE TABLE production_order_items (
            id nvarchar(255) PRIMARY KEY,
            production_order_id nvarchar(max) NOT NULL,
            inventory_item_id nvarchar(max) NOT NULL,
            required_qty real NOT NULL,
            actual_qty real,
            unit nvarchar(max) NOT NULL
        )
    `);
    await db.execute(sql`
        IF COL_LENGTH('dbo.production_orders', 'quantity') IS NOT NULL
        BEGIN
            UPDATE dbo.production_orders
            SET quantity = COALESCE(quantity, expected_yield, batch_size, 1)
            WHERE quantity IS NULL;
            ALTER TABLE dbo.production_orders ALTER COLUMN quantity real NULL;
        END
    `);
    await db.execute(sql`
        IF COL_LENGTH('dbo.production_order_items', 'quantity_planned') IS NOT NULL
        BEGIN
            UPDATE dbo.production_order_items
            SET quantity_planned = COALESCE(quantity_planned, required_qty, 0)
            WHERE quantity_planned IS NULL;
            ALTER TABLE dbo.production_order_items ALTER COLUMN quantity_planned real NULL;
        END
    `);
};

const parseArrayValue = (value: unknown): any[] => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string' || !value.trim()) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const normalizeProductionIngredients = (ingredients: unknown, multiplier: number) => parseArrayValue(ingredients)
    .map((ingredient: any) => ({
        inventoryItemId: String(ingredient?.inventoryItemId || ingredient?.itemId || '').trim(),
        requiredQty: Number(ingredient?.quantity ?? ingredient?.qty ?? 0) * multiplier,
        unit: String(ingredient?.unit || 'unit').trim() || 'unit',
    }))
    .filter((ingredient) => ingredient.inventoryItemId && Number.isFinite(ingredient.requiredQty) && ingredient.requiredQty > 0);

const resolveProductionWarehouse = async (warehouseId: unknown, branchId?: string) => {
    const explicitWarehouseId = getStringParam(warehouseId as any);
    if (explicitWarehouseId) {
        const [warehouse] = await db.select().from(warehouses).where(eq(warehouses.id, explicitWarehouseId));
        return warehouse;
    }

    const scopedWarehouses = await db.select().from(warehouses)
        .where(branchId ? and(eq(warehouses.branchId, branchId), eq(warehouses.isActive, true)) : eq(warehouses.isActive, true))
        .orderBy(sql`CASE UPPER(COALESCE(${warehouses.type}, ''))
            WHEN 'PRODUCTION' THEN 0
            WHEN 'KITCHEN' THEN 1
            WHEN 'MAIN' THEN 2
            ELSE 3
        END`, warehouses.name);

    return scopedWarehouses[0];
};

export const getProductionOrders = async (req: Request, res: Response) => {
    try {
        await ensureProductionTables();
        const status = getStringParam(req.query.status);
        const branchId = req.effectiveBranchId || getStringParam(req.query.branchId);
        
        let query = db.select().from(productionOrders).orderBy(desc(productionOrders.createdAt));
        const ordersRows = await query;
        const allItems = await db.select().from(productionOrderItems);

        const filtered = ordersRows.map(o => {
            const items = allItems.filter(i => i.productionOrderId === o.id);
            return {
                id: o.id,
                targetItemId: o.targetItemId,
                recipeId: o.recipeId || undefined,
                quantityRequested: o.expectedYield,
                quantityProduced: o.actualYield || 0,
                warehouseId: o.warehouseId,
                branchId: o.branchId || undefined,
                status: o.status === 'PLANNED' ? 'PENDING' : o.status,
                batchNumber: o.batchNumber,
                createdAt: o.createdAt?.toISOString() || new Date().toISOString(),
                startedAt: o.startedAt?.toISOString(),
                completedAt: o.completedAt?.toISOString(),
                actorId: o.createdBy || 'system',
                ingredientsConsumed: items.map(i => ({ itemId: i.inventoryItemId, quantity: i.requiredQty })),
                ingredientsReserved: o.status !== 'PLANNED' ? items.map(i => ({ itemId: i.inventoryItemId, quantity: i.requiredQty })) : [],
                actualIngredientsConsumed: o.status === 'COMPLETED' ? items.map(i => ({ itemId: i.inventoryItemId, quantity: i.actualQty || i.requiredQty })) : [],
            };
        }).filter((o) => {
            // Frontend sends PENDING for planned states
            const sStatus = status === 'PENDING' ? 'PLANNED' : status;
            const mappedStatus = o.status === 'PENDING' ? 'PLANNED' : o.status;
            if (sStatus && mappedStatus !== sStatus) return false;
            if (branchId && o.branchId !== branchId) return false;
            return true;
        });

        res.json(filtered.map(o => ({ ...o, status: o.status === 'PLANNED' ? 'PENDING' : o.status })));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createProductionOrder = async (req: Request, res: Response) => {
    try {
        await ensureProductionTables();
        const { targetItemId, quantityRequested, warehouseId } = req.body || {};
        const actorId = req.user?.id || 'system';
        const qty = Number(quantityRequested);
        if (!targetItemId || !Number.isFinite(qty) || qty <= 0) {
            return res.status(400).json({ error: 'targetItemId and quantityRequested are required' });
        }

        const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, targetItemId));
        if (!item) return res.status(404).json({ error: 'Target item not found' });
        if (item.isActive === false) return res.status(409).json({ error: 'TARGET_ITEM_INACTIVE' });
        const warehouse = await resolveProductionWarehouse(warehouseId, req.effectiveBranchId);
        if (!warehouse) return res.status(400).json({ error: 'PRODUCTION_WAREHOUSE_NOT_FOUND' });
        if (warehouse.isActive === false) return res.status(409).json({ error: 'WAREHOUSE_INACTIVE' });
        if (req.effectiveBranchId && warehouse.branchId !== req.effectiveBranchId) {
            return res.status(403).json({ error: 'BRANCH_MISMATCH' });
        }

        const [linkedRecipe] = await db.select().from(recipes).where(eq(recipes.inventoryItemId, targetItemId));
        const linkedIngredients = linkedRecipe
            ? await db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, linkedRecipe.id))
            : [];
        const embeddedBom = parseArrayValue(item.bom);
        if (linkedIngredients.length === 0 && embeddedBom.length === 0) {
            return res.status(400).json({ error: 'Target item has no recipe or BOM' });
        }

        const poId = `PROD-${Date.now()}`;
        const recipeScale = qty / Math.max(Number(linkedRecipe?.yield || 1), 0.000001);
        const sourceIngredients = linkedIngredients.length > 0 ? linkedIngredients : embeddedBom;
        const productionIngredients = normalizeProductionIngredients(
            sourceIngredients,
            linkedIngredients.length > 0 ? recipeScale : qty,
        ).map((ingredient) => ({ productionOrderId: poId, ...ingredient }));
        for (const ingredient of productionIngredients) {
            const [sourceItem] = await db.select({ unit: inventoryItems.unit }).from(inventoryItems).where(eq(inventoryItems.id, ingredient.inventoryItemId));
            if (sourceItem) {
                // BOM rows may carry an empty/unknown unit (older data) — fall back to
                // same-unit semantics instead of hard-blocking production.
                try {
                    ingredient.requiredQty = convertQuantity(ingredient.requiredQty, ingredient.unit || sourceItem.unit, sourceItem.unit);
                } catch {
                    ingredient.requiredQty = Number(ingredient.requiredQty) || 0;
                }
                ingredient.unit = sourceItem.unit;
            }
        }
        if (productionIngredients.length === 0) {
            return res.status(400).json({ error: 'Recipe or BOM has no valid ingredient quantities' });
        }
        
        await db.transaction(async (tx) => {
            await tx.insert(productionOrders).values({
                id: poId,
                branchId: warehouse.branchId || undefined,
                targetItemId,
                recipeId: linkedRecipe?.id,
                batchNumber: `B-${Date.now()}`,
                batchSize: 1, 
                expectedYield: qty,
                status: 'PLANNED', // Mapped to PENDING in UI
                warehouseId: warehouse.id,
                createdBy: actorId || 'system',
                createdAt: new Date(),
            });

            await tx.insert(productionOrderItems).values(productionIngredients);
        });

        res.status(201).json({
            id: poId,
            status: 'PENDING',
            warehouseId: warehouse.id,
            warnings: [],
        });
    } catch (error: any) {
        const message = String(error?.message || 'PRODUCTION_ORDER_CREATE_FAILED');
        if (message.startsWith('INCOMPATIBLE_UNITS') || message.startsWith('INVALID_UNIT_QUANTITY')) {
            return res.status(400).json({ error: message });
        }
        res.status(500).json({ error: message });
    }
};

export const startProductionOrder = async (req: Request, res: Response) => {
    try {
        await ensureProductionTables();
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'PRODUCTION_ORDER_ID_REQUIRED' });
        const actorId = req.user?.id || 'system';

        const [order] = await db.select().from(productionOrders).where(eq(productionOrders.id, id));
        if (!order) return res.status(404).json({ error: 'Production order not found' });
        if (req.effectiveBranchId && order.branchId !== req.effectiveBranchId) return res.status(403).json({ error: 'BRANCH_MISMATCH' });
        const [startWarehouse] = await db.select({ isActive: warehouses.isActive }).from(warehouses).where(eq(warehouses.id, order.warehouseId));
        if (!startWarehouse || startWarehouse.isActive === false) return res.status(409).json({ error: 'WAREHOUSE_INACTIVE' });
        if (order.status !== 'PLANNED' && order.status !== 'PENDING') {
            return res.status(400).json({ error: 'Only pending orders can be started' });
        }

        const items = await db.select().from(productionOrderItems).where(eq(productionOrderItems.productionOrderId, id));

        await db.transaction(async (tx) => {
            // ensureSaleStock (not raw deductInventoryFEFO) so that:
            // - legacy aggregate stock without batches is materialized first,
            // - composite ingredients auto-produce from their own BOM when short
            //   (recursive, cycle-guarded), instead of failing the whole start.
            const trail = new Set<string>();
            for (const ingredient of items) {
                const [ingredientItem] = await tx.select({ isActive: inventoryItems.isActive }).from(inventoryItems).where(eq(inventoryItems.id, ingredient.inventoryItemId));
                if (!ingredientItem || ingredientItem.isActive === false) throw new Error(`INGREDIENT_ITEM_INACTIVE|item=${ingredient.inventoryItemId}`);
                await inventoryService.ensureSaleStock(
                    tx, ingredient.inventoryItemId, order.warehouseId, ingredient.requiredQty, id,
                    actorId, trail, 'PRODUCTION_CONSUMPTION', `Production consumption ${id}`
                );
            }

            await tx.update(productionOrders)
                .set({ status: 'IN_PROGRESS', startedAt: new Date(), updatedAt: new Date() })
                .where(eq(productionOrders.id, id));
        });

        res.json({ id, status: 'IN_PROGRESS' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const completeProductionOrder = async (req: Request, res: Response) => {
    try {
        await ensureProductionTables();
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'PRODUCTION_ORDER_ID_REQUIRED' });
        const actorId = req.user?.id || 'system';
        const quantityProducedInput = Number(req.body?.quantityProduced || 0);
        
        const actualIngredientsInput = Array.isArray(req.body?.actualIngredientsConsumed) ? req.body.actualIngredientsConsumed : null;

        const [order] = await db.select().from(productionOrders).where(eq(productionOrders.id, id));
        if (!order) return res.status(404).json({ error: 'Production order not found' });
        if (req.effectiveBranchId && order.branchId !== req.effectiveBranchId) return res.status(403).json({ error: 'BRANCH_MISMATCH' });
        if (order.status !== 'IN_PROGRESS') return res.status(400).json({ error: 'Only in progress orders can be completed' });
        const [completionWarehouse] = await db.select({ isActive: warehouses.isActive }).from(warehouses).where(eq(warehouses.id, order.warehouseId));
        const [completionTarget] = await db.select({ isActive: inventoryItems.isActive }).from(inventoryItems).where(eq(inventoryItems.id, order.targetItemId));
        if (!completionWarehouse || completionWarehouse.isActive === false) return res.status(409).json({ error: 'WAREHOUSE_INACTIVE' });
        if (!completionTarget || completionTarget.isActive === false) return res.status(409).json({ error: 'TARGET_ITEM_INACTIVE' });

        const quantityProduced = quantityProducedInput > 0 ? quantityProducedInput : Number(order.expectedYield || 0);
        if (quantityProduced <= 0) return res.status(400).json({ error: 'Invalid quantityProduced' });
        if (!Number.isFinite(quantityProduced)) return res.status(400).json({ error: 'Invalid quantityProduced' });

        const items = await db.select().from(productionOrderItems).where(eq(productionOrderItems.productionOrderId, id));
        const actualByItem = new Map<string, number>();
        if (actualIngredientsInput) {
            for (const input of actualIngredientsInput) {
                const itemId = String(input?.itemId || '');
                const qty = Number(input?.quantity);
                if (!itemId || !Number.isFinite(qty) || qty < 0 || actualByItem.has(itemId)) return res.status(400).json({ error: 'INVALID_ACTUAL_INGREDIENTS' });
                if (!items.some(item => item.inventoryItemId === itemId)) return res.status(400).json({ error: 'UNKNOWN_ACTUAL_INGREDIENT' });
                actualByItem.set(itemId, qty);
            }
        }

        let totalConsumedCost = 0;

        await db.transaction(async (tx) => {
            for (const item of items) {
                let actualQty = item.requiredQty;
                if (actualIngredientsInput) {
                    if (actualByItem.has(item.inventoryItemId)) actualQty = actualByItem.get(item.inventoryItemId)!;
                }

                await tx.update(productionOrderItems)
                    .set({ actualQty })
                    .where(eq(productionOrderItems.id, item.id));

                const [invItem] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, item.inventoryItemId));
                if (!invItem || invItem.isActive === false) throw new Error(`INGREDIENT_ITEM_INACTIVE|item=${item.inventoryItemId}`);
                const unitCost = Number(invItem?.costPrice || 0);
                totalConsumedCost += actualQty * unitCost;

                if (actualQty > item.requiredQty) {
                    const extraQty = actualQty - item.requiredQty;
                    await inventoryService.deductInventoryFEFO(tx, item.inventoryItemId, order.warehouseId, extraQty, id, `Production extra consumption ${id}`, { performedBy: actorId, movementType: 'PRODUCTION_CONSUMPTION' });
                } else if (actualQty < item.requiredQty) {
                    const releaseQty = item.requiredQty - actualQty;
                    const [stock] = await tx.select().from(inventoryStock).where(and(
                        eq(inventoryStock.itemId, item.inventoryItemId),
                        eq(inventoryStock.warehouseId, order.warehouseId)
                    ));
                    if (stock) {
                        await tx.update(inventoryStock)
                            .set({ quantity: Number(stock.quantity || 0) + releaseQty, lastUpdated: new Date() })
                            .where(eq(inventoryStock.id, stock.id));
                    } else {
                        await tx.insert(inventoryStock).values({ itemId: item.inventoryItemId, warehouseId: order.warehouseId, quantity: releaseQty, lastUpdated: new Date() });
                    }
                    await tx.insert(stockMovements).values({
                        itemId: item.inventoryItemId,
                        toWarehouseId: order.warehouseId,
                        quantity: releaseQty,
                        type: 'ADJUSTMENT',
                        reason: `Production reserve release ${id}`,
                        referenceId: id,
                        performedBy: actorId,
                        createdAt: new Date(),
                    });
                    const releaseExpiry = new Date();
                    releaseExpiry.setFullYear(releaseExpiry.getFullYear() + 1);
                    await tx.insert(inventoryBatches).values({
                        id: `BATCH-PROD-RELEASE-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
                        itemId: item.inventoryItemId,
                        warehouseId: order.warehouseId,
                        batchNumber: `PROD-RELEASE-${id}`,
                        expiryDate: releaseExpiry,
                        receivedDate: new Date(),
                        initialQty: releaseQty,
                        currentQty: releaseQty,
                        unitCost: Number(invItem?.costPrice || 0),
                        status: 'ACTIVE',
                        createdAt: new Date(),
                    });
                }
            }

            const targetItemId = order.targetItemId;
            const [finishedStock] = await tx.select().from(inventoryStock).where(and(
                eq(inventoryStock.itemId, targetItemId),
                eq(inventoryStock.warehouseId, order.warehouseId)
            ));
            if (finishedStock) {
                await tx.update(inventoryStock)
                    .set({ quantity: Number(finishedStock.quantity || 0) + quantityProduced, lastUpdated: new Date() })
                    .where(eq(inventoryStock.id, finishedStock.id));
            } else {
                await tx.insert(inventoryStock).values({ itemId: targetItemId, warehouseId: order.warehouseId, quantity: quantityProduced, lastUpdated: new Date() });
            }

            await tx.insert(stockMovements).values({
                itemId: targetItemId,
                toWarehouseId: order.warehouseId,
                quantity: quantityProduced,
                type: 'ADJUSTMENT', 
                reason: `Production output ${id}`,
                referenceId: id,
                performedBy: actorId,
                createdAt: new Date(),
            });

            // Produced semi-finished/finished goods are lot-controlled too.
            // This keeps FEFO and cost traceability working when the batch is
            // later consumed by a menu recipe (for example sauce by grams).
            const producedUnitCost = totalConsumedCost / quantityProduced;
            const productionExpiry = new Date();
            productionExpiry.setFullYear(productionExpiry.getFullYear() + 1);
            await tx.insert(inventoryBatches).values({
                id: `BATCH-PROD-${id}`,
                itemId: targetItemId,
                warehouseId: order.warehouseId,
                batchNumber: order.batchNumber,
                expiryDate: productionExpiry,
                receivedDate: new Date(),
                initialQty: quantityProduced,
                currentQty: quantityProduced,
                unitCost: Number.isFinite(producedUnitCost) ? producedUnitCost : 0,
                status: 'ACTIVE',
                createdAt: new Date(),
            });

            if (totalConsumedCost > 0 && quantityProduced > 0) {
                 await tx.update(inventoryItems).set({ costPrice: totalConsumedCost / quantityProduced }).where(eq(inventoryItems.id, targetItemId));
            }

            await tx.update(productionOrders)
                .set({ status: 'COMPLETED', actualYield: quantityProduced, completedAt: new Date(), updatedAt: new Date() })
                .where(eq(productionOrders.id, id));
        });

        // GL Post for variances OR completion value
        const finance = await postProductionCompletionEntry({
            productionOrderId: id,
            // totalConsumedCost already includes any extra actual consumption;
            // adding the variance again would overstate production cost.
            amount: totalConsumedCost,
            branchId: order.branchId,
            userId: actorId,
        });

        res.json({ id, status: 'COMPLETED', financeStatus: finance?.status || 'skipped' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const cancelProductionOrder = async (req: Request, res: Response) => {
    try {
        await ensureProductionTables();
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'PRODUCTION_ORDER_ID_REQUIRED' });
        const actorId = req.user?.id || 'system';
        
        const [order] = await db.select().from(productionOrders).where(eq(productionOrders.id, id));
        if (!order) return res.status(404).json({ error: 'Production order not found' });
        if (req.effectiveBranchId && order.branchId !== req.effectiveBranchId) return res.status(403).json({ error: 'BRANCH_MISMATCH' });
        
        if (order.status === 'COMPLETED') return res.status(400).json({ error: 'Completed orders cannot be cancelled' });

        if (order.status === 'IN_PROGRESS') {
            const items = await db.select().from(productionOrderItems).where(eq(productionOrderItems.productionOrderId, id));
            await db.transaction(async (tx) => {
                for (const item of items) {
                    const qty = Number(item.requiredQty || 0);
                    if (qty <= 0) continue;
                    const [stock] = await tx.select().from(inventoryStock).where(and(eq(inventoryStock.itemId, item.inventoryItemId), eq(inventoryStock.warehouseId, order.warehouseId)));
                    if (stock) {
                        await tx.update(inventoryStock).set({ quantity: Number(stock.quantity || 0) + qty, lastUpdated: new Date() }).where(eq(inventoryStock.id, stock.id));
                    } else {
                        await tx.insert(inventoryStock).values({ itemId: item.inventoryItemId, warehouseId: order.warehouseId, quantity: qty, lastUpdated: new Date() });
                    }
                    await tx.insert(stockMovements).values({
                        itemId: item.inventoryItemId,
                        toWarehouseId: order.warehouseId,
                        quantity: qty,
                        type: 'ADJUSTMENT',
                        reason: `Production cancel release ${id}`,
                        referenceId: id,
                        performedBy: actorId,
                        createdAt: new Date(),
                    });
                    const releaseExpiry = new Date();
                    releaseExpiry.setFullYear(releaseExpiry.getFullYear() + 1);
                    const [releaseItem] = await tx.select({ costPrice: inventoryItems.costPrice }).from(inventoryItems).where(eq(inventoryItems.id, item.inventoryItemId));
                    await tx.insert(inventoryBatches).values({
                        id: `BATCH-PROD-CANCEL-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
                        itemId: item.inventoryItemId,
                        warehouseId: order.warehouseId,
                        batchNumber: `PROD-CANCEL-${id}`,
                        expiryDate: releaseExpiry,
                        receivedDate: new Date(),
                        initialQty: qty,
                        currentQty: qty,
                        unitCost: Number(releaseItem?.costPrice || 0),
                        status: 'ACTIVE',
                        createdAt: new Date(),
                    });
                }
            });
        }
        
        await db.update(productionOrders).set({ status: 'CANCELLED', updatedAt: new Date() }).where(eq(productionOrders.id, id));
        res.json({ id, status: 'CANCELLED' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

const buildProductionOrderDetail = async (id: string) => {
    const [order] = await db.select().from(productionOrders).where(eq(productionOrders.id, id));
    if (!order) return null;
    const [target] = await db.select({ name: inventoryItems.name, nameAr: inventoryItems.nameAr, unit: inventoryItems.unit })
        .from(inventoryItems).where(eq(inventoryItems.id, order.targetItemId));
    const [warehouse] = await db.select({ name: warehouses.name, branchId: warehouses.branchId }).from(warehouses).where(eq(warehouses.id, order.warehouseId));
    const itemRows = await db.select({
        inventoryItemId: productionOrderItems.inventoryItemId,
        requiredQty: productionOrderItems.requiredQty,
        actualQty: productionOrderItems.actualQty,
        unit: productionOrderItems.unit,
        name: inventoryItems.name,
        nameAr: inventoryItems.nameAr,
    }).from(productionOrderItems)
        .leftJoin(inventoryItems, eq(inventoryItems.id, productionOrderItems.inventoryItemId))
        .where(eq(productionOrderItems.productionOrderId, id));
    const movements = await db.select({
        id: stockMovements.id,
        type: stockMovements.type,
        quantity: stockMovements.quantity,
        reason: stockMovements.reason,
        performedBy: stockMovements.performedBy,
        createdAt: stockMovements.createdAt,
    }).from(stockMovements).where(eq(stockMovements.referenceId, id)).orderBy(desc(stockMovements.createdAt));
    return {
        id: order.id,
        targetItemId: order.targetItemId,
        targetItemName: (target as any)?.name || order.targetItemId,
        targetItemNameAr: (target as any)?.nameAr || (target as any)?.name || order.targetItemId,
        targetUnit: (target as any)?.unit || '',
        quantityRequested: Number(order.expectedYield || 0),
        quantityProduced: Number(order.actualYield || 0),
        warehouseId: order.warehouseId,
        warehouseName: (warehouse as any)?.name || order.warehouseId,
        branchId: order.branchId || (warehouse as any)?.branchId || undefined,
        status: order.status,
        batchNumber: order.batchNumber,
        notes: (order as any).notes || undefined,
        isAutomatic: String(order.batchNumber || '').startsWith('AUTO-'),
        recipeId: order.recipeId || undefined,
        createdAt: (order.createdAt as any)?.toISOString?.() || new Date().toISOString(),
        startedAt: (order.startedAt as any)?.toISOString?.() || undefined,
        completedAt: (order.completedAt as any)?.toISOString?.() || undefined,
        actorId: (order as any).createdBy || 'system',
        ingredients: itemRows.map((r) => ({
            inventoryItemId: r.inventoryItemId,
            name: (r as any).name || r.inventoryItemId,
            nameAr: (r as any).nameAr || (r as any).name || r.inventoryItemId,
            requiredQty: Number(r.requiredQty || 0),
            actualQty: r.actualQty === null || r.actualQty === undefined ? undefined : Number(r.actualQty),
            unit: r.unit || '',
        })),
        movements: movements.map((m) => ({
            id: m.id,
            type: m.type,
            quantity: Number(m.quantity || 0),
            reason: m.reason || '',
            performedBy: m.performedBy || 'system',
            createdAt: (m.createdAt as any)?.toISOString?.() || '',
        })),
    };
};

export const getProductionOrderById = async (req: Request, res: Response) => {
    try {
        await ensureProductionTables();
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'PRODUCTION_ORDER_ID_REQUIRED' });
        const detail = await buildProductionOrderDetail(id);
        if (!detail) return res.status(404).json({ error: 'Production order not found' });
        if (req.effectiveBranchId && detail.branchId && detail.branchId !== req.effectiveBranchId) {
            return res.status(403).json({ error: 'BRANCH_MISMATCH' });
        }
        res.json(detail);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateProductionOrder = async (req: Request, res: Response) => {
    try {
        await ensureProductionTables();
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'PRODUCTION_ORDER_ID_REQUIRED' });
        const [order] = await db.select().from(productionOrders).where(eq(productionOrders.id, id));
        if (!order) return res.status(404).json({ error: 'Production order not found' });
        if (req.effectiveBranchId && order.branchId && order.branchId !== req.effectiveBranchId) {
            return res.status(403).json({ error: 'BRANCH_MISMATCH' });
        }
        // Only planned orders can be edited — started/completed ones already moved stock.
        if (order.status !== 'PLANNED' && order.status !== 'PENDING') {
            return res.status(400).json({ error: 'ONLY_PLANNED_ORDERS_EDITABLE' });
        }
        const body = req.body || {};
        const updates: Record<string, any> = { updatedAt: new Date() };
        let rescaleFactor: number | null = null;
        if (body.quantityRequested !== undefined) {
            const qty = Number(body.quantityRequested);
            if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: 'INVALID_QUANTITY' });
            const oldQty = Number(order.expectedYield || 0);
            if (oldQty > 0 && qty !== oldQty) rescaleFactor = qty / oldQty;
            updates.expectedYield = qty;
        }
        if (body.warehouseId !== undefined) {
            const warehouseId = getStringParam(body.warehouseId);
            const [warehouse] = await db.select().from(warehouses).where(eq(warehouses.id, warehouseId));
            if (!warehouse) return res.status(400).json({ error: 'PRODUCTION_WAREHOUSE_NOT_FOUND' });
            if (warehouse.isActive === false) return res.status(409).json({ error: 'WAREHOUSE_INACTIVE' });
            if (req.effectiveBranchId && warehouse.branchId !== req.effectiveBranchId) {
                return res.status(403).json({ error: 'BRANCH_MISMATCH' });
            }
            updates.warehouseId = warehouseId;
            if (warehouse.branchId) updates.branchId = warehouse.branchId;
        }
        if (body.batchNumber !== undefined) updates.batchNumber = getStringParam(body.batchNumber) || order.batchNumber;
        if (body.notes !== undefined) updates.notes = body.notes === null ? null : String(body.notes).slice(0, 2000);

        await db.transaction(async (tx) => {
            await tx.update(productionOrders).set(updates).where(eq(productionOrders.id, id));
            if (rescaleFactor !== null) {
                const items = await tx.select().from(productionOrderItems).where(eq(productionOrderItems.productionOrderId, id));
                for (const item of items) {
                    await tx.update(productionOrderItems)
                        .set({ requiredQty: Number(item.requiredQty || 0) * (rescaleFactor as number) })
                        .where(eq(productionOrderItems.id, item.id));
                }
            }
        });
        res.json(await buildProductionOrderDetail(id));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteProductionOrder = async (req: Request, res: Response) => {
    try {
        await ensureProductionTables();
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'PRODUCTION_ORDER_ID_REQUIRED' });
        const [order] = await db.select().from(productionOrders).where(eq(productionOrders.id, id));
        if (!order) return res.status(404).json({ error: 'Production order not found' });
        if (req.effectiveBranchId && order.branchId && order.branchId !== req.effectiveBranchId) {
            return res.status(403).json({ error: 'BRANCH_MISMATCH' });
        }
        // Only planned orders can be deleted outright — started ones must be
        // cancelled (releases reserved stock) to keep inventory consistent.
        if (order.status !== 'PLANNED' && order.status !== 'PENDING') {
            return res.status(400).json({ error: 'ONLY_PLANNED_ORDERS_DELETABLE' });
        }
        await db.transaction(async (tx) => {
            await tx.delete(productionOrderItems).where(eq(productionOrderItems.productionOrderId, id));
            await tx.delete(productionOrders).where(eq(productionOrders.id, id));
        });
        res.json({ success: true, id });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
