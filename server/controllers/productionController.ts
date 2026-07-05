import { Request, Response } from 'express';
import { db } from '../db';
import { inventoryStock, stockMovements, inventoryItems, warehouses, productionOrders, productionOrderItems } from '../../src/db/schema';
import { and, eq, desc, sql } from 'drizzle-orm';
import { postProductionCompletionEntry } from '../services/financePostingService';
import { getStringParam } from '../utils/request';

const ensureProductionTables = async () => {
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS production_orders (
            id text PRIMARY KEY,
            branch_id text,
            target_item_id text NOT NULL,
            recipe_id text,
            batch_number text NOT NULL,
            batch_size real DEFAULT 1 NOT NULL,
            expected_yield real NOT NULL,
            actual_yield real,
            status text DEFAULT 'PLANNED' NOT NULL,
            started_at timestamp,
            completed_at timestamp,
            warehouse_id text NOT NULL,
            notes text,
            created_by text,
            created_at timestamp DEFAULT now(),
            updated_at timestamp DEFAULT now()
        )
    `);
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS production_order_items (
            id serial PRIMARY KEY,
            production_order_id text NOT NULL,
            inventory_item_id text NOT NULL,
            required_qty real NOT NULL,
            actual_qty real,
            unit text NOT NULL
        )
    `);
};

