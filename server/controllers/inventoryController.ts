import { Request, Response } from 'express';
import crypto from 'node:crypto';
import { db, pool } from '../db';
import { inventoryItems, inventoryStock, stockMovements, warehouses, auditLogs, orders, orderItems, recipes, recipeIngredients, idempotencyKeys } from '../../src/db/schema';
import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import { getStringParam } from '../utils/request';
import { isForeignKeyDeleteError, writeForeignKeyDeleteConflict } from '../utils/dbErrors';
import { postInventoryAdjustmentEntry, postInventoryAdjustmentReversalEntry } from '../services/financePostingService';
import { getIO } from '../socket';
import { inventoryBatches } from '../../src/db/schema';
import { inventoryService } from '../services/inventoryService';
import { createSignedAuditLog } from '../services/auditService';
import { buildRequestHash } from '../services/idempotencyService';
import { parseLocalDateRange } from './report/reportUtils';

let inventorySchemaReady = false;

const ensureInventorySchema = async () => {
    if (inventorySchemaReady) return;
    await pool.query(`
        IF OBJECT_ID('uq_inventory_items_sku', 'UQ') IS NOT NULL
            ALTER TABLE inventory_items DROP CONSTRAINT uq_inventory_items_sku;

        IF NOT EXISTS (
            SELECT 1
            FROM sys.indexes
            WHERE name = 'idx_inventory_items_sku_not_null'
              AND object_id = OBJECT_ID('inventory_items')
        )
            CREATE UNIQUE INDEX idx_inventory_items_sku_not_null
            ON inventory_items(sku)
            WHERE sku IS NOT NULL;
    `);
    inventorySchemaReady = true;
};

/**
 * Inventory Items
 */
export const getInventoryItems = async (req: Request, res: Response) => {
    try {
        const since = req.query.since ? new Date(req.query.since as string) : null;
        
        let itemsQuery = db.select({
            id: inventoryItems.id,
            name: inventoryItems.name,
            nameAr: inventoryItems.nameAr,
            sku: inventoryItems.sku,
            barcode: inventoryItems.barcode,
            unit: inventoryItems.unit,
            category: inventoryItems.category,
            threshold: inventoryItems.threshold,
            costPrice: inventoryItems.costPrice,
            purchasePrice: inventoryItems.purchasePrice,
            supplierId: inventoryItems.supplierId,
            isAudited: inventoryItems.isAudited,
            auditFrequency: inventoryItems.auditFrequency,
            isComposite: inventoryItems.isComposite,
            bom: inventoryItems.bom,
            isActive: inventoryItems.isActive,
            createdAt: inventoryItems.createdAt,
            updatedAt: inventoryItems.updatedAt,
        }).from(inventoryItems);
        if (since) {
            itemsQuery = itemsQuery.where(sql`${inventoryItems.updatedAt} > ${since}`) as any;
        }
        const items = await itemsQuery.orderBy(asc(inventoryItems.name));

        let stocksQuery = db.select().from(inventoryStock);
        if (since) {
            stocksQuery = stocksQuery.where(sql`${inventoryStock.lastUpdated} > ${since}`) as any;
        }
        const stocks = await stocksQuery;

        const stockMap = new Map<string, { warehouseId: string; quantity: number }[]>();
        for (const stock of stocks) {
            const list = stockMap.get(stock.itemId) || [];
            list.push({ warehouseId: stock.warehouseId, quantity: Number(stock.quantity) || 0 });
            stockMap.set(stock.itemId, list);
        }

        const result = items.map((item) => ({
            id: item.id,
            name: item.name,
            name_ar: item.nameAr,
            sku: item.sku,
            barcode: item.barcode,
            unit: item.unit,
            category: item.category,
            threshold: Number(item.threshold) || 0,
            cost_price: Number(item.costPrice) || 0,
            purchase_price: Number(item.purchasePrice) || 0,
            supplier_id: item.supplierId,
            is_audited: item.isAudited ?? true,
            audit_frequency: item.auditFrequency ?? 'DAILY',
            is_composite: item.isComposite ?? false,
            bom: item.bom ?? [],
            is_active: item.isActive !== false,
            warehouseQuantities: stockMap.get(item.id) || [],
        }));

        res.json(result);
    } catch (error: any) {
        if (isForeignKeyDeleteError(error)) {
            return writeForeignKeyDeleteConflict(res, 'inventory item', ['inventory_ledger', 'inventory_stock', 'purchase_order_items', 'recipes']);
        }
        res.status(500).json({ error: error.message });
    }
};

