import { Request, Response } from 'express';
import { eq, and, sql, gte, lte, inArray, desc } from 'drizzle-orm';
import { db } from '../../db';
import { inventoryItems, inventoryStock, inventoryBatches, stockMovements, warehouses } from '../../../src/db/schema';
import { parseLocalDateRange } from './reportUtils';

export const getStockMovementLog = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);

        const conditions: any[] = [
            gte(stockMovements.createdAt, start),
            lte(stockMovements.createdAt, end),
        ];
        if (branchId) conditions.push(eq(warehouses.branchId, String(branchId)));

        const rows = await db.select({
            id: stockMovements.id,
            itemName: inventoryItems.name,
            quantity: stockMovements.quantity,
            unitCost: stockMovements.unitCost,
            totalCost: stockMovements.totalCost,
            type: stockMovements.type,
            reason: stockMovements.reason,
            performedBy: stockMovements.performedBy,
            createdAt: stockMovements.createdAt,
        })
            .from(stockMovements)
            .innerJoin(inventoryItems, eq(stockMovements.itemId, inventoryItems.id))
            .leftJoin(warehouses, eq(warehouses.id, stockMovements.fromWarehouseId))
            .where(and(...conditions))
            .orderBy(desc(stockMovements.createdAt))
            .limit(500);

        res.json(rows);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getWasteLossLog = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);

        const rows = await db.select({
            id: stockMovements.id,
            itemName: inventoryItems.name,
            unit: inventoryItems.unit,
            quantity: stockMovements.quantity,
            unitCost: stockMovements.unitCost,
            totalCost: stockMovements.totalCost,
            reason: stockMovements.reason,
            performedBy: stockMovements.performedBy,
            createdAt: stockMovements.createdAt,
        })
            .from(stockMovements)
            .innerJoin(inventoryItems, eq(stockMovements.itemId, inventoryItems.id))
            .where(and(
                gte(stockMovements.createdAt, start),
                lte(stockMovements.createdAt, end),
                inArray(stockMovements.type, ['WASTE', 'ADJUSTMENT'])
            ))
            .orderBy(desc(stockMovements.createdAt))
            .limit(500);

        const totalWasteCost = rows.reduce((s, r) => s + Number(r.totalCost || 0), 0);
        res.json({ items: rows, totalWasteCost, count: rows.length });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getReorderAlerts = async (_req: Request, res: Response) => {
    try {
        const rows = await db.select({
            itemId: inventoryItems.id,
            itemName: inventoryItems.name,
            unit: inventoryItems.unit,
            threshold: inventoryItems.threshold,
            costPrice: inventoryItems.costPrice,
            currentStock: sql<number>`coalesce(sum(${inventoryStock.quantity}), 0)`,
        })
            .from(inventoryItems)
            .leftJoin(inventoryStock, eq(inventoryItems.id, inventoryStock.itemId))
            .where(eq(inventoryItems.isActive, true))
            .groupBy(inventoryItems.id, inventoryItems.name, inventoryItems.unit, inventoryItems.threshold, inventoryItems.costPrice)
            .having(sql`coalesce(sum(${inventoryStock.quantity}), 0) <= ${inventoryItems.threshold}`)
            .orderBy(sql`coalesce(sum(${inventoryStock.quantity}), 0) asc`);

        res.json(rows.map(r => ({
            ...r,
            currentStock: Number(r.currentStock),
            deficit: Number(r.threshold || 0) - Number(r.currentStock),
        })));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getExpiringBatches = async (_req: Request, res: Response) => {
    try {
        const now = new Date();
        const thirtyDaysLater = new Date();
        thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

        const rows = await db.select({
            batchId: inventoryBatches.id,
            batchNumber: inventoryBatches.batchNumber,
            itemName: inventoryItems.name,
            unit: inventoryItems.unit,
            currentQty: inventoryBatches.currentQty,
            unitCost: inventoryBatches.unitCost,
            expiryDate: inventoryBatches.expiryDate,
            receivedDate: inventoryBatches.receivedDate,
            status: inventoryBatches.status,
        })
            .from(inventoryBatches)
            .innerJoin(inventoryItems, eq(inventoryBatches.itemId, inventoryItems.id))
            .where(and(
                lte(inventoryBatches.expiryDate, thirtyDaysLater),
                gte(inventoryBatches.currentQty, sql`0.01`),
                inArray(inventoryBatches.status, ['ACTIVE', 'QUARANTINE'])
            ))
            .orderBy(inventoryBatches.expiryDate)
            .limit(200);

        const totalAtRiskValue = rows.reduce((s, r) => s + Number(r.currentQty) * Number(r.unitCost), 0);
        const alreadyExpired = rows.filter(r => new Date(r.expiryDate!) <= now).length;

        res.json({ items: rows, totalAtRiskValue, alreadyExpired, totalBatches: rows.length });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
