import { Request, Response } from 'express';
import crypto from 'node:crypto';
import { db, pool } from '../db';
import { inventoryItems, inventoryStock, stockMovements, warehouses, auditLogs, orders, orderItems, recipes, recipeIngredients, idempotencyKeys, stockCounts, stockCountLines } from '../../src/db/schema';
import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import { getStringParam } from '../utils/request';
import { isForeignKeyDeleteError, writeForeignKeyDeleteConflict } from '../utils/dbErrors';
import { postInventoryAdjustmentEntry, postInventoryAdjustmentReversalEntry, postPurchaseReceiptEntry, postWastageEntry } from '../services/financePostingService';
import { getIO } from '../socket';
import { inventoryBatches } from '../../src/db/schema';
import { inventoryService } from '../services/inventoryService';
import { createSignedAuditLog } from '../services/auditService';
import { buildRequestHash } from '../services/idempotencyService';
import { parseLocalDateRange } from './report/reportUtils';

let inventorySchemaReady = false;

// inventory_items.bom is nvarchar — the driver returns a string and coerces
// written arrays via String(), which corrupts object arrays into "[object Object]".
// Always serialize to JSON on write and parse on read.
const parseBom = (value: unknown): any[] => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        try {
            const parsed = JSON.parse(value.trim());
            return Array.isArray(parsed) ? parsed : [];
        } catch { return []; }
    }
    return [];
};

const serializeBom = (value: unknown): string => JSON.stringify(parseBom(value));

const ensureInventorySchema = async () => {
    if (inventorySchemaReady) return;
    await pool.query(`
        IF OBJECT_ID('uq_inventory_items_sku', 'UQ') IS NOT NULL
            ALTER TABLE inventory_items DROP CONSTRAINT uq_inventory_items_sku;
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_inventory_items_sku_not_null' AND object_id = OBJECT_ID('inventory_items'))
            CREATE UNIQUE INDEX idx_inventory_items_sku_not_null ON inventory_items(sku) WHERE sku IS NOT NULL;
    `);
    await pool.query(`
        IF COL_LENGTH('inventory_items', 'purchase_unit') IS NULL
            ALTER TABLE inventory_items ADD purchase_unit nvarchar(max) NULL;
    `);
    await pool.query(`
        IF COL_LENGTH('inventory_items', 'purchase_unit_factor') IS NULL
            ALTER TABLE inventory_items ADD purchase_unit_factor real NULL;
        IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'df_inventory_items_purchase_unit_factor')
            ALTER TABLE inventory_items ADD CONSTRAINT df_inventory_items_purchase_unit_factor DEFAULT 1 FOR purchase_unit_factor;
    `);
    await pool.query(`
        UPDATE inventory_items SET purchase_unit_factor = 1
        WHERE purchase_unit_factor IS NULL OR purchase_unit_factor <= 0;
    `);
    await pool.query(`
        IF OBJECT_ID('dbo.stock_transfer_requests', 'U') IS NULL
        CREATE TABLE dbo.stock_transfer_requests (
            id nvarchar(255) NOT NULL PRIMARY KEY,
            request_branch_id nvarchar(255) NOT NULL,
            source_warehouse_id nvarchar(255) NULL,
            destination_warehouse_id nvarchar(255) NOT NULL,
            status nvarchar(50) NOT NULL DEFAULT 'REQUESTED',
            priority nvarchar(50) NULL,
            notes nvarchar(max) NULL,
            requested_by nvarchar(255) NULL,
            approved_by nvarchar(255) NULL,
            dispatched_by nvarchar(255) NULL,
            received_by nvarchar(255) NULL,
            requested_at datetime2 NOT NULL DEFAULT GETDATE(),
            approved_at datetime2 NULL,
            dispatched_at datetime2 NULL,
            received_at datetime2 NULL,
            updated_at datetime2 NOT NULL DEFAULT GETDATE()
        );
        IF OBJECT_ID('dbo.stock_transfer_request_items', 'U') IS NULL
        CREATE TABLE dbo.stock_transfer_request_items (
            id int IDENTITY(1,1) NOT NULL PRIMARY KEY,
            request_id nvarchar(255) NOT NULL,
            item_id nvarchar(255) NOT NULL,
            requested_qty real NOT NULL,
            approved_qty real NULL,
            dispatched_qty real NULL,
            received_qty real NULL,
            unit nvarchar(50) NULL
        );
        IF OBJECT_ID('dbo.stock_transfer_reservations', 'U') IS NULL
        CREATE TABLE dbo.stock_transfer_reservations (
            id int IDENTITY(1,1) NOT NULL PRIMARY KEY,
            request_id nvarchar(255) NOT NULL,
            item_id nvarchar(255) NOT NULL,
            source_warehouse_id nvarchar(255) NOT NULL,
            batch_id nvarchar(255) NULL,
            batch_number nvarchar(255) NULL,
            expiry_date datetime2 NULL,
            received_date datetime2 NULL,
            quantity real NOT NULL,
            unit_cost real NOT NULL DEFAULT 0,
            status nvarchar(50) NOT NULL DEFAULT 'RESERVED',
            created_at datetime2 NOT NULL DEFAULT GETDATE()
        );
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'stock_transfer_requests_status_idx' AND object_id = OBJECT_ID('dbo.stock_transfer_requests'))
            CREATE INDEX stock_transfer_requests_status_idx ON dbo.stock_transfer_requests(status, requested_at);
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'stock_transfer_reservations_request_idx' AND object_id = OBJECT_ID('dbo.stock_transfer_reservations'))
            CREATE INDEX stock_transfer_reservations_request_idx ON dbo.stock_transfer_reservations(request_id, status);
    `);
    inventorySchemaReady = true;
};

/**
 * Inventory Items
 */
