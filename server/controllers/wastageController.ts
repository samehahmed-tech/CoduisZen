import { Request, Response } from 'express';
import { db } from '../db';
import { stockMovements, inventoryStock, inventoryItems, warehouses, auditLogs } from '../../src/db/schema';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';
import { postWastageEntry } from '../services/financePostingService';
import { getIO } from '../socket';

/**
 * Record wastage (burnt, expired, damaged)
 */
export const recordWastage = async (req: Request, res: Response) => {
    try {
        const { itemId, warehouseId, quantity, reason, notes, performedBy } = req.body;
        const qty = Number(quantity);

        if (!itemId || !warehouseId || !reason || !Number.isFinite(qty) || qty <= 0) {
            return res.status(400).json({ error: 'itemId, warehouseId, quantity, and reason are required' });
        }

        const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
        const [warehouse] = await db.select().from(warehouses).where(eq(warehouses.id, warehouseId));
        if (!item) return res.status(404).json({ error: 'ITEM_NOT_FOUND' });
        if (!warehouse) return res.status(404).json({ error: 'WAREHOUSE_NOT_FOUND' });

        // 1. Deduct from stock
        const [updatedStock] = await db.update(inventoryStock)
            .set({
                quantity: sql`quantity - ${qty}`,
                lastUpdated: new Date(),
            })
            .where(
                and(
                    eq(inventoryStock.itemId, itemId),
                    eq(inventoryStock.warehouseId, warehouseId),
                    gte(inventoryStock.quantity, qty)
                )
            )
            .returning();
        if (!updatedStock) {
            const [stock] = await db.select().from(inventoryStock).where(and(eq(inventoryStock.itemId, itemId), eq(inventoryStock.warehouseId, warehouseId)));
            return res.status(stock ? 400 : 404).json({ error: stock ? 'INSUFFICIENT_STOCK' : 'STOCK_NOT_FOUND' });
        }

        // 2. Create wastage movement
        const [movement] = await db.insert(stockMovements).values({
            itemId,
            fromWarehouseId: warehouseId,
            quantity: qty,
            type: 'WASTE',
            reason, // BURNT, EXPIRED, DAMAGED, SPILLAGE, OTHER
            referenceId: notes || null,
            performedBy: performedBy || 'system',
            createdAt: new Date(),
        }).returning();

        await db.insert(auditLogs).values({
            eventType: 'INVENTORY_WASTAGE',
            userId: performedBy || null,
            branchId: warehouse?.branchId || null,
            payload: {
                itemId,
                warehouseId,
                quantity: qty,
                reason,
                notes: notes || null,
            },
            createdAt: new Date(),
        });

        const amount = qty * Number(item.costPrice || 0);
        if (amount > 0) {
            postWastageEntry({
                referenceId: String(movement.id),
                amount,
                branchId: warehouse?.branchId || undefined,
                userId: performedBy || 'system',
                reason,
            }).catch(() => undefined);
        }

        try {
            const [finalStock] = await db.select().from(inventoryStock).where(
                and(eq(inventoryStock.itemId, itemId), eq(inventoryStock.warehouseId, warehouseId))
            );
            if (warehouse?.branchId) {
                getIO().to(`branch:${warehouse.branchId}`).emit('stock:updated', {
                    itemId,
                    warehouseId,
                    quantity: Number(finalStock?.quantity || 0),
                    type: 'WASTE'
                });
            }
        } catch (e) {
            console.warn('Failed to emit stock:updated for wastage', e);
        }

        res.status(201).json({
            success: true,
            movement,
            message: `Recorded ${qty} units of waste for item ${itemId}`
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Get wastage report (aggregated by date, item, reason)
 */
export const getWastageReport = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, warehouseId } = req.query;

        let query = db.select({
            itemId: stockMovements.itemId,
            itemName: inventoryItems.name,
            reason: stockMovements.reason,
            totalQty: sql<number>`sum(${stockMovements.quantity})`,
            count: sql<number>`count(*)`,
        })
            .from(stockMovements)
            .innerJoin(inventoryItems, eq(stockMovements.itemId, inventoryItems.id))
            .where(eq(stockMovements.type, 'WASTE'))
            .groupBy(stockMovements.itemId, inventoryItems.name, stockMovements.reason)
            .orderBy(desc(sql`sum(${stockMovements.quantity})`));

        const report = await query;

        // Get totals
        const totalsQuery = await db.select({
            totalItems: sql<number>`count(distinct ${stockMovements.itemId})::int`,
            totalIncidents: sql<number>`count(*)::int`,
            totalQty: sql<number>`coalesce(sum(${stockMovements.quantity}), 0)`,
        })
            .from(stockMovements)
            .where(eq(stockMovements.type, 'WASTE'));

        const summary = totalsQuery[0] || { totalItems: 0, totalIncidents: 0, totalQty: 0 };
        res.json({
            items: report,
            summary,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Get recent wastage entries
 */
export const getRecentWastage = async (req: Request, res: Response) => {
    try {
        const { limit = 50 } = req.query;

        const entries = await db.select({
            id: stockMovements.id,
            itemId: stockMovements.itemId,
            itemName: inventoryItems.name,
            quantity: stockMovements.quantity,
            reason: stockMovements.reason,
            performedBy: stockMovements.performedBy,
            createdAt: stockMovements.createdAt,
        })
            .from(stockMovements)
            .innerJoin(inventoryItems, eq(stockMovements.itemId, inventoryItems.id))
            .where(eq(stockMovements.type, 'WASTE'))
            .orderBy(desc(stockMovements.createdAt))
            .limit(Number(limit));

        res.json(entries);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