export const getProductionOrders = async (req: Request, res: Response) => {
    try {
        await ensureProductionTables();
        const status = getStringParam(req.query.status);
        const branchId = getStringParam(req.query.branchId);
        
        let query = db.select().from(productionOrders).orderBy(desc(productionOrders.createdAt));
        const ordersRows = await query;
        const allItems = await db.select().from(productionOrderItems);

        const filtered = ordersRows.map(o => {
            const items = allItems.filter(i => i.productionOrderId === o.id);
            return {
                id: o.id,
                targetItemId: o.targetItemId,
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
        const { targetItemId, quantityRequested, warehouseId, actorId } = req.body || {};
        if (!targetItemId || !warehouseId || !quantityRequested || Number(quantityRequested) <= 0) {
            return res.status(400).json({ error: 'targetItemId, warehouseId, and quantityRequested are required' });
        }

        const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, targetItemId));
        if (!item) return res.status(404).json({ error: 'Target item not found' });
        const [warehouse] = await db.select().from(warehouses).where(eq(warehouses.id, warehouseId));
        if (!warehouse) return res.status(404).json({ error: 'Warehouse not found' });

        const qty = Number(quantityRequested);
        const bom = Array.isArray(item.bom) ? item.bom : [];
        if (bom.length === 0) return res.status(400).json({ error: 'Target item has no BOM' });

        const poId = `PROD-${Date.now()}`;
        
        await db.transaction(async (tx) => {
            await tx.insert(productionOrders).values({
                id: poId,
                branchId: warehouse.branchId || undefined,
                targetItemId,
                batchNumber: `B-${Date.now()}`,
                batchSize: 1, 
                expectedYield: qty,
                status: 'PLANNED', // Mapped to PENDING in UI
                warehouseId,
                createdBy: actorId || 'system',
                createdAt: new Date(),
            });

            const itemsToInsert = bom.map((b: any) => ({
                productionOrderId: poId,
                inventoryItemId: b.inventoryItemId || b.itemId,
                requiredQty: Number(b.quantity || 0) * qty,
                unit: b.unit || 'unit'
            })).filter((i: any) => i.inventoryItemId && i.requiredQty > 0);

            if (itemsToInsert.length > 0) {
                await tx.insert(productionOrderItems).values(itemsToInsert);
            }
        });

        res.status(201).json({ id: poId, status: 'PENDING' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const startProductionOrder = async (req: Request, res: Response) => {
    try {
        await ensureProductionTables();
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'PRODUCTION_ORDER_ID_REQUIRED' });
        const actorId = req.body?.actorId || 'system';

        const [order] = await db.select().from(productionOrders).where(eq(productionOrders.id, id));
        if (!order) return res.status(404).json({ error: 'Production order not found' });
        if (order.status !== 'PLANNED' && order.status !== 'PENDING') {
            return res.status(400).json({ error: 'Only pending orders can be started' });
        }

        const items = await db.select().from(productionOrderItems).where(eq(productionOrderItems.productionOrderId, id));

        await db.transaction(async (tx) => {
            for (const ingredient of items) {
                const [stock] = await tx.select().from(inventoryStock).where(and(
                    eq(inventoryStock.itemId, ingredient.inventoryItemId),
                    eq(inventoryStock.warehouseId, order.warehouseId)
                ));
                const currentQty = Number(stock?.quantity || 0);
                if (currentQty < ingredient.requiredQty) {
                    throw new Error(`Insufficient stock for ingredient ${ingredient.inventoryItemId}`);
                }
                await tx.update(inventoryStock)
                    .set({ quantity: currentQty - ingredient.requiredQty, lastUpdated: new Date() })
                    .where(eq(inventoryStock.id, stock.id));

                await tx.insert(stockMovements).values({
                    itemId: ingredient.inventoryItemId,
                    fromWarehouseId: order.warehouseId,
                    quantity: ingredient.requiredQty,
                    type: 'ADJUSTMENT',
                    reason: `Production reserve ${id}`,
                    referenceId: id,
                    performedBy: actorId,
                    createdAt: new Date(),
                });
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
        const actorId = req.body?.actorId || 'system';
        const quantityProducedInput = Number(req.body?.quantityProduced || 0);
        
        const actualIngredientsInput = Array.isArray(req.body?.actualIngredientsConsumed) ? req.body.actualIngredientsConsumed : null;

        const [order] = await db.select().from(productionOrders).where(eq(productionOrders.id, id));
        if (!order) return res.status(404).json({ error: 'Production order not found' });
        if (order.status !== 'IN_PROGRESS') return res.status(400).json({ error: 'Only in progress orders can be completed' });

        const quantityProduced = quantityProducedInput > 0 ? quantityProducedInput : Number(order.expectedYield || 0);
        if (quantityProduced <= 0) return res.status(400).json({ error: 'Invalid quantityProduced' });

        const items = await db.select().from(productionOrderItems).where(eq(productionOrderItems.productionOrderId, id));

        let totalConsumedCost = 0;
        let additionalWasteCost = 0;

        await db.transaction(async (tx) => {
            for (const item of items) {
                let actualQty = item.requiredQty;
                if (actualIngredientsInput) {
                    const uiItem = actualIngredientsInput.find(i => i.itemId === item.inventoryItemId);
                    if (uiItem) actualQty = Number(uiItem.quantity || 0);
                }

                await tx.update(productionOrderItems)
                    .set({ actualQty })
                    .where(eq(productionOrderItems.id, item.id));

                const [invItem] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, item.inventoryItemId));
                const unitCost = Number(invItem?.costPrice || 0);
                totalConsumedCost += actualQty * unitCost;

                if (actualQty > item.requiredQty) {
                    const extraQty = actualQty - item.requiredQty;
                    const [stock] = await tx.select().from(inventoryStock).where(and(
                        eq(inventoryStock.itemId, item.inventoryItemId),
                        eq(inventoryStock.warehouseId, order.warehouseId)
                    ));
                    const currentQty = Number(stock?.quantity || 0);
                    // allow negative stock safely or throw? We'll throw to maintain integrity as ERP.
                    if (currentQty < extraQty) throw new Error(`Insufficient stock for extra consumption of ${item.inventoryItemId}`);
                    
                    await tx.update(inventoryStock)
                        .set({ quantity: currentQty - extraQty, lastUpdated: new Date() })
                        .where(eq(inventoryStock.id, stock.id));

                    await tx.insert(stockMovements).values({
                        itemId: item.inventoryItemId,
                        fromWarehouseId: order.warehouseId,
                        quantity: extraQty,
                        type: 'ADJUSTMENT',
                        reason: `Production extra consumption ${id}`,
                        referenceId: id,
                        performedBy: actorId,
                        createdAt: new Date(),
                    });
                    additionalWasteCost += extraQty * unitCost;
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

            if (totalConsumedCost > 0 && quantityProduced > 0) {
                 await tx.update(inventoryItems).set({ costPrice: totalConsumedCost / quantityProduced }).where(eq(inventoryItems.id, targetItemId));
            }

            await tx.update(productionOrders)
                .set({ status: 'COMPLETED', actualYield: quantityProduced, completedAt: new Date(), updatedAt: new Date() })
                .where(eq(productionOrders.id, id));
        });

        // GL Post for variances OR completion value
        postProductionCompletionEntry({
            productionOrderId: id,
            amount: totalConsumedCost + additionalWasteCost, 
            branchId: order.branchId,
            userId: actorId,
        }).catch((err) => console.error(err));

        res.json({ id, status: 'COMPLETED' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const cancelProductionOrder = async (req: Request, res: Response) => {
    try {
        await ensureProductionTables();
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'PRODUCTION_ORDER_ID_REQUIRED' });
        const actorId = req.body?.actorId || 'system';
        
        const [order] = await db.select().from(productionOrders).where(eq(productionOrders.id, id));
        if (!order) return res.status(404).json({ error: 'Production order not found' });
        
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
                }
            });
        }
        
        await db.update(productionOrders).set({ status: 'CANCELLED', updatedAt: new Date() }).where(eq(productionOrders.id, id));
        res.json({ id, status: 'CANCELLED' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
