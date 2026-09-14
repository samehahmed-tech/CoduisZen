import { Request, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db';
import { stockCounts, stockCountLines, inventoryItems, inventoryStock, inventoryBatches, warehouses } from '../../src/db/schema';
import { eq, and, desc, sql, gte, lte, asc } from 'drizzle-orm';
import { postWastageEntry, postInventoryAdjustmentReversalEntry } from '../services/financePostingService';
import { getStringParam } from '../utils/request';

const toDateOnly = (value?: string | Date | null) => {
    const datePart = !value
        ? new Date().toISOString().split('T')[0]
        : value instanceof Date
            ? value.toISOString().split('T')[0]
            : String(value).split('T')[0];
    return new Date(`${datePart}T00:00:00.000Z`);
};

const STOCK_COUNT_TYPES = new Set(['DAILY', 'MONTHLY', 'FULL', 'CYCLE']);

const enrichCountLines = async (lines: any[]) => {
    if (lines.length === 0) return [];
    const items = await db.select().from(inventoryItems);
    const itemMap = new Map(items.map((item) => [item.id, item]));
    return lines.map((line) => {
        const item = itemMap.get(line.itemId);
        return {
            id: line.id,
            countId: line.countId,
            itemId: line.itemId,
            itemName: item?.name || line.itemId,
            itemNameAr: item?.nameAr || null,
            unit: item?.unit || '',
            expectedQty: Number(line.expectedQty || 0),
            systemQty: Number(line.expectedQty || 0),
            countedQty: line.countedQty === null || line.countedQty === undefined ? null : Number(line.countedQty),
            varianceQty: line.varianceQty === null || line.varianceQty === undefined ? null : Number(line.varianceQty),
            cost: Number(line.cost || 0),
            notes: line.notes || '',
        };
    });
};

export const getStockCounts = async (req: Request, res: Response) => {
    try {
        const branchId = (req.query.branchId as string) || (req as any).effectiveBranchId;
        const warehouseId = req.query.warehouseId as string | undefined;
        const countDate = req.query.date as string | undefined;
        const startDate = req.query.startDate as string | undefined;
        const endDate = req.query.endDate as string | undefined;
        const status = req.query.status as string | undefined;
        const limit = Math.max(1, Math.min(Number(req.query.limit || 30), 100));

        const conditions = [];
        if (branchId) conditions.push(eq(stockCounts.branchId, branchId));
        if (warehouseId) conditions.push(eq(stockCounts.warehouseId, warehouseId));
        if (countDate) {
            conditions.push(eq(stockCounts.countDate, toDateOnly(countDate)));
        } else {
            if (startDate) conditions.push(gte(stockCounts.countDate, toDateOnly(startDate)));
            if (endDate) conditions.push(lte(stockCounts.countDate, toDateOnly(endDate)));
        }
        if (status) conditions.push(eq(stockCounts.status, status));

        const rows = await db.select().from(stockCounts)
            .where(conditions.length ? and(...conditions) : undefined)
            .orderBy(desc(stockCounts.createdAt))
            .offset(0).fetch(limit);

        const warehouseRows = await db.select().from(warehouses);
        const warehouseMap = new Map(warehouseRows.map((warehouse) => [warehouse.id, warehouse]));

        const result = await Promise.all(rows.map(async (count) => {
            const lines = await db.select().from(stockCountLines).where(eq(stockCountLines.countId, count.id));
            const varianceLines = lines.filter((line) => Number(line.varianceQty || 0) !== 0);
            const shortageQty = varianceLines
                .filter((line) => Number(line.varianceQty || 0) < 0)
                .reduce((sum, line) => sum + Math.abs(Number(line.varianceQty || 0)), 0);
            const overQty = varianceLines
                .filter((line) => Number(line.varianceQty || 0) > 0)
                .reduce((sum, line) => sum + Number(line.varianceQty || 0), 0);

            return {
                id: count.id,
                branchId: count.branchId,
                warehouseId: count.warehouseId,
                warehouseName: count.warehouseId ? warehouseMap.get(count.warehouseId)?.name : null,
                countDate: count.countDate || toDateOnly(count.scheduledDate),
                status: count.status,
                type: count.type,
                remarks: count.remarks,
                createdBy: count.createdBy,
                approvedBy: count.approvedBy,
                frozenAt: count.frozenAt,
                postedAt: count.postedAt,
                createdAt: count.createdAt,
                summary: {
                    lines: lines.length,
                    countedLines: lines.filter((line) => line.countedQty !== null && line.countedQty !== undefined).length,
                    varianceLines: varianceLines.length,
                    shortageQty,
                    overQty,
                    varianceValue: varianceLines.reduce((sum, line) => sum + Number(line.varianceQty || 0) * Number(line.cost || 0), 0),
                },
            };
        }));

        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getStockCount = async (req: Request, res: Response) => {
    try {
        const id = getStringParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'COUNT_ID_REQUIRED' });

        const [count] = await db.select().top(1).from(stockCounts).where(eq(stockCounts.id, id));
        if (!count) return res.status(404).json({ error: 'Count not found' });

        const lines = await db.select().from(stockCountLines).where(eq(stockCountLines.countId, id));
        const [warehouse] = count.warehouseId
            ? await db.select().top(1).from(warehouses).where(eq(warehouses.id, count.warehouseId))
            : [null];

        res.json({
            ...count,
            warehouseName: warehouse?.name || null,
            countDate: count.countDate || toDateOnly(count.scheduledDate),
            items: await enrichCountLines(lines),
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Initializes a new Cycle Count
 */
export const createStockCount = async (req: Request, res: Response) => {
    try {
        const { warehouseId, type, remarks, userId, scheduledDate, countDate } = req.body;
        const branchId = req.effectiveBranchId || req.body.branchId;
        if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
        if (!warehouseId) return res.status(400).json({ error: 'WAREHOUSE_ID_REQUIRED' });
        const normalizedType = String(type || 'FULL').toUpperCase();
        if (!STOCK_COUNT_TYPES.has(normalizedType)) {
            return res.status(400).json({ error: 'COUNT_TYPE_INVALID' });
        }

        const [warehouse] = await db.select().top(1).from(warehouses).where(eq(warehouses.id, warehouseId));
        if (!warehouse) return res.status(404).json({ error: 'WAREHOUSE_NOT_FOUND' });
        if (warehouse.isActive === false) return res.status(409).json({ error: 'WAREHOUSE_INACTIVE' });
        if (req.effectiveBranchId && warehouse.branchId !== req.effectiveBranchId) return res.status(403).json({ error: 'BRANCH_MISMATCH' });
        if (warehouse.branchId && warehouse.branchId !== branchId) {
            return res.status(400).json({ error: 'WAREHOUSE_BRANCH_MISMATCH' });
        }

        const countId = `CNT-${Date.now()}`;
        await db.insert(stockCounts).values({
            id: countId,
            branchId,
            warehouseId,
            countDate: toDateOnly(countDate || scheduledDate),
            status: 'DRAFT',
            type: normalizedType,
            remarks,
            createdBy: userId,
            scheduledDate: scheduledDate ? new Date(scheduledDate) : null
        });

        res.status(201).json({
            id: countId,
            branchId,
            warehouseId,
            countDate: toDateOnly(countDate || scheduledDate),
            status: 'DRAFT',
            type: normalizedType,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Freezes the stock for counting. Populates expected quantities.
 */
export const freezeStockCount = async (req: Request, res: Response) => {
    try {
        const id = getStringParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'COUNT_ID_REQUIRED' });
        
        const count = await db.select().top(1).from(stockCounts).where(eq(stockCounts.id, id));
        if (!count.length) return res.status(404).json({ error: 'Count not found' });
        if (req.effectiveBranchId && count[0].branchId !== req.effectiveBranchId) return res.status(403).json({ error: 'BRANCH_MISMATCH' });
        if (!['DRAFT', 'COUNTING'].includes(String(count[0].status || ''))) return res.status(409).json({ error: 'COUNT_NOT_READY_TO_FREEZE' });
        
        const lines = await db.transaction(async (tx) => {
            await tx.update(stockCounts)
                .set({ status: 'FROZEN', frozenAt: new Date() })
                .where(eq(stockCounts.id, id));

            const targetWarehouseId = count[0].warehouseId;
            if (!targetWarehouseId) throw new Error('WAREHOUSE_ID_REQUIRED');

            await tx.delete(stockCountLines).where(eq(stockCountLines.countId, id));

            const stocks = await tx.select().from(inventoryStock)
                .where(eq(inventoryStock.warehouseId, targetWarehouseId));

            const countLinesToInsert = stocks.map(stock => ({
                countId: id,
                itemId: stock.itemId,
                expectedQty: stock.quantity || 0,
                cost: 0 // Will fetch moving average cost accurately
            }));

            // Fetch current moving average costs from inventoryItems
            const items = await tx.select().from(inventoryItems);
            const costMap = new Map(items.map(i => [i.id, i.costPrice || 0]));

            for (const line of countLinesToInsert) {
                line.cost = costMap.get(line.itemId) || 0;
            }

            if (countLinesToInsert.length > 0) {
                await tx.insert(stockCountLines).values(countLinesToInsert);
            }
            
            return await tx.select().from(stockCountLines).where(eq(stockCountLines.countId, id));
        });

        res.json({
            id,
            branchId: count[0].branchId,
            warehouseId: count[0].warehouseId,
            countDate: count[0].countDate || toDateOnly(count[0].scheduledDate),
            status: 'FROZEN',
            items: await enrichCountLines(lines),
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Submit physical counted quantities
 */
export const submitCount = async (req: Request, res: Response) => {
    try {
        const id = getStringParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'COUNT_ID_REQUIRED' });
        const { counts, finalize = true } = req.body; // { itemId, countedQty, notes }[]
        if (!Array.isArray(counts)) return res.status(400).json({ error: 'COUNTS_REQUIRED' });

        const count = await db.select().top(1).from(stockCounts).where(eq(stockCounts.id, id));
        if (!count.length) return res.status(404).json({ error: 'Count not found' });
        if (count[0].status === 'POSTED') return res.status(409).json({ error: 'COUNT_ALREADY_POSTED' });
        if (!['FROZEN', 'COUNTING'].includes(String(count[0].status || ''))) return res.status(409).json({ error: 'COUNT_NOT_READY_TO_SUBMIT' });
        if (req.effectiveBranchId && count[0].branchId !== req.effectiveBranchId) return res.status(403).json({ error: 'BRANCH_MISMATCH' });
        
        await db.transaction(async (tx) => {
            for (const itemCount of counts) {
                const existing = await tx.select().top(1).from(stockCountLines)
                    .where(and(eq(stockCountLines.countId, id), eq(stockCountLines.itemId, itemCount.itemId)));
                    
                if (existing.length) {
                    const expected = existing[0].expectedQty || 0;
                    const countedQty = itemCount.countedQty === null || itemCount.countedQty === undefined
                        ? null
                        : Number(itemCount.countedQty);
                    if (countedQty !== null && (!Number.isFinite(countedQty) || countedQty < 0)) {
                        throw new Error('COUNTED_QUANTITY_INVALID');
                    }
                    const varianceQty = countedQty === null ? null : countedQty - expected;
                    
                    await tx.update(stockCountLines)
                        .set({ countedQty, varianceQty, notes: itemCount.notes || null })
                        .where(eq(stockCountLines.id, existing[0].id));
                }
            }
            
            if (finalize !== false) {
                await tx.update(stockCounts).set({ status: 'REVIEW' }).where(eq(stockCounts.id, id));
            }
        });

        res.json({ success: true, status: finalize === false ? count[0].status : 'REVIEW' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Post the count and book financial variances to GL
 */
export const postStockCount = async (req: Request, res: Response) => {
    try {
        const id = getStringParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'COUNT_ID_REQUIRED' });
        const { userId } = req.body;
        
        const count = await db.select().top(1).from(stockCounts).where(eq(stockCounts.id, id));
        if (!count.length) return res.status(404).json({ error: 'Count not found' });
        if (count[0].status === 'POSTED') return res.status(409).json({ error: 'COUNT_ALREADY_POSTED' });
        if (count[0].status !== 'REVIEW') return res.status(409).json({ error: 'COUNT_NOT_READY' });
        if (req.effectiveBranchId && count[0].branchId !== req.effectiveBranchId) return res.status(403).json({ error: 'BRANCH_MISMATCH' });
        
        let totalVarianceValue = 0;

        await db.transaction(async (tx) => {
            const lines = await tx.select().from(stockCountLines).where(eq(stockCountLines.countId, id));
            if (lines.length === 0 || lines.some((line) => line.countedQty === null || line.countedQty === undefined)) {
                throw new Error('COUNT_INCOMPLETE');
            }
            
            const { stockMovements, auditLogs } = await import('../../src/db/schema');
            const [warehouse] = count[0].warehouseId
                ? await tx.select().top(1).from(warehouses).where(eq(warehouses.id, count[0].warehouseId))
                : await tx.select().top(1).from(warehouses).where(eq(warehouses.branchId, count[0].branchId));
            if (!warehouse) throw new Error('NO_WAREHOUSE_FOR_BRANCH');

            for (const line of lines) {
                if (line.varianceQty && line.varianceQty !== 0) {
                    const value = line.varianceQty * (line.cost || 0);
                    totalVarianceValue += value;
                    
                    // Actually adjust inventoryStock
                    const [existingStock] = await tx.select().from(inventoryStock).where(
                        and(eq(inventoryStock.itemId, line.itemId), eq(inventoryStock.warehouseId, warehouse.id))
                    );

                    if (existingStock) {
                        await tx.update(inventoryStock)
                            .set({ quantity: line.countedQty, lastUpdated: new Date() })
                            .where(eq(inventoryStock.id, existingStock.id));
                    } else {
                        await tx.insert(inventoryStock).values({
                            itemId: line.itemId,
                            warehouseId: warehouse.id,
                            quantity: line.countedQty,
                            lastUpdated: new Date()
                        });
                    }

                    // Record stock movement
                    await tx.insert(stockMovements).values({
                        itemId: line.itemId,
                        fromWarehouseId: Number(line.varianceQty || 0) < 0 ? warehouse.id : null,
                        toWarehouseId: Number(line.varianceQty || 0) > 0 ? warehouse.id : null,
                        quantity: Math.abs(Number(line.varianceQty || 0)),
                        type: 'ADJUSTMENT',
                        reason: `Stock Count Variance: ${id}`,
                        performedBy: userId || 'system',
                        referenceId: id,
                        createdAt: new Date()
                    });

                    const variance = Number(line.varianceQty || 0);
                    if (variance < 0) {
                        let remaining = Math.abs(variance);
                        const batches = await tx.select().from(inventoryBatches).where(and(
                            eq(inventoryBatches.itemId, line.itemId),
                            eq(inventoryBatches.warehouseId, warehouse.id),
                            sql`${inventoryBatches.currentQty} > 0`
                        )).orderBy(asc(inventoryBatches.expiryDate));
                        if (batches.reduce((sum, batch) => sum + Number(batch.currentQty || 0), 0) + 0.000001 < remaining) {
                            throw new Error('COUNT_BATCH_QUANTITY_MISMATCH');
                        }
                        for (const batch of batches) {
                            if (remaining <= 0.000001) break;
                            const used = Math.min(remaining, Number(batch.currentQty || 0));
                            const nextQty = Number(batch.currentQty || 0) - used;
                            await tx.update(inventoryBatches).set({ currentQty: nextQty, status: nextQty <= 0.000001 ? 'DEPLETED' : batch.status }).where(eq(inventoryBatches.id, batch.id));
                            remaining -= used;
                        }
                    } else if (variance > 0) {
                        const expiry = new Date();
                        expiry.setFullYear(expiry.getFullYear() + 1);
                        await tx.insert(inventoryBatches).values({
                            id: `BATCH-COUNT-${crypto.randomUUID()}`,
                            itemId: line.itemId,
                            warehouseId: warehouse.id,
                            batchNumber: `COUNT-${id}-${line.itemId}`,
                            expiryDate: expiry,
                            receivedDate: new Date(),
                            initialQty: variance,
                            currentQty: variance,
                            unitCost: Number(line.cost || 0),
                            status: 'ACTIVE',
                            createdAt: new Date(),
                        });
                    }

                    // Log Audit
                    await tx.insert(auditLogs).values({
                        eventType: 'INVENTORY_COUNT_ADJUSTMENT',
                        userId: userId || null,
                        branchId: count[0].branchId,
                        payload: {
                            countId: id,
                            itemId: line.itemId,
                            warehouseId: warehouse.id,
                            expectedQty: line.expectedQty,
                            countedQty: line.countedQty,
                            varianceQty: line.varianceQty
                        },
                        createdAt: new Date()
                    });
                }
            }
            
            await tx.update(stockCounts).set({ status: 'POSTED', postedAt: new Date(), approvedBy: userId }).where(eq(stockCounts.id, id));
        });

        // GL Posting for Variances
        // If totalVarianceValue is negative, total stock value decreased (Wastage Expense DEBIT | Inventory Asset CREDIT)
        // If positive, stock value increased (Inventory Asset DEBIT | Inventory Gain CREDIT)
        if (Math.abs(totalVarianceValue) > 0) {
            if (totalVarianceValue < 0) {
                const posting = await postWastageEntry({ referenceId: id, amount: Math.abs(totalVarianceValue), branchId: count[0].branchId, userId: userId || 'system', reason: 'Stock count shortage' });
                if (posting.status === 'failed') throw new Error(`STOCK_COUNT_FINANCE_EXCEPTION|${posting.reason}`);
            } else {
                await postInventoryAdjustmentReversalEntry({ referenceId: id, amount: Math.abs(totalVarianceValue), branchId: count[0].branchId, userId: userId || 'system', reason: 'Stock count surplus' });
            }
        }

        res.json({ success: true, status: 'POSTED', varianceValue: totalVarianceValue });
    } catch (error: any) {
        res.status(error?.message === 'COUNT_INCOMPLETE' ? 409 : 500).json({ error: error.message });
    }
};