export const zeroInventoryQuantities = async (req: Request, res: Response) => {
    try {
        const branchId = req.effectiveBranchId || getStringParam(req.body?.branchId);
        const warehouseId = getStringParam(req.body?.warehouseId);
        if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
        if (req.body?.confirmation !== 'ZERO_STOCK') {
            return res.status(400).json({ error: 'ZERO_STOCK_CONFIRMATION_REQUIRED' });
        }

        const scopedWarehouses = await db.select({ id: warehouses.id })
            .from(warehouses)
            .where(and(
                eq(warehouses.branchId, branchId),
                warehouseId ? eq(warehouses.id, warehouseId) : undefined,
            ));
        const warehouseIds = scopedWarehouses.map(row => row.id);
        if (!warehouseIds.length) return res.status(404).json({ error: 'WAREHOUSE_NOT_FOUND' });

        const affected = await db.select().from(inventoryStock)
            .where(inArray(inventoryStock.warehouseId, warehouseIds));
        const nonZero = affected.filter(row => Number(row.quantity || 0) !== 0);
        const actorId = req.user?.id || 'system';

        await db.transaction(async (tx) => {
            for (const row of nonZero) {
                await tx.update(inventoryStock)
                    .set({ quantity: 0, lastUpdated: new Date() })
                    .where(eq(inventoryStock.id, row.id));
                await tx.insert(stockMovements).values({
                    itemId: row.itemId,
                    fromWarehouseId: row.warehouseId,
                    quantity: Math.abs(Number(row.quantity || 0)),
                    type: 'ADJUSTMENT',
                    reason: 'Full stock quantity reset',
                    performedBy: actorId,
                    referenceId: `ZERO-STOCK-${Date.now()}`,
                    createdAt: new Date(),
                });
            }
            await tx.update(inventoryBatches)
                .set({ currentQty: 0, status: 'DEPLETED' })
                .where(inArray(inventoryBatches.warehouseId, warehouseIds));
        });

        await createSignedAuditLog({
            eventType: 'INVENTORY_QUANTITIES_ZEROED',
            userId: req.user?.id,
            branchId,
            payload: {
                warehouseId: warehouseId || null,
                affectedRows: nonZero.length,
                previousQuantity: nonZero.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
            },
        });
        getIO().to(`branch:${branchId}`).emit('stock:updated', { reset: true, branchId, warehouseId });
        res.json({ success: true, affectedRows: nonZero.length });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createInventoryItem = async (req: Request, res: Response) => {
    try {
        await ensureInventorySchema();
        const body = req.body || {};

        if (!body.name || !body.unit) {
            return res.status(400).json({ error: 'name and unit are required' });
        }
        const id = body.id || `INV-${Date.now()}`;
        const warehouseIds = Array.isArray(body.warehouse_ids)
            ? Array.from(new Set(body.warehouse_ids.map(String).filter(Boolean))) as string[]
            : [];
        if (warehouseIds.length) {
            const validWarehouses = await db.select({ id: warehouses.id }).from(warehouses).where(inArray(warehouses.id, warehouseIds));
            if (validWarehouses.length !== warehouseIds.length) {
                return res.status(400).json({ error: 'INVALID_WAREHOUSE_ASSIGNMENT' });
            }
        }

        const created = await db.transaction(async (tx) => {
            const [item] = await tx.insert(inventoryItems).output().values({
                id,
                name: body.name,
                nameAr: body.name_ar,
                sku: body.sku || id,
                barcode: body.barcode,
                unit: body.unit,
                category: body.category,
                threshold: body.threshold,
                costPrice: body.cost_price,
                purchasePrice: body.purchase_price,
                supplierId: body.supplier_id,
                isAudited: body.is_audited,
                auditFrequency: body.audit_frequency,
                isComposite: body.is_composite,
                bom: body.bom,
                isActive: body.is_active !== false,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            if (warehouseIds.length) {
                await tx.insert(inventoryStock).values(warehouseIds.map(warehouseId => ({
                    itemId: id,
                    warehouseId,
                    quantity: 0,
                    lastUpdated: new Date(),
                })));
            }
            return item;
        });

        res.status(201).json(created);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateInventoryItem = async (req: Request, res: Response) => {
    try {
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'ITEM_ID_REQUIRED' });
        const body = req.body || {};
        const warehouseIds = Array.isArray(body.warehouse_ids)
            ? Array.from(new Set(body.warehouse_ids.map(String).filter(Boolean))) as string[]
            : null;
        if (warehouseIds?.length) {
            const validWarehouses = await db.select({ id: warehouses.id }).from(warehouses).where(inArray(warehouses.id, warehouseIds));
            if (validWarehouses.length !== warehouseIds.length) {
                return res.status(400).json({ error: 'INVALID_WAREHOUSE_ASSIGNMENT' });
            }
        }

        const updates: Record<string, any> = { updatedAt: new Date() };
        if (body.name !== undefined) updates.name = body.name;
        if (body.name_ar !== undefined) updates.nameAr = body.name_ar;
        if (body.sku !== undefined) updates.sku = body.sku;
        if (body.barcode !== undefined) updates.barcode = body.barcode;
        if (body.unit !== undefined) updates.unit = body.unit;
        if (body.category !== undefined) updates.category = body.category;
        if (body.threshold !== undefined) updates.threshold = body.threshold;
        if (body.cost_price !== undefined) updates.costPrice = body.cost_price;
        if (body.purchase_price !== undefined) updates.purchasePrice = body.purchase_price;
        if (body.supplier_id !== undefined) updates.supplierId = body.supplier_id;
        if (body.is_audited !== undefined) updates.isAudited = body.is_audited;
        if (body.audit_frequency !== undefined) updates.auditFrequency = body.audit_frequency;
        if (body.is_composite !== undefined) updates.isComposite = body.is_composite;
        if (body.bom !== undefined) updates.bom = body.bom;
        if (body.is_active !== undefined) updates.isActive = body.is_active;

        const updated = await db.transaction(async (tx) => {
            const [item] = await tx.update(inventoryItems)
                .set(updates)
                .output()
                .where(eq(inventoryItems.id, id));
            if (!item || warehouseIds === null) return item;

            const currentStocks = await tx.select().from(inventoryStock).where(eq(inventoryStock.itemId, id));
            const selected = new Set(warehouseIds);
            const removed = currentStocks.filter(stock => !selected.has(stock.warehouseId));
            if (removed.some(stock => Number(stock.quantity || 0) !== 0)) {
                throw new Error('WAREHOUSE_STOCK_NOT_EMPTY');
            }
            for (const stock of removed) {
                await tx.delete(inventoryStock).where(eq(inventoryStock.id, stock.id));
            }

            const existingWarehouseIds = new Set(currentStocks.map(stock => stock.warehouseId));
            const added = warehouseIds.filter(warehouseId => !existingWarehouseIds.has(warehouseId));
            if (added.length) {
                await tx.insert(inventoryStock).values(added.map(warehouseId => ({
                    itemId: id,
                    warehouseId,
                    quantity: 0,
                    lastUpdated: new Date(),
                })));
            }
            return item;
        });

        if (!updated) {
            return res.status(404).json({ error: 'Inventory item not found' });
        }

        const userId = (req as any).user?.id || 'system';
        await createSignedAuditLog({
            eventType: 'INVENTORY_ITEM_UPDATED',
            userId: userId,
            branchId: null,
            payload: { itemId: id, updates: updates },
            reason: 'Inventory item parameters updated',
            sourceDevice: req.headers['user-agent'] || 'unknown',
            requestId: req.headers['x-request-id'] as string || `req-${Date.now()}`
        });

        res.json(updated);
    } catch (error: any) {
        if (error?.message === 'WAREHOUSE_STOCK_NOT_EMPTY') {
            return res.status(409).json({
                error: 'WAREHOUSE_STOCK_NOT_EMPTY',
                message: 'Transfer or zero the warehouse quantity before removing the item assignment',
            });
        }
        res.status(500).json({ error: error.message });
    }
};

export const deleteInventoryItem = async (req: Request, res: Response) => {
    try {
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'ITEM_ID_REQUIRED' });
        const [deleted] = await db.update(inventoryItems)
            .set({ isActive: false, deletedAt: new Date(), updatedAt: new Date() })
            .output()
            .where(eq(inventoryItems.id, id));
        if (!deleted) return res.status(404).json({ error: 'Inventory item not found' });
        res.json({ message: 'Inventory item archived', item: deleted });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Stock Adjustments
 */
export const updateStock = async (req: Request, res: Response) => {
    try {
        const { item_id, warehouse_id, quantity, type, reason, actor_id, reference_id } = req.body || {};

        if (!item_id || !warehouse_id || quantity === undefined) {
            return res.status(400).json({ error: 'item_id, warehouse_id, and quantity are required' });
        }

        const newQty = Number(quantity);
        if (!Number.isFinite(newQty)) {
            return res.status(400).json({ error: 'quantity must be a number' });
        }
        if (newQty < 0) {
            return res.status(400).json({ error: 'quantity cannot be negative' });
        }

        // Idempotency guard for offline replay: if this reference is already applied, do not apply twice.
        if (reference_id) {
            const [existingMovement] = await db
                .select()
                .top(1)
                .from(stockMovements)
                .where(eq(stockMovements.referenceId, String(reference_id)));
            if (existingMovement) {
                const [currentStock] = await db.select().from(inventoryStock).where(
                    and(eq(inventoryStock.itemId, item_id), eq(inventoryStock.warehouseId, warehouse_id))
                );
                const currentQty = Number(currentStock?.quantity || 0);
                return res.json({
                    success: true,
                    idempotentReplay: true,
                    referenceId: reference_id,
                    previousQuantity: currentQty,
                    newQuantity: currentQty,
                    delta: 0,
                });
            }
        }

        const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, item_id));
        const [warehouse] = await db.select().from(warehouses).where(eq(warehouses.id, warehouse_id));
        if (!item) return res.status(404).json({ error: 'INVENTORY_ITEM_NOT_FOUND', message: 'Inventory item not found' });
        if (!warehouse) return res.status(404).json({ error: 'WAREHOUSE_NOT_FOUND', message: 'Warehouse not found' });
        const [existing] = await db.select().from(inventoryStock).where(
            and(eq(inventoryStock.itemId, item_id), eq(inventoryStock.warehouseId, warehouse_id))
        );

        const previousQty = Number(existing?.quantity || 0);
        const delta = newQty - previousQty;
        const value = Math.abs(delta) * Number(item?.costPrice || 0);

        if (delta !== 0) {
            await db.transaction(async (tx) => {
                if (delta < 0) {
                    await inventoryService.deductInventoryFEFO(
                        tx,
                        item_id,
                        warehouse_id,
                        Math.abs(delta),
                        reference_id || `ADJ-${Date.now()}`,
                        reason || 'Cycle Count Decrease',
                        { movementType: type || 'ADJUSTMENT', performedBy: actor_id },
                    );
                } else if (delta > 0) {
                    if (existing) {
                        await tx.update(inventoryStock)
                            .set({ quantity: newQty, lastUpdated: new Date() })
                            .where(eq(inventoryStock.id, existing.id));
                    } else {
                        await tx.insert(inventoryStock).values({
                            itemId: item_id,
                            warehouseId: warehouse_id,
                            quantity: newQty,
                            lastUpdated: new Date(),
                        });
                    }

                    await tx.insert(stockMovements).values({
                        itemId: item_id,
                        toWarehouseId: warehouse_id,
                        quantity: delta,
                        type: type || 'ADJUSTMENT',
                        reason: reason || 'Cycle Count Increase',
                        performedBy: actor_id,
                        referenceId: reference_id,
                        createdAt: new Date(),
                    });

                    const expiryDate = new Date();
                    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

                    await tx.insert(inventoryBatches).values({
                        id: `BATCH-ADJ-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                        itemId: item_id,
                        warehouseId: warehouse_id,
                        batchNumber: `ADJ-FOUND-${Date.now()}`,
                        expiryDate,
                        receivedDate: new Date(),
                        initialQty: delta,
                        currentQty: delta,
                        unitCost: Number(item?.costPrice || 0),
                        status: 'ACTIVE',
                        createdAt: new Date(),
                    });
                }
                
                // 3. Log Audit
                await tx.insert(auditLogs).values({
                    eventType: 'INVENTORY_STOCK_ADJUSTMENT',
                    userId: actor_id || null,
                    branchId: null,
                    payload: {
                        itemId: item_id,
                        warehouseId: warehouse_id,
                        previousQuantity: previousQty,
                        newQuantity: newQty,
                        delta,
                        type: type || 'ADJUSTMENT',
                        reason: reason || null,
                        referenceId: reference_id || null,
                    },
                    createdAt: new Date(),
                });
            });

            const postingData = {
                referenceId: reference_id || `INV-${Date.now()}`,
                amount: value,
                branchId: warehouse?.branchId || undefined,
                userId: actor_id || 'system',
                reason: reason || null,
            };
            if (value > 0) {
                if (delta < 0) {
                    postInventoryAdjustmentEntry(postingData).catch(() => undefined);
                } else {
                    postInventoryAdjustmentReversalEntry(postingData).catch(() => undefined);
                }
            }
        }

        try {
            const [finalStock] = await db.select().from(inventoryStock).where(
                and(eq(inventoryStock.itemId, item_id), eq(inventoryStock.warehouseId, warehouse_id))
            );
            const [warehouse] = await db.select({ branchId: warehouses.branchId }).from(warehouses).where(eq(warehouses.id, warehouse_id));
            const branchRoom = warehouse?.branchId ? `branch:${warehouse.branchId}` : null;
            if (branchRoom) {
                getIO().to(branchRoom).emit('stock:updated', {
                    itemId: item_id,
                    warehouseId: warehouse_id,
                    quantity: Number(finalStock?.quantity || 0),
                    type: type || 'ADJUSTMENT'
                });
            }
        } catch (e) {
            console.warn('Failed to emit stock:updated socket event', e);
        }

        res.json({ success: true, previousQuantity: previousQty, newQuantity: newQty, delta });
    } catch (error: any) {
        if (isForeignKeyDeleteError(error)) {
            return writeForeignKeyDeleteConflict(res, 'stock adjustment', ['inventory_items', 'warehouses']);
        }
        res.status(500).json({ error: error.message });
    }
};

export const receiveStockDirect = async (req: Request, res: Response) => {
    const { warehouse_id, supplier_id, reference_id, actor_id, items } = req.body;
    const scope = 'DIRECT_STOCK_RECEIPT';
    const requestHash = buildRequestHash({ warehouse_id, supplier_id, items });
    const now = new Date();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    let ownsClaim = false;

    try {
        const [existingClaim] = await db.select().top(1).from(idempotencyKeys).where(and(
            eq(idempotencyKeys.key, reference_id),
            eq(idempotencyKeys.scope, scope),
        ));
        if (existingClaim && existingClaim.expiresAt <= now) {
            await db.delete(idempotencyKeys).where(and(
                eq(idempotencyKeys.key, reference_id),
                eq(idempotencyKeys.scope, scope),
                lt(idempotencyKeys.expiresAt, now),
            ));
        } else if (existingClaim) {
            if (existingClaim.requestHash !== requestHash) {
                return res.status(409).json({ error: 'IDEMPOTENCY_KEY_PAYLOAD_CONFLICT' });
            }
            if (existingClaim.status === 'COMPLETED') {
                return res.json({ success: true, referenceId: reference_id, idempotentReplay: true });
            }
            return res.status(409).json({ error: 'IDEMPOTENCY_KEY_IN_PROGRESS' });
        }

        try {
            await db.insert(idempotencyKeys).values({
                key: reference_id,
                scope,
                requestHash,
                status: 'IN_PROGRESS',
                expiresAt,
                updatedAt: new Date(),
            });
            ownsClaim = true;
        } catch {
            return res.status(409).json({ error: 'IDEMPOTENCY_KEY_IN_PROGRESS' });
        }

        const [warehouse] = await db.select().top(1).from(warehouses).where(eq(warehouses.id, warehouse_id));
        if (!warehouse) throw new Error('WAREHOUSE_NOT_FOUND');

        const results = await db.transaction(async (tx) => {
            const receiptResults = [];
            for (const receiptItem of items as Array<{ item_id: string; quantity: number; unit_cost: number }>) {
                const [item] = await tx.select().top(1).from(inventoryItems).where(eq(inventoryItems.id, receiptItem.item_id));
                if (!item) throw new Error(`INVENTORY_ITEM_NOT_FOUND:${receiptItem.item_id}`);

                const currentStocks = await tx.select().from(inventoryStock).where(eq(inventoryStock.itemId, receiptItem.item_id));
                const oldTotalQty = currentStocks.reduce((sum, stock) => sum + Number(stock.quantity || 0), 0);
                const quantity = Number(receiptItem.quantity);
                const unitCost = Number(receiptItem.unit_cost);
                const newTotalQty = oldTotalQty + quantity;
                const newAverageCost = ((oldTotalQty * Number(item.costPrice || 0)) + (quantity * unitCost)) / newTotalQty;
                const [warehouseStock] = currentStocks.filter(stock => stock.warehouseId === warehouse_id);
                const newWarehouseQty = Number(warehouseStock?.quantity || 0) + quantity;
                if (warehouseStock) {
                    await tx.update(inventoryStock).set({
                        quantity: sql`${inventoryStock.quantity} + ${quantity}`,
                        lastUpdated: new Date(),
                    }).where(eq(inventoryStock.id, warehouseStock.id));
                } else {
                    await tx.insert(inventoryStock).values({
                        itemId: receiptItem.item_id,
                        warehouseId: warehouse_id,
                        quantity,
                        lastUpdated: new Date(),
                    });
                }

                await tx.update(inventoryItems).set({
                    costPrice: newAverageCost,
                    purchasePrice: unitCost,
                    updatedAt: new Date(),
                }).where(eq(inventoryItems.id, receiptItem.item_id));

                await tx.insert(stockMovements).values({
                    itemId: receiptItem.item_id,
                    toWarehouseId: warehouse_id,
                    quantity,
                    unitCost,
                    totalCost: quantity * unitCost,
                    type: 'PURCHASE',
                    referenceId: reference_id,
                    reason: 'Direct stock receipt',
                    performedBy: actor_id || 'system',
                    createdAt: new Date(),
                });

                const expiryDate = new Date();
                expiryDate.setFullYear(expiryDate.getFullYear() + 1);
                await tx.insert(inventoryBatches).values({
                    id: `BATCH-DIRECT-${crypto.randomUUID()}`,
                    itemId: receiptItem.item_id,
                    warehouseId: warehouse_id,
                    batchNumber: `${reference_id}-${receiptItem.item_id}`,
                    expiryDate,
                    receivedDate: new Date(),
                    initialQty: quantity,
                    currentQty: quantity,
                    unitCost,
                    supplierId: supplier_id || null,
                    status: 'ACTIVE',
                    createdAt: new Date(),
                });

                receiptResults.push({
                    itemId: receiptItem.item_id,
                    quantity: newWarehouseQty,
                    totalQuantity: newTotalQty,
                    costPrice: newAverageCost,
                    purchasePrice: unitCost,
                });
            }

            await tx.update(idempotencyKeys).set({
                status: 'COMPLETED',
                responseCode: 200,
                resourceId: reference_id,
                responseBody: JSON.stringify({ success: true, referenceId: reference_id, items: receiptResults }),
                expiresAt,
                updatedAt: new Date(),
            }).where(and(
                eq(idempotencyKeys.key, reference_id),
                eq(idempotencyKeys.scope, scope),
            ));

            return receiptResults;
        });
        ownsClaim = false;

        try {
            if (warehouse.branchId) {
                for (const item of results) {
                    getIO().to(`branch:${warehouse.branchId}`).emit('stock:updated', {
                        itemId: item.itemId,
                        warehouseId: warehouse_id,
                        quantity: item.quantity,
                        type: 'PURCHASE',
                    });
                }
            }
        } catch {
            // Socket delivery is best-effort; reconnect resync remains authoritative.
        }

        return res.json({ success: true, referenceId: reference_id, items: results });
    } catch (error: any) {
        if (ownsClaim) {
            await db.delete(idempotencyKeys).where(and(
                eq(idempotencyKeys.key, reference_id),
                eq(idempotencyKeys.scope, scope),
            ));
        }
        return res.status(500).json({ error: error.message });
    }
};

/**
 * Transfer stock between warehouses (transactional)
 */
export const transferStock = async (req: Request, res: Response) => {
    try {
        const {
            item_id,
            from_warehouse_id,
            to_warehouse_id,
            quantity,
            reason,
            actor_id,
            reference_id,
        } = req.body || {};

        if (!item_id || !from_warehouse_id || !to_warehouse_id || quantity === undefined) {
            return res.status(400).json({ error: 'item_id, from_warehouse_id, to_warehouse_id, and quantity are required' });
        }
        if (from_warehouse_id === to_warehouse_id) {
            return res.status(400).json({ error: 'Source and destination warehouses must be different' });
        }

        const transferQty = Number(quantity);
        if (!Number.isFinite(transferQty) || transferQty <= 0) {
            return res.status(400).json({ error: 'quantity must be a positive number' });
        }

        // Idempotency guard for offline replay.
        if (reference_id) {
            const [existingTransfer] = await db.select().top(1).from(stockMovements).where(
                and(
                    eq(stockMovements.referenceId, String(reference_id)),
                    eq(stockMovements.type, 'TRANSFER')
                )
            );
            if (existingTransfer) {
                return res.json({
                    success: true,
                    idempotentReplay: true,
                    referenceId: reference_id,
                });
            }
        }

        await db.transaction(async (tx) => {
            const [sourceWarehouse] = await tx.select().from(warehouses).where(eq(warehouses.id, from_warehouse_id));
            const [destWarehouse] = await tx.select().from(warehouses).where(eq(warehouses.id, to_warehouse_id));
            if (!sourceWarehouse || !destWarehouse) {
                throw new Error('Warehouse not found');
            }

            const [sourceStock] = await tx.select().from(inventoryStock).where(
                and(eq(inventoryStock.itemId, item_id), eq(inventoryStock.warehouseId, from_warehouse_id))
            );
            const sourceQty = Number(sourceStock?.quantity || 0);
            if (sourceQty < transferQty) {
                throw new Error('Insufficient stock in source warehouse');
            }

            const [deductedSourceStock] = await tx.update(inventoryStock)
                .set({
                    quantity: sql`${inventoryStock.quantity} - ${transferQty}`,
                    lastUpdated: new Date(),
                })
                .output()
                .where(
                    and(
                        eq(inventoryStock.id, sourceStock.id),
                        sql`${inventoryStock.quantity} >= ${transferQty}`
                    )
                );

            if (!deductedSourceStock) {
                throw new Error('Insufficient stock in source warehouse');
            }

            const [destStock] = await tx.select().from(inventoryStock).where(
                and(eq(inventoryStock.itemId, item_id), eq(inventoryStock.warehouseId, to_warehouse_id))
            );

            if (destStock) {
                await tx.update(inventoryStock)
                    .set({
                        quantity: sql`${inventoryStock.quantity} + ${transferQty}`,
                        lastUpdated: new Date(),
                    })
                    .where(eq(inventoryStock.id, destStock.id));
            } else {
                await tx.insert(inventoryStock).values({
                    itemId: item_id,
                    warehouseId: to_warehouse_id,
                    quantity: transferQty,
                    lastUpdated: new Date(),
                });
            }

            await tx.insert(stockMovements).values({
                itemId: item_id,
                fromWarehouseId: from_warehouse_id,
                toWarehouseId: to_warehouse_id,
                quantity: transferQty,
                type: 'TRANSFER',
                reason: reason || 'Inter-warehouse transfer',
                performedBy: actor_id,
                referenceId: reference_id,
                createdAt: new Date(),
            });

            const [fromWarehouse] = await tx.select({ branchId: warehouses.branchId }).from(warehouses).where(eq(warehouses.id, from_warehouse_id));
            await tx.insert(auditLogs).values({
                eventType: 'INVENTORY_BRANCH_TRANSFER',
                userId: actor_id || null,
                branchId: fromWarehouse?.branchId || null,
                payload: {
                    itemId: item_id,
                    fromWarehouseId: from_warehouse_id,
                    toWarehouseId: to_warehouse_id,
                    quantity: transferQty,
                    reason: reason || 'Inter-warehouse transfer',
                    referenceId: reference_id || null,
                },
                createdAt: new Date(),
            });
        });

        try {
            const [sourceStock] = await db.select().from(inventoryStock).where(
                and(eq(inventoryStock.itemId, item_id), eq(inventoryStock.warehouseId, from_warehouse_id))
            );
            const [destStock] = await db.select().from(inventoryStock).where(
                and(eq(inventoryStock.itemId, item_id), eq(inventoryStock.warehouseId, to_warehouse_id))
            );
            const [sourceWh] = await db.select({ branchId: warehouses.branchId }).from(warehouses).where(eq(warehouses.id, from_warehouse_id));
            const [destWh] = await db.select({ branchId: warehouses.branchId }).from(warehouses).where(eq(warehouses.id, to_warehouse_id));

            if (sourceWh?.branchId) {
                getIO().to(`branch:${sourceWh.branchId}`).emit('stock:updated', {
                    itemId: item_id,
                    warehouseId: from_warehouse_id,
                    quantity: Number(sourceStock?.quantity || 0),
                    type: 'TRANSFER'
                });
            }
            if (destWh?.branchId && destWh.branchId !== sourceWh?.branchId) {
                getIO().to(`branch:${destWh.branchId}`).emit('stock:updated', {
                    itemId: item_id,
                    warehouseId: to_warehouse_id,
                    quantity: Number(destStock?.quantity || 0),
                    type: 'TRANSFER'
                });
            } else if (destWh?.branchId) {
                // Same branch, just different warehouse
                getIO().to(`branch:${destWh.branchId}`).emit('stock:updated', {
                    itemId: item_id,
                    warehouseId: to_warehouse_id,
                    quantity: Number(destStock?.quantity || 0),
                    type: 'TRANSFER'
                });
            }
        } catch (e) {
            console.warn('Failed to emit stock:updated socket event for transfer', e);
        }

        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Get latest transfer movements
 */
export const getTransferMovements = async (req: Request, res: Response) => {
    try {
        const limit = Number(req.query.limit || 100);
        const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 100;

        const [movements, itemList, warehouseList] = await Promise.all([
            db.select()
                .from(stockMovements)
                .where(eq(stockMovements.type, 'TRANSFER'))
                .orderBy(desc(stockMovements.createdAt))
                .offset(0).fetch(safeLimit),
            db.select({ id: inventoryItems.id, name: inventoryItems.name }).from(inventoryItems),
            db.select({ id: warehouses.id, name: warehouses.name, branchId: warehouses.branchId }).from(warehouses),
        ]);

        const itemMap = new Map(itemList.map((i) => [i.id, i.name]));
        const warehouseMap = new Map(warehouseList.map((w) => [w.id, w]));

        const result = movements.map((m) => {
            const fromWh = m.fromWarehouseId ? warehouseMap.get(m.fromWarehouseId) : null;
            const toWh = m.toWarehouseId ? warehouseMap.get(m.toWarehouseId) : null;
            return {
                id: m.id,
                itemId: m.itemId,
                itemName: itemMap.get(m.itemId) || m.itemId,
                fromWarehouseId: m.fromWarehouseId,
                fromWarehouseName: fromWh?.name || m.fromWarehouseId,
                fromBranchId: fromWh?.branchId,
                toWarehouseId: m.toWarehouseId,
                toWarehouseName: toWh?.name || m.toWarehouseId,
                toBranchId: toWh?.branchId,
                quantity: Number(m.quantity || 0),
                reason: m.reason,
                performedBy: m.performedBy,
                createdAt: m.createdAt,
                referenceId: m.referenceId,
            };
        });

        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Recipe/item consumption caused by sales deduction.
 */
export const getRecipeConsumption = async (req: Request, res: Response) => {
    try {
        const attachCurrentStock = async (sourceRows: any[]) => {
            const itemIds = Array.from(new Set(sourceRows.map((row) => row.itemId).filter(Boolean))) as string[];
            const branchIds = Array.from(new Set(sourceRows.map((row) => row.branchId).filter(Boolean))) as string[];
            if (itemIds.length === 0 || branchIds.length === 0) {
                return sourceRows.map((row) => ({ ...row, currentStock: 0 }));
            }
            const stocks = await db
                .select({
                    itemId: inventoryStock.itemId,
                    branchId: warehouses.branchId,
                    quantity: sql<number>`coalesce(sum(${inventoryStock.quantity}), 0)`,
                })
                .from(inventoryStock)
                .innerJoin(warehouses, eq(warehouses.id, inventoryStock.warehouseId))
                .where(and(
                    inArray(inventoryStock.itemId, itemIds),
                    inArray(warehouses.branchId, branchIds),
                ))
                .groupBy(inventoryStock.itemId, warehouses.branchId);
            const stockByItemBranch = new Map(stocks.map((stock) => [
                `${stock.itemId}:${stock.branchId}`,
                Number(stock.quantity || 0),
            ]));
            return sourceRows.map((row) => ({
                ...row,
                currentStock: stockByItemBranch.get(`${row.itemId}:${row.branchId}`) || 0,
            }));
        };
        const limit = Number(req.query.limit || 100);
        const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 100;
        const dateRange = req.query.startDate && req.query.endDate
            ? parseLocalDateRange(String(req.query.startDate), String(req.query.endDate))
            : null;

        const conditions: any[] = [eq(stockMovements.type, 'SALE_CONSUMPTION')];
        if (dateRange) conditions.push(gte(stockMovements.createdAt, dateRange.start));
        if (dateRange) conditions.push(lte(stockMovements.createdAt, dateRange.end));
        if (req.effectiveBranchId) conditions.push(eq(warehouses.branchId, req.effectiveBranchId));

        const rows = await db
            .select({
                itemId: stockMovements.itemId,
                itemName: inventoryItems.name,
                itemNameAr: inventoryItems.nameAr,
                unit: inventoryItems.unit,
                warehouseId: stockMovements.fromWarehouseId,
                warehouseName: warehouses.name,
                branchId: warehouses.branchId,
                totalQuantity: sql<number>`coalesce(sum(${stockMovements.quantity}), 0)`,
                movementCount: sql<number>`count(*)`,
                estimatedCost: sql<number>`coalesce(sum(${stockMovements.quantity} * coalesce(${inventoryItems.costPrice}, 0)), 0)`,
                lastConsumedAt: sql<Date>`max(${stockMovements.createdAt})`,
                lastReferenceId: sql<string>`coalesce(max(${stockMovements.referenceId}), '')`,
            })
            .from(stockMovements)
            .leftJoin(inventoryItems, eq(inventoryItems.id, stockMovements.itemId))
            .leftJoin(warehouses, eq(warehouses.id, stockMovements.fromWarehouseId))
            .where(and(...conditions))
            .groupBy(
                stockMovements.itemId,
                inventoryItems.name,
                inventoryItems.nameAr,
                inventoryItems.unit,
                stockMovements.fromWarehouseId,
                warehouses.name,
                warehouses.branchId,
            )
            .orderBy(desc(sql`coalesce(sum(${stockMovements.quantity}), 0)`))
            .offset(0).fetch(safeLimit);

        if (rows.length === 0) {
            const orderConditions: any[] = [
                gte(orders.createdAt, dateRange?.start || new Date(0)),
                lte(orders.createdAt, dateRange?.end || new Date()),
                sql`${orders.status} not in ('CANCELLED', 'VOID', 'REFUNDED')`,
            ];
            if (req.effectiveBranchId) orderConditions.push(eq(orders.branchId, req.effectiveBranchId));

            const [warehouse] = await db
                .select({ id: warehouses.id, name: warehouses.name, branchId: warehouses.branchId })
                .from(warehouses)
                .where(req.effectiveBranchId ? eq(warehouses.branchId, req.effectiveBranchId) : sql`true`)
                .orderBy(desc(warehouses.type))
                .offset(0).fetch(1);

            const theoreticalRows = await db
                .select({
                    itemId: recipeIngredients.inventoryItemId,
                    itemName: inventoryItems.name,
                    itemNameAr: inventoryItems.nameAr,
                    unit: recipeIngredients.unit,
                    totalQuantity: sql<number>`coalesce(sum(${orderItems.quantity} * ${recipeIngredients.quantity} / coalesce(${recipes.yield}, 1)), 0)`,
                    movementCount: sql<number>`count(distinct ${orders.id})`,
                    estimatedCost: sql<number>`coalesce(sum(${orderItems.quantity} * ${recipeIngredients.quantity} / coalesce(${recipes.yield}, 1) * coalesce(${inventoryItems.costPrice}, 0)), 0)`,
                    lastConsumedAt: sql<Date>`max(${orders.createdAt})`,
                    lastReferenceId: sql<string>`coalesce(max(${orders.id}), '')`,
                })
                .from(orderItems)
                .innerJoin(orders, eq(orderItems.orderId, orders.id))
                .innerJoin(recipes, eq(orderItems.menuItemId, recipes.menuItemId))
                .innerJoin(recipeIngredients, eq(recipes.id, recipeIngredients.recipeId))
                .innerJoin(inventoryItems, eq(recipeIngredients.inventoryItemId, inventoryItems.id))
                .where(and(...orderConditions))
                .groupBy(recipeIngredients.inventoryItemId, inventoryItems.name, inventoryItems.nameAr, recipeIngredients.unit)
                .orderBy(desc(sql`coalesce(sum(${orderItems.quantity} * ${recipeIngredients.quantity} / coalesce(${recipes.yield}, 1)), 0)`))
                .offset(0).fetch(safeLimit);

            const theoreticalResult = theoreticalRows.map((row) => ({
                ...row,
                warehouseId: warehouse?.id || null,
                warehouseName: warehouse?.name || null,
                branchId: warehouse?.branchId || req.effectiveBranchId || null,
                totalQuantity: Number(row.totalQuantity || 0),
                movementCount: Number(row.movementCount || 0),
                estimatedCost: Number(row.estimatedCost || 0),
                source: 'THEORETICAL',
            }));
            return res.json(await attachCurrentStock(theoreticalResult));
        }

        const actualResult = rows.map((row) => ({
            ...row,
            totalQuantity: Number(row.totalQuantity || 0),
            movementCount: Number(row.movementCount || 0),
            estimatedCost: Number(row.estimatedCost || 0),
            source: 'ACTUAL',
        }));
        res.json(await attachCurrentStock(actualResult));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
/**
 * Get all inventory batches (FEFO view)
 */
export const getInventoryBatches = async (req: Request, res: Response) => {
    try {
        const { itemId, warehouseId, status } = req.query;
        const conditions = [];
        
        if (itemId) conditions.push(eq(inventoryBatches.itemId, itemId as string));
        if (warehouseId) conditions.push(eq(inventoryBatches.warehouseId, warehouseId as string));
        if (status) conditions.push(eq(inventoryBatches.status, status as string));

        let query = db.select().from(inventoryBatches);
        if (conditions.length > 0) {
            // @ts-ignore
            query = query.where(and(...conditions));
        }

        const batches = await query.orderBy(asc(inventoryBatches.expiryDate));
        
        // Enrich with item names
        const itemList = await db.select({ id: inventoryItems.id, name: inventoryItems.name }).from(inventoryItems);
        const itemMap = new Map(itemList.map(i => [i.id, i.name]));

        const result = batches.map(b => ({
            ...b,
            itemName: itemMap.get(b.itemId) || b.itemId,
            daysToExpiry: Math.ceil((new Date(b.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        }));

        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