export const getInventoryItems = async (req: Request, res: Response) => {
    try {
        await ensureInventorySchema();
        const since = req.query.since ? new Date(req.query.since as string) : null;
        
        let itemsQuery = db.select({
            id: inventoryItems.id,
            name: inventoryItems.name,
            nameAr: inventoryItems.nameAr,
            sku: inventoryItems.sku,
            barcode: inventoryItems.barcode,
            unit: inventoryItems.unit,
            purchaseUnit: inventoryItems.purchaseUnit,
            purchaseUnitFactor: inventoryItems.purchaseUnitFactor,
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
        const [items, scopedWarehouseRows] = await Promise.all([
            itemsQuery.orderBy(asc(inventoryItems.name)),
            req.effectiveBranchId
                ? db.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.branchId, req.effectiveBranchId))
                : Promise.resolve([]),
        ]);
        const scopedWarehouseIds = scopedWarehouseRows.map(row => row.id);
        let stocksQuery = db.select().from(inventoryStock);
        const stockConditions = [
            since ? sql`${inventoryStock.lastUpdated} > ${since}` : undefined,
            req.effectiveBranchId ? inArray(inventoryStock.warehouseId, scopedWarehouseIds) : undefined,
        ].filter(Boolean) as any[];
        if (stockConditions.length) stocksQuery = stocksQuery.where(and(...stockConditions)) as any;
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
            purchase_unit: item.purchaseUnit,
            purchase_unit_factor: Number(item.purchaseUnitFactor) > 0 ? Number(item.purchaseUnitFactor) : 1,
            category: item.category,
            threshold: Number(item.threshold) || 0,
            cost_price: Number(item.costPrice) || 0,
            purchase_price: Number(item.purchasePrice) || 0,
            supplier_id: item.supplierId,
            is_audited: item.isAudited ?? true,
            audit_frequency: item.auditFrequency ?? 'DAILY',
            is_composite: item.isComposite ?? false,
            bom: parseBom(item.bom),
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
                eq(warehouses.isActive, true),
                warehouseId ? eq(warehouses.id, warehouseId) : undefined,
            ));
        const warehouseIds = scopedWarehouses.map(row => row.id);
        if (!warehouseIds.length) return res.status(404).json({ error: 'WAREHOUSE_NOT_FOUND' });

        const affected = await db.select().from(inventoryStock)
            .where(inArray(inventoryStock.warehouseId, warehouseIds));
        const nonZero = affected.filter(row => Number(row.quantity || 0) !== 0);
        const itemRows = await db.select({ id: inventoryItems.id, costPrice: inventoryItems.costPrice }).from(inventoryItems);
        const costMap = new Map(itemRows.map(item => [item.id, Number(item.costPrice || 0)]));
        const resetValue = nonZero.reduce((sum, row) => sum + Math.abs(Number(row.quantity || 0)) * (costMap.get(row.itemId) || 0), 0);
        const actorId = req.user?.id || 'system';
        const resetReference = `ZERO-STOCK-${Date.now()}`;

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
                    referenceId: resetReference,
                    createdAt: new Date(),
                });
            }
            await tx.update(inventoryBatches)
                .set({ currentQty: 0, status: 'DEPLETED' })
                .where(inArray(inventoryBatches.warehouseId, warehouseIds));
        });

        const finance = resetValue > 0
            ? await postWastageEntry({ referenceId: resetReference, amount: resetValue, branchId, userId: actorId, reason: 'Full stock quantity reset' })
            : { status: 'skipped', reason: 'NO_STOCK_VALUE' };

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
        res.json({ success: true, affectedRows: nonZero.length, financeStatus: finance.status });
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
            const validWarehouses = await db.select({ id: warehouses.id, isActive: warehouses.isActive, branchId: warehouses.branchId }).from(warehouses).where(inArray(warehouses.id, warehouseIds));
            if (validWarehouses.length !== warehouseIds.length) {
                return res.status(400).json({ error: 'INVALID_WAREHOUSE_ASSIGNMENT' });
            }
            if (validWarehouses.some(warehouse => warehouse.isActive === false)) {
                return res.status(400).json({ error: 'INACTIVE_WAREHOUSE_ASSIGNMENT' });
            }
            if (req.effectiveBranchId && validWarehouses.some(warehouse => warehouse.branchId !== req.effectiveBranchId)) {
                return res.status(403).json({ error: 'BRANCH_MISMATCH' });
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
                purchaseUnit: body.purchase_unit || body.purchaseUnit || body.unit,
                purchaseUnitFactor: Number(body.purchase_unit_factor ?? body.purchaseUnitFactor ?? 1) > 0 ? Number(body.purchase_unit_factor ?? body.purchaseUnitFactor ?? 1) : 1,
                category: body.category,
                threshold: body.threshold,
                costPrice: body.cost_price,
                purchasePrice: body.purchase_price,
                supplierId: body.supplier_id,
                isAudited: body.is_audited,
                auditFrequency: body.audit_frequency,
                isComposite: body.is_composite,
                bom: serializeBom(body.bom),
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

        res.status(201).json(created ? { ...created, bom: parseBom((created as any).bom) } : created);
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
            const validWarehouses = await db.select({ id: warehouses.id, isActive: warehouses.isActive, branchId: warehouses.branchId }).from(warehouses).where(inArray(warehouses.id, warehouseIds));
            if (validWarehouses.length !== warehouseIds.length) {
                return res.status(400).json({ error: 'INVALID_WAREHOUSE_ASSIGNMENT' });
            }
            if (validWarehouses.some(warehouse => warehouse.isActive === false)) {
                return res.status(400).json({ error: 'INACTIVE_WAREHOUSE_ASSIGNMENT' });
            }
            if (req.effectiveBranchId && validWarehouses.some(warehouse => warehouse.branchId !== req.effectiveBranchId)) {
                return res.status(403).json({ error: 'BRANCH_MISMATCH' });
            }
        }

        const updates: Record<string, any> = { updatedAt: new Date() };
        if (body.name !== undefined) updates.name = body.name;
        if (body.name_ar !== undefined) updates.nameAr = body.name_ar;
        if (body.sku !== undefined) updates.sku = body.sku;
        if (body.barcode !== undefined) updates.barcode = body.barcode;
        if (body.unit !== undefined) updates.unit = body.unit;
        if (body.purchase_unit !== undefined || body.purchaseUnit !== undefined) updates.purchaseUnit = body.purchase_unit ?? body.purchaseUnit;
        if (body.purchase_unit_factor !== undefined || body.purchaseUnitFactor !== undefined) {
            const factor = Number(body.purchase_unit_factor ?? body.purchaseUnitFactor);
            updates.purchaseUnitFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
        }
        if (body.category !== undefined) updates.category = body.category;
        if (body.threshold !== undefined) updates.threshold = body.threshold;
        if (body.cost_price !== undefined) updates.costPrice = body.cost_price;
        if (body.purchase_price !== undefined) updates.purchasePrice = body.purchase_price;
        if (body.supplier_id !== undefined) updates.supplierId = body.supplier_id;
        if (body.is_audited !== undefined) updates.isAudited = body.is_audited;
        if (body.audit_frequency !== undefined) updates.auditFrequency = body.audit_frequency;
        if (body.is_composite !== undefined) updates.isComposite = body.is_composite;
        if (body.bom !== undefined) updates.bom = serializeBom(body.bom);
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

        res.json(updated ? { ...updated, bom: parseBom((updated as any).bom) } : updated);
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

        const [current] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
        if (!current) return res.status(404).json({ error: 'Inventory item not found' });
        if (current.isActive === false) {
            return res.json({ message: 'Inventory item already archived', item: current });
        }

        const stockRows = await db.select({ quantity: inventoryStock.quantity })
            .from(inventoryStock)
            .where(eq(inventoryStock.itemId, id));
        if (stockRows.some(row => Number(row.quantity || 0) !== 0)) {
            return res.status(409).json({
                error: 'INVENTORY_ITEM_HAS_STOCK',
                message: 'Zero or transfer all stock before archiving this item',
            });
        }

        const [ingredientLink] = await db.select({ id: recipeIngredients.id })
            .from(recipeIngredients)
            .where(eq(recipeIngredients.inventoryItemId, id))
            .top(1);
        const [recipeTargetLink] = await db.select({ id: recipes.id })
            .from(recipes)
            .where(eq(recipes.inventoryItemId, id))
            .top(1);
        if (ingredientLink || recipeTargetLink) {
            return res.status(409).json({
                error: 'INVENTORY_ITEM_USED_IN_RECIPE',
                message: 'Remove this item from active recipes before archiving it',
            });
        }

        const [deleted] = await db.update(inventoryItems)
            .set({ isActive: false, deletedAt: new Date(), updatedAt: new Date() })
            .output()
            .where(eq(inventoryItems.id, id));
        await createSignedAuditLog({
            eventType: 'INVENTORY_ITEM_ARCHIVED',
            userId: (req as any).user?.id || 'system',
            branchId: null,
            payload: { itemId: id, itemName: current.name },
            reason: 'Inventory item archived from inventory management',
            sourceDevice: req.headers['user-agent'] || 'unknown',
            requestId: req.headers['x-request-id'] as string || `req-${Date.now()}`,
        });
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
        if (item.isActive === false) return res.status(409).json({ error: 'INVENTORY_ITEM_INACTIVE' });
        if (warehouse.isActive === false) return res.status(409).json({ error: 'WAREHOUSE_INACTIVE' });
        if (req.effectiveBranchId && warehouse.branchId !== req.effectiveBranchId) return res.status(403).json({ error: 'BRANCH_MISMATCH' });
        const [existing] = await db.select().from(inventoryStock).where(
            and(eq(inventoryStock.itemId, item_id), eq(inventoryStock.warehouseId, warehouse_id))
        );

        const previousQty = Number(existing?.quantity || 0);
        const delta = newQty - previousQty;
        const value = Math.abs(delta) * Number(item?.costPrice || 0);

        let financeStatus: string = 'skipped';
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
                    financeStatus = (await postInventoryAdjustmentEntry(postingData)).status;
                } else {
                    financeStatus = (await postInventoryAdjustmentReversalEntry(postingData)).status;
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

        res.json({ success: true, previousQuantity: previousQty, newQuantity: newQty, delta, financeStatus });
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
            for (const receiptItem of items as Array<{ item_id: string; quantity: number; unit_cost: number; purchase_unit?: string; unit?: string }>) {
                const [item] = await tx.select().top(1).from(inventoryItems).where(eq(inventoryItems.id, receiptItem.item_id));
                if (!item) throw new Error(`INVENTORY_ITEM_NOT_FOUND:${receiptItem.item_id}`);

                const currentStocks = await tx.select().from(inventoryStock).where(eq(inventoryStock.itemId, receiptItem.item_id));
                const oldTotalQty = currentStocks.reduce((sum, stock) => sum + Number(stock.quantity || 0), 0);
                const enteredQuantity = Number(receiptItem.quantity);
                const enteredUnitCost = Number(receiptItem.unit_cost);
                const baseUnit = String(item.unit || '').trim().toUpperCase();
                const configuredPurchaseUnit = String((item as any).purchaseUnit || item.unit || '').trim().toUpperCase();
                const enteredUnit = String(receiptItem.purchase_unit || receiptItem.unit || configuredPurchaseUnit || baseUnit).trim().toUpperCase();
                const purchaseUnitFactor = Number((item as any).purchaseUnitFactor || 1) > 0 ? Number((item as any).purchaseUnitFactor || 1) : 1;
                const usePurchaseConversion = Boolean(enteredUnit && baseUnit && enteredUnit !== baseUnit && enteredUnit === configuredPurchaseUnit);
                const quantity = usePurchaseConversion ? enteredQuantity * purchaseUnitFactor : enteredQuantity;
                const unitCost = usePurchaseConversion ? enteredUnitCost / purchaseUnitFactor : enteredUnitCost;
                if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost <= 0) {
                    throw new Error('INVALID_RECEIPT_QUANTITY_OR_COST');
                }
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
                    totalCost: quantity * unitCost,
                    enteredQuantity,
                    enteredUnit,
                    baseQuantity: quantity,
                    baseUnit,
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

        const totalReceiptCost = results.reduce((sum, item: any) => sum + Number(item.totalCost || 0), 0);
        const finance = await postPurchaseReceiptEntry({
            poId: reference_id,
            amount: totalReceiptCost,
            branchId: warehouse.branchId || undefined,
            userId: actor_id || 'system',
        });

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

        return res.json({ success: true, referenceId: reference_id, items: results, finance });
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

            const sourceBatches = await tx.select().from(inventoryBatches).where(and(
                eq(inventoryBatches.itemId, item_id),
                eq(inventoryBatches.warehouseId, from_warehouse_id),
                eq(inventoryBatches.status, 'ACTIVE'),
                sql`${inventoryBatches.currentQty} > 0`
            )).orderBy(asc(inventoryBatches.expiryDate));
            if (sourceBatches.reduce((sum, batch) => sum + Number(batch.currentQty || 0), 0) < transferQty) {
                throw new Error('INSUFFICIENT_STOCK_BATCHES');
            }

            const [movement] = await tx.insert(stockMovements).output().values({
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

            let remaining = transferQty;
            for (const batch of sourceBatches) {
                if (remaining <= 0.000001) break;
                const moved = Math.min(remaining, Number(batch.currentQty || 0));
                const nextQty = Number(batch.currentQty || 0) - moved;
                await tx.update(inventoryBatches).set({
                    currentQty: nextQty,
                    status: nextQty <= 0.000001 ? 'DEPLETED' : 'ACTIVE',
                }).where(eq(inventoryBatches.id, batch.id));
                await tx.insert(inventoryBatches).values({
                    id: `BATCH-TRANSFER-${crypto.randomUUID()}`,
                    itemId: item_id,
                    warehouseId: to_warehouse_id,
                    batchNumber: `${batch.batchNumber}-TR-${String(movement.id)}`,
                    expiryDate: batch.expiryDate,
                    receivedDate: batch.receivedDate,
                    initialQty: moved,
                    currentQty: moved,
                    unitCost: batch.unitCost,
                    supplierId: batch.supplierId,
                    status: 'ACTIVE',
                    createdAt: new Date(),
                });
                remaining -= moved;
            }

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

const getRequestRows = async (requestId: string) => {
    const requestResult = await pool.query(`SELECT TOP 1 * FROM stock_transfer_requests WHERE id = $1`, [requestId]);
    const itemsResult = await pool.query(`SELECT * FROM stock_transfer_request_items WHERE request_id = $1 ORDER BY id`, [requestId]);
    return { request: requestResult.rows[0], items: itemsResult.rows };
};

export const createStockTransferRequest = async (req: Request, res: Response) => {
    try {
        await ensureInventorySchema();
        const branchId = getStringParam(req.body?.branchId || req.body?.branch_id || req.effectiveBranchId);
        const sourceWarehouseId = getStringParam(req.body?.sourceWarehouseId || req.body?.source_warehouse_id);
        const destinationWarehouseId = getStringParam(req.body?.destinationWarehouseId || req.body?.destination_warehouse_id);
        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        if (!branchId || !destinationWarehouseId || items.length === 0) {
            return res.status(400).json({ error: 'BRANCH_DESTINATION_AND_ITEMS_REQUIRED' });
        }
        if (req.effectiveBranchId && req.user?.role !== 'SUPER_ADMIN' && req.effectiveBranchId !== branchId) {
            return res.status(403).json({ error: 'BRANCH_MISMATCH' });
        }
        const [destinationWarehouse] = await db.select().from(warehouses).where(eq(warehouses.id, destinationWarehouseId));
        if (!destinationWarehouse || destinationWarehouse.isActive === false) return res.status(400).json({ error: 'DESTINATION_WAREHOUSE_NOT_FOUND' });
        if (destinationWarehouse.branchId !== branchId) return res.status(400).json({ error: 'DESTINATION_BRANCH_MISMATCH' });

        const cleanItems = items.map((item: any) => ({
            itemId: getStringParam(item?.itemId || item?.item_id),
            quantity: Number(item?.quantity ?? item?.requestedQty ?? item?.requested_qty),
            unit: getStringParam(item?.unit),
        })).filter((item) => item.itemId && Number.isFinite(item.quantity) && item.quantity > 0);
        if (cleanItems.length === 0) return res.status(400).json({ error: 'VALID_ITEMS_REQUIRED' });

        const requestId = `STR-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
        await pool.query(`
            INSERT INTO stock_transfer_requests
                (id, request_branch_id, source_warehouse_id, destination_warehouse_id, status, priority, notes, requested_by, requested_at, updated_at)
            VALUES ($1, $2, $3, $4, 'REQUESTED', $5, $6, $7, GETDATE(), GETDATE())
        `, [
            requestId,
            branchId,
            sourceWarehouseId || null,
            destinationWarehouseId,
            getStringParam(req.body?.priority) || 'NORMAL',
            getStringParam(req.body?.notes) || null,
            req.user?.id || getStringParam(req.body?.requestedBy) || 'system',
        ]);
        for (const item of cleanItems) {
            await pool.query(`
                INSERT INTO stock_transfer_request_items (request_id, item_id, requested_qty, unit)
                VALUES ($1, $2, $3, $4)
            `, [requestId, item.itemId, item.quantity, item.unit || null]);
        }
        const rows = await getRequestRows(requestId);
        res.status(201).json({ ...rows.request, items: rows.items });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getStockTransferRequests = async (req: Request, res: Response) => {
    try {
        await ensureInventorySchema();
        const status = getStringParam(req.query.status);
        const scope = getStringParam(req.query.scope);
        const branchId = getStringParam(req.query.branchId || req.query.branch_id || req.effectiveBranchId);
        // scope=incoming: central-warehouse inbox — all REQUESTED orders from every
        // branch (source not chosen yet, so branch scoping can't see them). The
        // route is managerAuth-gated; branch staff only use their own lists.
        if (scope === 'incoming') {
            const result = await pool.query(`
                SELECT TOP 200 r.*, i.id AS line_id, i.item_id, inv.name AS item_name, inv.unit AS item_unit, i.requested_qty, i.approved_qty, i.dispatched_qty, i.received_qty, i.unit,
                    w.name AS destination_warehouse_name, b.name AS request_branch_name
                FROM stock_transfer_requests r
                LEFT JOIN stock_transfer_request_items i ON i.request_id = r.id
                LEFT JOIN inventory_items inv ON inv.id = i.item_id
                LEFT JOIN warehouses w ON w.id = r.destination_warehouse_id
                LEFT JOIN branches b ON b.id = r.request_branch_id
                WHERE r.status = 'REQUESTED' AND ($1 IS NULL OR r.request_branch_id = $1)
                ORDER BY r.requested_at DESC, i.id ASC
            `, [branchId || null]);
            const map = new Map<string, any>();
            for (const row of result.rows) {
                if (!map.has(row.id)) {
                    map.set(row.id, {
                        id: row.id,
                        branchId: row.request_branch_id,
                        branchName: row.request_branch_name,
                        sourceWarehouseId: row.source_warehouse_id,
                        destinationWarehouseId: row.destination_warehouse_id,
                        destinationWarehouseName: row.destination_warehouse_name,
                        status: row.status,
                        priority: row.priority,
                        notes: row.notes,
                        requestedBy: row.requested_by,
                        approvedBy: row.approved_by,
                        dispatchedBy: row.dispatched_by,
                        receivedBy: row.received_by,
                        requestedAt: row.requested_at,
                        updatedAt: row.updated_at,
                        items: [],
                    });
                }
                if (row.line_id) {
                    map.get(row.id).items.push({
                        id: row.line_id,
                        itemId: row.item_id,
                        itemName: row.item_name,
                        requestedQty: Number(row.requested_qty || 0),
                        approvedQty: row.approved_qty === null ? null : Number(row.approved_qty || 0),
                        dispatchedQty: row.dispatched_qty === null ? null : Number(row.dispatched_qty || 0),
                        receivedQty: row.received_qty === null ? null : Number(row.received_qty || 0),
                        unit: row.unit || row.item_unit,
                    });
                }
            }
            res.json(Array.from(map.values()));
            return;
        }
        const result = await pool.query(`
            SELECT TOP 200 r.*, i.id AS line_id, i.item_id, inv.name AS item_name, i.requested_qty, i.approved_qty, i.dispatched_qty, i.received_qty, i.unit
            FROM stock_transfer_requests r
            LEFT JOIN stock_transfer_request_items i ON i.request_id = r.id
            LEFT JOIN inventory_items inv ON inv.id = i.item_id
            WHERE ($1 IS NULL OR r.status = $1) AND ($2 IS NULL OR r.request_branch_id = $2 OR r.source_warehouse_id IN (SELECT id FROM warehouses WHERE branch_id = $2))
            ORDER BY r.requested_at DESC, i.id ASC
        `, [status || null, branchId || null]);
        const map = new Map<string, any>();
        for (const row of result.rows) {
            if (!map.has(row.id)) {
                map.set(row.id, {
                    id: row.id,
                    branchId: row.request_branch_id,
                    sourceWarehouseId: row.source_warehouse_id,
                    destinationWarehouseId: row.destination_warehouse_id,
                    status: row.status,
                    priority: row.priority,
                    notes: row.notes,
                    requestedBy: row.requested_by,
                    approvedBy: row.approved_by,
                    dispatchedBy: row.dispatched_by,
                    receivedBy: row.received_by,
                    requestedAt: row.requested_at,
                    updatedAt: row.updated_at,
                    items: [],
                });
            }
            if (row.line_id) {
                map.get(row.id).items.push({
                    id: row.line_id,
                    itemId: row.item_id,
                    itemName: row.item_name,
                    requestedQty: Number(row.requested_qty || 0),
                    approvedQty: row.approved_qty === null ? null : Number(row.approved_qty || 0),
                    dispatchedQty: row.dispatched_qty === null ? null : Number(row.dispatched_qty || 0),
                    receivedQty: row.received_qty === null ? null : Number(row.received_qty || 0),
                    unit: row.unit,
                });
            }
        }
        res.json(Array.from(map.values()));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const approveStockTransferRequest = async (req: Request, res: Response) => {
    try {
        await ensureInventorySchema();
        const id = getStringParam(req.params.id);
        const sourceWarehouseId = getStringParam(req.body?.sourceWarehouseId || req.body?.source_warehouse_id);
        if (!id || !sourceWarehouseId) return res.status(400).json({ error: 'REQUEST_ID_AND_SOURCE_WAREHOUSE_REQUIRED' });
        const { request, items } = await getRequestRows(id);
        if (!request) return res.status(404).json({ error: 'TRANSFER_REQUEST_NOT_FOUND' });
        if (!['REQUESTED', 'APPROVED'].includes(String(request.status))) return res.status(400).json({ error: 'TRANSFER_REQUEST_NOT_APPROVABLE' });

        // Optional per-line quantity edits from the warehouse reviewer.
        // Missing lines default to the requested qty; 0 rejects the line.
        const bodyItems = Array.isArray(req.body?.items) ? req.body.items : [];
        const editedQtyByItem = new Map<string, number>();
        for (const entry of bodyItems) {
            const itemId = getStringParam(entry?.itemId || entry?.item_id);
            const qty = Number(entry?.approvedQty ?? entry?.approved_qty ?? entry?.quantity);
            if (itemId && Number.isFinite(qty) && qty >= 0) editedQtyByItem.set(itemId, qty);
        }

        await db.transaction(async (tx) => {
            const [sourceWarehouse] = await tx.select().from(warehouses).where(eq(warehouses.id, sourceWarehouseId));
            if (!sourceWarehouse || sourceWarehouse.isActive === false) throw new Error('SOURCE_WAREHOUSE_NOT_FOUND');

            await tx.execute(sql`DELETE FROM stock_transfer_reservations WHERE request_id = ${id} AND status = 'RESERVED'`);
            let approvedLines = 0;
            for (const line of items) {
                const approvedQty = editedQtyByItem.has(line.item_id)
                    ? Number(editedQtyByItem.get(line.item_id))
                    : Number(line.approved_qty ?? line.requested_qty);
                if (!Number.isFinite(approvedQty) || approvedQty < 0) throw new Error(`INVALID_APPROVED_QTY|item=${line.item_id}`);
                await tx.execute(sql`
                    UPDATE stock_transfer_request_items
                    SET approved_qty = ${approvedQty}, dispatched_qty = 0, received_qty = 0
                    WHERE request_id = ${id} AND item_id = ${line.item_id}
                `);
                if (approvedQty === 0) continue; // line rejected by reviewer — no reservation
                approvedLines += 1;
                const [sourceStock] = await tx.select().from(inventoryStock).where(and(
                    eq(inventoryStock.itemId, line.item_id),
                    eq(inventoryStock.warehouseId, sourceWarehouseId),
                ));
                if (Number(sourceStock?.quantity || 0) < approvedQty) throw new Error(`INSUFFICIENT_STOCK|item=${line.item_id}`);
                await tx.update(inventoryStock)
                    .set({ quantity: sql`${inventoryStock.quantity} - ${approvedQty}`, lastUpdated: new Date() })
                    .where(eq(inventoryStock.id, sourceStock.id));

                const batches = await tx.select().from(inventoryBatches).where(and(
                    eq(inventoryBatches.itemId, line.item_id),
                    eq(inventoryBatches.warehouseId, sourceWarehouseId),
                    eq(inventoryBatches.status, 'ACTIVE'),
                    sql`${inventoryBatches.currentQty} > 0`,
                )).orderBy(asc(inventoryBatches.expiryDate));
                if (batches.reduce((sum, batch) => sum + Number(batch.currentQty || 0), 0) < approvedQty) throw new Error(`INSUFFICIENT_STOCK_BATCHES|item=${line.item_id}`);

                let remaining = approvedQty;
                for (const batch of batches) {
                    if (remaining <= 0.000001) break;
                    const reserved = Math.min(remaining, Number(batch.currentQty || 0));
                    const nextQty = Number(batch.currentQty || 0) - reserved;
                    await tx.update(inventoryBatches)
                        .set({ currentQty: nextQty, status: nextQty <= 0.000001 ? 'DEPLETED' : 'ACTIVE' })
                        .where(eq(inventoryBatches.id, batch.id));
                    await tx.execute(sql`
                        INSERT INTO stock_transfer_reservations
                            (request_id, item_id, source_warehouse_id, batch_id, batch_number, expiry_date, received_date, quantity, unit_cost, status, created_at)
                        VALUES (${id}, ${line.item_id}, ${sourceWarehouseId}, ${batch.id}, ${batch.batchNumber}, ${batch.expiryDate}, ${batch.receivedDate}, ${reserved}, ${Number(batch.unitCost || 0)}, 'RESERVED', GETDATE())
                    `);
                    remaining -= reserved;
                }
                await tx.insert(stockMovements).values({
                    itemId: line.item_id,
                    fromWarehouseId: sourceWarehouseId,
                    quantity: approvedQty,
                    type: 'TRANSFER_RESERVE',
                    reason: `Stock transfer reserve ${id}`,
                    referenceId: id,
                    performedBy: req.user?.id || 'system',
                    createdAt: new Date(),
                } as any);
            }
            if (approvedLines === 0) throw new Error('ALL_LINES_REJECTED|use cancel to reject the request');
            await tx.execute(sql`
                UPDATE stock_transfer_requests
                SET status = 'RESERVED', source_warehouse_id = ${sourceWarehouseId}, approved_by = ${req.user?.id || 'system'}, approved_at = GETDATE(), updated_at = GETDATE()
                WHERE id = ${id}
            `);
        });
        const rows = await getRequestRows(id);
        res.json({ ...rows.request, items: rows.items });
    } catch (error: any) {
        res.status(String(error.message).startsWith('INSUFFICIENT_STOCK') ? 400 : 500).json({ error: error.message });
    }
};

export const dispatchStockTransferRequest = async (req: Request, res: Response) => {
    try {
        await ensureInventorySchema();
        const id = getStringParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'REQUEST_ID_REQUIRED' });
        const { request, items } = await getRequestRows(id);
        if (!request) return res.status(404).json({ error: 'TRANSFER_REQUEST_NOT_FOUND' });
        if (request.status !== 'RESERVED') return res.status(400).json({ error: 'TRANSFER_REQUEST_NOT_RESERVED' });
        await pool.query(`
            UPDATE stock_transfer_requests
            SET status = 'DISPATCHED', dispatched_by = $2, dispatched_at = GETDATE(), updated_at = GETDATE()
            WHERE id = $1;
            UPDATE stock_transfer_request_items SET dispatched_qty = COALESCE(approved_qty, requested_qty) WHERE request_id = $1;
        `, [id, req.user?.id || 'system']);
        res.json({ ...(await getRequestRows(id)).request, items });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const receiveStockTransferRequest = async (req: Request, res: Response) => {
    try {
        await ensureInventorySchema();
        const id = getStringParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'REQUEST_ID_REQUIRED' });
        const { request } = await getRequestRows(id);
        if (!request) return res.status(404).json({ error: 'TRANSFER_REQUEST_NOT_FOUND' });
        if (request.status !== 'DISPATCHED') return res.status(400).json({ error: 'TRANSFER_REQUEST_NOT_DISPATCHED' });
        const reservationRows = await pool.query(`SELECT * FROM stock_transfer_reservations WHERE request_id = $1 AND status = 'RESERVED'`, [id]);
        if (reservationRows.rows.length === 0) return res.status(400).json({ error: 'NO_RESERVED_STOCK' });

        await db.transaction(async (tx) => {
            for (const reservation of reservationRows.rows) {
                const quantity = Number(reservation.quantity || 0);
                if (quantity <= 0) continue;
                const [destStock] = await tx.select().from(inventoryStock).where(and(
                    eq(inventoryStock.itemId, reservation.item_id),
                    eq(inventoryStock.warehouseId, request.destination_warehouse_id),
                ));
                if (destStock) {
                    await tx.update(inventoryStock)
                        .set({ quantity: sql`${inventoryStock.quantity} + ${quantity}`, lastUpdated: new Date() })
                        .where(eq(inventoryStock.id, destStock.id));
                } else {
                    await tx.insert(inventoryStock).values({ itemId: reservation.item_id, warehouseId: request.destination_warehouse_id, quantity, lastUpdated: new Date() });
                }
                await tx.insert(inventoryBatches).values({
                    id: `BATCH-TRANSFER-REQUEST-${crypto.randomUUID()}`,
                    itemId: reservation.item_id,
                    warehouseId: request.destination_warehouse_id,
                    batchNumber: `${reservation.batch_number || id}-REQ`,
                    expiryDate: reservation.expiry_date || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                    receivedDate: reservation.received_date || new Date(),
                    initialQty: quantity,
                    currentQty: quantity,
                    unitCost: Number(reservation.unit_cost || 0),
                    status: 'ACTIVE',
                    createdAt: new Date(),
                });
                await tx.insert(stockMovements).values({
                    itemId: reservation.item_id,
                    fromWarehouseId: request.source_warehouse_id,
                    toWarehouseId: request.destination_warehouse_id,
                    quantity,
                    unitCost: Number(reservation.unit_cost || 0),
                    totalCost: quantity * Number(reservation.unit_cost || 0),
                    type: 'TRANSFER',
                    reason: `Stock transfer request received ${id}`,
                    referenceId: id,
                    performedBy: req.user?.id || 'system',
                    createdAt: new Date(),
                } as any);
            }
            await tx.execute(sql`UPDATE stock_transfer_reservations SET status = 'RECEIVED' WHERE request_id = ${id}`);
            await tx.execute(sql`
                UPDATE stock_transfer_request_items
                SET received_qty = COALESCE(dispatched_qty, approved_qty, requested_qty)
                WHERE request_id = ${id}
            `);
            await tx.execute(sql`
                UPDATE stock_transfer_requests
                SET status = 'RECEIVED', received_by = ${req.user?.id || 'system'}, received_at = GETDATE(), updated_at = GETDATE()
                WHERE id = ${id}
            `);
        });
        const rows = await getRequestRows(id);
        res.json({ ...rows.request, items: rows.items });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const cancelStockTransferRequest = async (req: Request, res: Response) => {
    try {
        await ensureInventorySchema();
        const id = getStringParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'REQUEST_ID_REQUIRED' });
        const { request } = await getRequestRows(id);
        if (!request) return res.status(404).json({ error: 'TRANSFER_REQUEST_NOT_FOUND' });
        if (request.status === 'RECEIVED') return res.status(400).json({ error: 'RECEIVED_TRANSFER_CANNOT_BE_CANCELLED' });
        const reservationRows = await pool.query(`SELECT * FROM stock_transfer_reservations WHERE request_id = $1 AND status = 'RESERVED'`, [id]);

        await db.transaction(async (tx) => {
            for (const reservation of reservationRows.rows) {
                const quantity = Number(reservation.quantity || 0);
                if (quantity <= 0) continue;
                const [sourceStock] = await tx.select().from(inventoryStock).where(and(
                    eq(inventoryStock.itemId, reservation.item_id),
                    eq(inventoryStock.warehouseId, reservation.source_warehouse_id),
                ));
                if (sourceStock) {
                    await tx.update(inventoryStock)
                        .set({ quantity: sql`${inventoryStock.quantity} + ${quantity}`, lastUpdated: new Date() })
                        .where(eq(inventoryStock.id, sourceStock.id));
                } else {
                    await tx.insert(inventoryStock).values({ itemId: reservation.item_id, warehouseId: reservation.source_warehouse_id, quantity, lastUpdated: new Date() });
                }
                await tx.insert(inventoryBatches).values({
                    id: `BATCH-TRANSFER-RELEASE-${crypto.randomUUID()}`,
                    itemId: reservation.item_id,
                    warehouseId: reservation.source_warehouse_id,
                    batchNumber: `${reservation.batch_number || id}-REL`,
                    expiryDate: reservation.expiry_date || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                    receivedDate: reservation.received_date || new Date(),
                    initialQty: quantity,
                    currentQty: quantity,
                    unitCost: Number(reservation.unit_cost || 0),
                    status: 'ACTIVE',
                    createdAt: new Date(),
                });
                await tx.insert(stockMovements).values({
                    itemId: reservation.item_id,
                    toWarehouseId: reservation.source_warehouse_id,
                    quantity,
                    type: 'ADJUSTMENT',
                    reason: `Stock transfer request cancelled ${id}`,
                    referenceId: id,
                    performedBy: req.user?.id || 'system',
                    createdAt: new Date(),
                } as any);
            }
            await tx.execute(sql`UPDATE stock_transfer_reservations SET status = 'CANCELLED' WHERE request_id = ${id} AND status = 'RESERVED'`);
            await tx.execute(sql`UPDATE stock_transfer_requests SET status = 'CANCELLED', updated_at = GETDATE() WHERE id = ${id}`);
        });
        const rows = await getRequestRows(id);
        res.json({ ...rows.request, items: rows.items });
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

            // Per-warehouse live stock (posted counts already adjust these rows).
            let stockPerWarehouse: any[] = [];
            if (itemIds.length > 0) {
                stockPerWarehouse = await db
                    .select({
                        itemId: inventoryStock.itemId,
                        warehouseId: inventoryStock.warehouseId,
                        quantity: sql<number>`coalesce(sum(${inventoryStock.quantity}), 0)`,
                    })
                    .from(inventoryStock)
                    .where(inArray(inventoryStock.itemId, itemIds))
                    .groupBy(inventoryStock.itemId, inventoryStock.warehouseId);
            }
            const stockByItemWarehouse = new Map(stockPerWarehouse.map((stock) => [
                `${stock.itemId}:${stock.warehouseId}`,
                Number(stock.quantity || 0),
            ]));

            // Branch aggregate fallback for rows without a warehouse scope.
            let branchAggregates: any[] = [];
            if (itemIds.length > 0 && branchIds.length > 0) {
                branchAggregates = await db
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
            }
            const stockByItemBranch = new Map(branchAggregates.map((stock) => [
                `${stock.itemId}:${stock.branchId}`,
                Number(stock.quantity || 0),
            ]));

            // Latest POSTED physical count per item+warehouse: over/short comes
            // from its variance (counted - expected). Without a count there is
            // no variance to report — the current balance extends the opening one.
            let countLines: any[] = [];
            if (itemIds.length > 0) {
                countLines = await db
                    .select({
                        itemId: stockCountLines.itemId,
                        warehouseId: stockCounts.warehouseId,
                        countedQty: stockCountLines.countedQty,
                        expectedQty: stockCountLines.expectedQty,
                        varianceQty: stockCountLines.varianceQty,
                        postedAt: stockCounts.postedAt,
                        countDate: stockCounts.countDate,
                    })
                    .from(stockCountLines)
                    .innerJoin(stockCounts, eq(stockCounts.id, stockCountLines.countId))
                    .where(and(
                        eq(stockCounts.status, 'POSTED'),
                        inArray(stockCountLines.itemId, itemIds),
                    ))
                    .orderBy(desc(stockCounts.postedAt));
            }
            const countByPair = new Map<string, any>();
            for (const line of countLines) {
                const key = `${line.itemId}:${line.warehouseId}`;
                if (countByPair.has(key)) continue;
                const variance = Number(line.varianceQty || 0);
                countByPair.set(key, {
                    shortageQty: Math.max(-variance, 0),
                    overQty: Math.max(variance, 0),
                    lastCountedQty: line.countedQty === null || line.countedQty === undefined ? null : Number(line.countedQty),
                    lastExpectedQty: Number(line.expectedQty || 0),
                    lastCountDate: line.postedAt || line.countDate || null,
                });
            }

            return sourceRows.map((row) => {
                const warehouseKey = `${row.itemId}:${row.warehouseId}`;
                const hasWarehouseScope = Boolean(row.warehouseId) && stockByItemWarehouse.has(warehouseKey);
                const currentStock = hasWarehouseScope
                    ? stockByItemWarehouse.get(warehouseKey) || 0
                    : stockByItemBranch.get(`${row.itemId}:${row.branchId}`) || 0;
                const countInfo = countByPair.get(warehouseKey) || {
                    shortageQty: 0,
                    overQty: 0,
                    lastCountedQty: null,
                    lastExpectedQty: null,
                    lastCountDate: null,
                };
                return { ...row, currentStock, ...countInfo };
            });
        };
        const limit = Number(req.query.limit || 100);
        const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 100;
        const dateRange = req.query.startDate && req.query.endDate
            ? parseLocalDateRange(String(req.query.startDate), String(req.query.endDate))
            : null;

        // Recipe withdrawals include POS sales consumption AND production consumption
        // (production orders eating composite ingredients like shawarma).
        const conditions: any[] = [inArray(stockMovements.type, ['SALE_CONSUMPTION', 'PRODUCTION_CONSUMPTION'])];
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
            const rangeStart = dateRange?.start || new Date(0);
            const rangeEnd = dateRange?.end || new Date();

            const [warehouse] = await db
                .select({ id: warehouses.id, name: warehouses.name, branchId: warehouses.branchId })
                .from(warehouses)
                .where(req.effectiveBranchId ? eq(warehouses.branchId, req.effectiveBranchId) : sql`true`)
                .orderBy(desc(warehouses.type))
                .offset(0).fetch(1);

            // Match exactly ONE recipe per sold line (size match → base → newest)
            // so items with multiple size recipes are not counted several times.
            const sizeRank = sql`CASE
                WHEN oi.size_id IS NOT NULL AND LTRIM(RTRIM(oi.size_id)) <> '' AND r.size_id = oi.size_id THEN 0
                WHEN (oi.size_id IS NULL OR LTRIM(RTRIM(oi.size_id)) = '') AND (r.size_id IS NULL OR LTRIM(RTRIM(r.size_id)) = '') THEN 0
                WHEN r.size_id IS NULL OR LTRIM(RTRIM(r.size_id)) = '' THEN 1
                ELSE 2
            END`;

            const rawTheoretical: any = await db.execute(sql`
                WITH matched_recipes AS (
                    SELECT oi.id AS order_item_id,
                           r.id AS recipe_id,
                           r.yield AS recipe_yield,
                           ROW_NUMBER() OVER (
                               PARTITION BY oi.id
                               ORDER BY ${sizeRank} ASC, r.updated_at DESC
                           ) AS rn
                    FROM order_items oi
                    JOIN orders o ON o.id = oi.order_id
                    JOIN recipes r ON r.menu_item_id = oi.menu_item_id
                    WHERE o.created_at >= ${rangeStart} AND o.created_at <= ${rangeEnd}
                      AND o.status NOT IN ('CANCELLED', 'VOID', 'REFUNDED')
                      ${req.effectiveBranchId ? sql`AND o.branch_id = ${req.effectiveBranchId}` : sql``}
                )
                SELECT ri.inventory_item_id AS itemId,
                       inv.name AS itemName,
                       inv.name_ar AS itemNameAr,
                       ri.unit AS unit,
                       COALESCE(SUM(oi.quantity * ri.quantity / COALESCE(m.recipe_yield, 1)), 0) AS totalQuantity,
                       COUNT(DISTINCT o2.id) AS movementCount,
                       COALESCE(SUM(oi.quantity * ri.quantity / COALESCE(m.recipe_yield, 1) * COALESCE(inv.cost_price, 0)), 0) AS estimatedCost,
                       MAX(o2.created_at) AS lastConsumedAt,
                       COALESCE(MAX(o2.id), '') AS lastReferenceId
                FROM matched_recipes m
                JOIN order_items oi ON oi.id = m.order_item_id
                JOIN orders o2 ON o2.id = oi.order_id
                JOIN recipe_ingredients ri ON ri.recipe_id = m.recipe_id
                JOIN inventory_items inv ON inv.id = ri.inventory_item_id
                WHERE m.rn = 1
                GROUP BY ri.inventory_item_id, inv.name, inv.name_ar, ri.unit
                ORDER BY SUM(oi.quantity * ri.quantity / COALESCE(m.recipe_yield, 1)) DESC
                OFFSET 0 ROWS FETCH NEXT ${safeLimit} ROWS ONLY
            `);
            const theoreticalRows: any[] = Array.isArray(rawTheoretical)
                ? rawTheoretical
                : (rawTheoretical?.recordset ?? rawTheoretical?.rows ?? []);

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
 * Menu-item recipe availability per branch (WARN-ONLY helper for Call Center / POS).
 * Read-only: never blocks a sale, just reports how many servings the branch
 * can fulfil from current inventory_stock so the UI can show a warning badge.
 * GET /api/inventory/menu-availability?branchId=X&menuItemIds=a,b,c
 */
export const getMenuAvailability = async (req: Request, res: Response) => {
    try {
        const { convertQuantity } = await import('../services/unitConversion');
        const branchId = getStringParam(req.query.branchId) || req.effectiveBranchId;
        const rawIds = getStringParam(req.query.menuItemIds) || getStringParam(req.query.menuItemId) || '';
        const menuItemIds = Array.from(new Set(
            String(rawIds).split(',').map((s) => s.trim()).filter(Boolean)
        )).slice(0, 100);
        if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED', code: 'BRANCH_ID_REQUIRED' });
        if (menuItemIds.length === 0) return res.json({ branchId, items: [] });

        const branchWarehouses = await db.select({ id: warehouses.id })
            .from(warehouses)
            .where(eq(warehouses.branchId, branchId));
        const warehouseIds = branchWarehouses.map((w) => w.id);

        // Branch-level stock per inventory item (sum across branch warehouses).
        const stockByItem = new Map<string, number>();
        if (warehouseIds.length > 0) {
            const stockRows = await db
                .select({
                    itemId: inventoryStock.itemId,
                    quantity: sql<number>`coalesce(sum(${inventoryStock.quantity}), 0)`,
                })
                .from(inventoryStock)
                .where(inArray(inventoryStock.warehouseId, warehouseIds))
                .groupBy(inventoryStock.itemId);
            for (const row of stockRows) stockByItem.set(row.itemId, Number(row.quantity || 0));
        }

        const items: any[] = [];
        for (const menuItemId of menuItemIds) {
            const recipeRows: any[] = await db
                .select({ id: recipes.id, yield: recipes.yield, sizeId: recipes.sizeId })
                .from(recipes)
                .where(eq(recipes.menuItemId, menuItemId))
                .orderBy(desc(recipes.updatedAt));
            const recipe = recipeRows.find((r: any) => !String(r.sizeId || '').trim()) ?? recipeRows[0];
            if (!recipe) {
                items.push({ menuItemId, hasRecipe: false, maxServings: null, short: false, shortIngredients: [] });
                continue;
            }
            const batchServings = Number(recipe?.yield) > 0 ? Number(recipe.yield) : 1;
            const ingredients = await db.select({ ingredient: recipeIngredients, inventoryUnit: inventoryItems.unit, inventoryName: inventoryItems.name })
                .from(recipeIngredients)
                .innerJoin(inventoryItems, eq(recipeIngredients.inventoryItemId, inventoryItems.id))
                .where(eq(recipeIngredients.recipeId, recipe.id));
            let maxServings = Number.POSITIVE_INFINITY;
            const shortIngredients: any[] = [];
            for (const row of ingredients) {
                const perServing = convertQuantity(Number(row.ingredient.quantity || 0), row.ingredient.unit, row.inventoryUnit) / batchServings;
                if (!Number.isFinite(perServing) || perServing <= 0) continue;
                const stock = stockByItem.get(String(row.ingredient.inventoryItemId)) ?? 0;
                const servings = Math.floor(stock / perServing);
                if (servings < maxServings) maxServings = servings;
                if (stock < perServing) {
                    shortIngredients.push({
                        itemId: row.ingredient.inventoryItemId,
                        name: (row as any).inventoryName,
                        need: perServing,
                        stock,
                        unit: row.inventoryUnit,
                    });
                }
            }
            const finite = Number.isFinite(maxServings) ? maxServings : 0;
            items.push({
                menuItemId,
                hasRecipe: true,
                maxServings: finite,
                short: finite <= 0,
                shortIngredients: shortIngredients.slice(0, 5),
            });
        }
        res.json({ branchId, items });
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
