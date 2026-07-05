import { Request, Response } from 'express';
import { eq, and, sql, gte, lte, inArray, desc } from 'drizzle-orm';
import { db } from '../../db';
import { orders, orderItems, inventoryItems, inventoryBatches, stockMovements, purchaseOrders, suppliers, recipes, recipeIngredients } from '../../../src/db/schema';
import { parseLocalDateRange } from './reportUtils';

export const getActualVsTheoretical = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
        const orderConditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, deliveredStatuses)];
        if (branchId && branchId !== 'undefined') orderConditions.push(eq(orders.branchId, branchId as string));

        // Theoretical consumption: qty sold × recipe ingredient qty / recipe yield
        const theoreticalRows = await db.select({
            inventoryItemId: recipeIngredients.inventoryItemId,
            itemName: inventoryItems.name,
            unit: recipeIngredients.unit,
            theoreticalQty: sql<number>`coalesce(sum(${orderItems.quantity} * ${recipeIngredients.quantity} / coalesce(${recipes.yield}, 1)), 0)`,
        }).from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .innerJoin(recipes, eq(orderItems.menuItemId, recipes.menuItemId))
            .innerJoin(recipeIngredients, eq(recipes.id, recipeIngredients.recipeId))
            .innerJoin(inventoryItems, eq(recipeIngredients.inventoryItemId, inventoryItems.id))
            .where(and(...orderConditions))
            .groupBy(recipeIngredients.inventoryItemId, inventoryItems.name, recipeIngredients.unit);

        // Actual consumption: stock movements with type = CONSUMPTION/PRODUCTION/SALE
        const movementConditions: any[] = [gte(stockMovements.createdAt, start), lte(stockMovements.createdAt, end), inArray(stockMovements.type, ['CONSUMPTION', 'PRODUCTION', 'SALE', 'MANUAL_OUT'])];

        const actualRows = await db.select({
            inventoryItemId: stockMovements.itemId,
            actualQty: sql<number>`coalesce(sum(abs(${stockMovements.quantity})), 0)`,
        }).from(stockMovements).where(and(...movementConditions)).groupBy(stockMovements.itemId);

        const actualMap = new Map(actualRows.map(r => [r.inventoryItemId, Number(r.actualQty)]));

        res.json(theoreticalRows.map(r => {
            const theoretical = Number(Number(r.theoreticalQty).toFixed(3));
            const actual = actualMap.get(r.inventoryItemId) || 0;
            const variance = Number((actual - theoretical).toFixed(3));
            const variancePercent = theoretical > 0 ? Number(((variance / theoretical) * 100).toFixed(1)) : 0;
            return {
                inventoryItemId: r.inventoryItemId,
                itemName: r.itemName,
                unit: r.unit,
                theoreticalQty: theoretical,
                actualQty: Number(actual.toFixed(3)),
                variance,
                variancePercent,
            };
        }));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getPurchaseHistory = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const conditions: any[] = [gte(purchaseOrders.createdAt, start), lte(purchaseOrders.createdAt, end)];
        if (branchId && branchId !== 'undefined') conditions.push(eq(purchaseOrders.branchId, branchId as string));

        const bySupplier = await db.select({
            supplierId: purchaseOrders.supplierId,
            supplierName: suppliers.name,
            poCount: sql<number>`count(*)`,
            totalSpend: sql<number>`coalesce(sum(${purchaseOrders.subtotal}), 0)`,
        }).from(purchaseOrders)
            .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
            .where(and(...conditions))
            .groupBy(purchaseOrders.supplierId, suppliers.name)
            .orderBy(sql`sum(${purchaseOrders.subtotal}) desc`);

        const byStatus = await db.select({
            status: purchaseOrders.status,
            count: sql<number>`count(*)`,
            total: sql<number>`coalesce(sum(${purchaseOrders.subtotal}), 0)`,
        }).from(purchaseOrders).where(and(...conditions)).groupBy(purchaseOrders.status);

        const [summary] = await db.select({
            totalPOs: sql<number>`count(*)`,
            totalSpend: sql<number>`coalesce(sum(${purchaseOrders.subtotal}), 0)`,
            avgPO: sql<number>`coalesce(avg(${purchaseOrders.subtotal}), 0)`,
        }).from(purchaseOrders).where(and(...conditions));

        res.json({
            summary: { totalPOs: Number(summary?.totalPOs || 0), totalSpend: Number(Number(summary?.totalSpend || 0).toFixed(2)), avgPO: Number(Number(summary?.avgPO || 0).toFixed(2)) },
            bySupplier: bySupplier.map(r => ({ ...r, poCount: Number(r.poCount), totalSpend: Number(Number(r.totalSpend).toFixed(2)) })),
            byStatus: byStatus.map(r => ({ status: r.status, count: Number(r.count), total: Number(Number(r.total).toFixed(2)) })),
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getInventoryValuation = async (_req: Request, res: Response) => {
    try {
        // Current stock valuation from batches
        const batchValuation = await db.select({
            itemId: inventoryBatches.itemId,
            itemName: inventoryItems.name,
            unit: inventoryItems.unit,
            totalQty: sql<number>`coalesce(sum(${inventoryBatches.currentQty}), 0)`,
            totalValue: sql<number>`coalesce(sum(${inventoryBatches.currentQty} * ${inventoryBatches.unitCost}), 0)`,
            avgUnitCost: sql<number>`coalesce(avg(${inventoryBatches.unitCost}), 0)`,
            batchCount: sql<number>`count(*)`,
        }).from(inventoryBatches)
            .innerJoin(inventoryItems, eq(inventoryBatches.itemId, inventoryItems.id))
            .where(sql`${inventoryBatches.currentQty} > 0`)
            .groupBy(inventoryBatches.itemId, inventoryItems.name, inventoryItems.unit)
            .orderBy(sql`sum(${inventoryBatches.currentQty} * ${inventoryBatches.unitCost}) desc`);

        const totalValue = batchValuation.reduce((s, r) => s + Number(r.totalValue), 0);

        res.json({
            totalValue: Number(totalValue.toFixed(2)),
            items: batchValuation.map(r => ({
                itemId: r.itemId,
                itemName: r.itemName,
                unit: r.unit,
                totalQty: Number(Number(r.totalQty).toFixed(3)),
                totalValue: Number(Number(r.totalValue).toFixed(2)),
                avgUnitCost: Number(Number(r.avgUnitCost).toFixed(2)),
                batchCount: Number(r.batchCount),
            })),
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
