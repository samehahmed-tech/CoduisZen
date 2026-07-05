import { Request, Response } from 'express';
import { eq, and, sql, gte, lte, inArray, desc } from 'drizzle-orm';
import { db } from '../../db';
import { orders, orderItems, menuItems, inventoryItems, inventoryBatches, purchaseOrders, purchaseOrderItems, suppliers, auditLogs, recipes, fiscalLogs, etaDeadLetters } from '../../../src/db/schema';
import { parseLocalDateRange } from './reportUtils';

export const getSeasonalityReport = async (req: Request, res: Response) => {
    try {
        const { branchId } = req.query;
        const conditions: any[] = [inArray(orders.status, ['DELIVERED', 'COMPLETED'])];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const rows = await db.select({
            month: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM')`,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            avgTicket: sql<number>`coalesce(avg(${orders.total}), 0)`,
        }).from(orders).where(and(...conditions))
            .groupBy(sql`to_char(${orders.createdAt}, 'YYYY-MM')`)
            .orderBy(sql`to_char(${orders.createdAt}, 'YYYY-MM')`)
            .limit(24);

        res.json(rows.map(r => ({ month: r.month, orderCount: Number(r.orderCount), revenue: Number(Number(r.revenue).toFixed(2)), avgTicket: Number(Number(r.avgTicket).toFixed(2)) })));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getOnlineVsOfflineTrend = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, deliveredStatuses)];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const rows = await db.select({
            day: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM-DD')`,
            source: orders.source,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
        }).from(orders).where(and(...conditions))
            .groupBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`, orders.source)
            .orderBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`);

        const online = ['online', 'app', 'website'];
        const dailyMap = new Map<string, { online: number; offline: number; onlineOrders: number; offlineOrders: number }>();
        for (const r of rows) {
            const d = dailyMap.get(r.day) || { online: 0, offline: 0, onlineOrders: 0, offlineOrders: 0 };
            if (online.includes(r.source?.toLowerCase() || '')) { d.online += Number(r.revenue); d.onlineOrders += Number(r.orderCount); }
            else { d.offline += Number(r.revenue); d.offlineOrders += Number(r.orderCount); }
            dailyMap.set(r.day, d);
        }

        res.json(Array.from(dailyMap.entries()).map(([day, d]) => ({
            day, onlineRevenue: Number(d.online.toFixed(2)), offlineRevenue: Number(d.offline.toFixed(2)),
            onlineOrders: d.onlineOrders, offlineOrders: d.offlineOrders,
            onlinePercent: (d.online + d.offline) > 0 ? Number(((d.online / (d.online + d.offline)) * 100).toFixed(1)) : 0,
        })));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getFoodCostTrend = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, deliveredStatuses)];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const rows = await db.select({
            day: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM-DD')`,
            revenue: sql<number>`coalesce(sum(${orderItems.price} * ${orderItems.quantity}), 0)`,
            cost: sql<number>`coalesce(sum(coalesce(${menuItems.cost}, 0) * ${orderItems.quantity}), 0)`,
        }).from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .leftJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
            .where(and(...conditions))
            .groupBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`)
            .orderBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`);

        res.json(rows.map(r => {
            const rev = Number(r.revenue); const cost = Number(r.cost);
            return { day: r.day, revenue: Number(rev.toFixed(2)), cost: Number(cost.toFixed(2)), foodCostPercent: rev > 0 ? Number(((cost / rev) * 100).toFixed(1)) : 0 };
        }));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getTaxComplianceSummary = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);

        const fiscalStats = await db.select({
            status: fiscalLogs.status,
            count: sql<number>`count(*)`,
        }).from(fiscalLogs).where(and(gte(fiscalLogs.createdAt, start), lte(fiscalLogs.createdAt, end))).groupBy(fiscalLogs.status);

        const deadLetters = await db.select({
            status: etaDeadLetters.status,
            count: sql<number>`count(*)`,
        }).from(etaDeadLetters).where(and(gte(etaDeadLetters.createdAt, start), lte(etaDeadLetters.createdAt, end))).groupBy(etaDeadLetters.status);

        const total = fiscalStats.reduce((s, r) => s + Number(r.count), 0);
        const submitted = Number(fiscalStats.find(r => r.status === 'SUBMITTED')?.count || 0);
        const failed = Number(fiscalStats.find(r => r.status === 'FAILED')?.count || 0);

        res.json({
            fiscal: { total, submitted, failed, pending: total - submitted - failed, successRate: total > 0 ? Number(((submitted / total) * 100).toFixed(1)) : 0 },
            deadLetters: deadLetters.map(r => ({ status: r.status, count: Number(r.count) })),
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getAuditTrailReport = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const conditions: any[] = [gte(auditLogs.createdAt, start), lte(auditLogs.createdAt, end)];
        if (branchId && branchId !== 'undefined') conditions.push(eq(auditLogs.branchId, branchId as string));

        const byType = await db.select({
            eventType: auditLogs.eventType,
            count: sql<number>`count(*)`,
        }).from(auditLogs).where(and(...conditions)).groupBy(auditLogs.eventType).orderBy(sql`count(*) desc`).limit(20);

        const byUser = await db.select({
            userName: auditLogs.userName,
            userRole: auditLogs.userRole,
            count: sql<number>`count(*)`,
        }).from(auditLogs).where(and(...conditions)).groupBy(auditLogs.userName, auditLogs.userRole).orderBy(sql`count(*) desc`).limit(20);

        const recent = await db.select({
            id: auditLogs.id,
            eventType: auditLogs.eventType,
            userName: auditLogs.userName,
            userRole: auditLogs.userRole,
            reason: auditLogs.reason,
            createdAt: auditLogs.createdAt,
        }).from(auditLogs).where(and(...conditions)).orderBy(desc(auditLogs.createdAt)).limit(100);

        res.json({ byType: byType.map(r => ({ ...r, count: Number(r.count) })), byUser: byUser.map(r => ({ ...r, count: Number(r.count) })), recent });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getCashFlowForecast = async (req: Request, res: Response) => {
    try {
        const { branchId } = req.query;
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
        const conditions: any[] = [inArray(orders.status, deliveredStatuses)];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        // Last 12 weeks of daily revenue
        const rows = await db.select({
            week: sql<string>`to_char(${orders.createdAt}, 'IYYY-IW')`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            orderCount: sql<number>`count(*)`,
        }).from(orders).where(and(...conditions, sql`${orders.createdAt} > now() - interval '12 weeks'`))
            .groupBy(sql`to_char(${orders.createdAt}, 'IYYY-IW')`)
            .orderBy(sql`to_char(${orders.createdAt}, 'IYYY-IW')`);

        const weeklyRevenues = rows.map(r => Number(r.revenue));
        const avgWeekly = weeklyRevenues.length > 0 ? weeklyRevenues.reduce((s, v) => s + v, 0) / weeklyRevenues.length : 0;
        const trend = weeklyRevenues.length >= 2 ? (weeklyRevenues[weeklyRevenues.length - 1] - weeklyRevenues[0]) / (weeklyRevenues.length - 1) : 0;

        const forecast = Array.from({ length: 4 }).map((_, i) => ({
            week: `+${i + 1}`,
            projectedRevenue: Number((avgWeekly + trend * (i + 1)).toFixed(2)),
        }));

        res.json({ history: rows.map(r => ({ week: r.week, revenue: Number(Number(r.revenue).toFixed(2)), orderCount: Number(r.orderCount) })), forecast, avgWeeklyRevenue: Number(avgWeekly.toFixed(2)), weeklyTrend: Number(trend.toFixed(2)) });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getSupplierPriceTracking = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const conditions: any[] = [gte(purchaseOrders.createdAt, start), lte(purchaseOrders.createdAt, end)];
        if (branchId && branchId !== 'undefined') conditions.push(eq(purchaseOrders.branchId, branchId as string));

        const rows = await db.select({
            itemId: purchaseOrderItems.itemId,
            itemName: inventoryItems.name,
            supplierId: purchaseOrders.supplierId,
            supplierName: suppliers.name,
            avgPrice: sql<number>`coalesce(avg(${purchaseOrderItems.unitPrice}), 0)`,
            minPrice: sql<number>`coalesce(min(${purchaseOrderItems.unitPrice}), 0)`,
            maxPrice: sql<number>`coalesce(max(${purchaseOrderItems.unitPrice}), 0)`,
            totalQty: sql<number>`coalesce(sum(${purchaseOrderItems.receivedQty}), 0)`,
        }).from(purchaseOrderItems)
            .innerJoin(purchaseOrders, eq(purchaseOrderItems.poId, purchaseOrders.id))
            .innerJoin(inventoryItems, eq(purchaseOrderItems.itemId, inventoryItems.id))
            .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
            .where(and(...conditions))
            .groupBy(purchaseOrderItems.itemId, inventoryItems.name, purchaseOrders.supplierId, suppliers.name)
            .orderBy(inventoryItems.name);

        res.json(rows.map(r => ({ itemId: r.itemId, itemName: r.itemName, supplierId: r.supplierId, supplierName: r.supplierName, avgPrice: Number(Number(r.avgPrice).toFixed(2)), minPrice: Number(Number(r.minPrice).toFixed(2)), maxPrice: Number(Number(r.maxPrice).toFixed(2)), totalQty: Number(Number(r.totalQty).toFixed(2)), priceVariance: Number((Number(r.maxPrice) - Number(r.minPrice)).toFixed(2)) })));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getRecipeCostAlerts = async (_req: Request, res: Response) => {
    try {
        const allRecipes = await db.select({
            recipeId: recipes.id,
            menuItemId: recipes.menuItemId,
            menuItemName: menuItems.name,
            menuItemPrice: menuItems.price,
            calculatedCost: recipes.calculatedCost,
        }).from(recipes).innerJoin(menuItems, eq(recipes.menuItemId, menuItems.id));

        const alerts = allRecipes.map(r => {
            const price = Number(r.menuItemPrice) || 0;
            const cost = Number(r.calculatedCost) || 0;
            const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
            return { recipeId: r.recipeId, menuItemId: r.menuItemId, menuItemName: r.menuItemName, price: Number(price.toFixed(2)), cost: Number(cost.toFixed(2)), margin: Number(margin.toFixed(1)), alert: margin < 30 ? 'CRITICAL' : margin < 50 ? 'WARNING' : 'OK' };
        }).sort((a, b) => a.margin - b.margin);

        res.json({ critical: alerts.filter(a => a.alert === 'CRITICAL').length, warning: alerts.filter(a => a.alert === 'WARNING').length, ok: alerts.filter(a => a.alert === 'OK').length, items: alerts });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getABCClassification = async (_req: Request, res: Response) => {
    try {
        const rows = await db.select({
            itemId: inventoryBatches.itemId,
            itemName: inventoryItems.name,
            unit: inventoryItems.unit,
            totalValue: sql<number>`coalesce(sum(${inventoryBatches.currentQty} * ${inventoryBatches.unitCost}), 0)`,
            totalQty: sql<number>`coalesce(sum(${inventoryBatches.currentQty}), 0)`,
        }).from(inventoryBatches)
            .innerJoin(inventoryItems, eq(inventoryBatches.itemId, inventoryItems.id))
            .where(sql`${inventoryBatches.currentQty} > 0`)
            .groupBy(inventoryBatches.itemId, inventoryItems.name, inventoryItems.unit)
            .orderBy(sql`sum(${inventoryBatches.currentQty} * ${inventoryBatches.unitCost}) desc`);

        const totalValue = rows.reduce((s, r) => s + Number(r.totalValue), 0);
        let cumulative = 0;
        const classified = rows.map(r => {
            cumulative += Number(r.totalValue);
            const cumulativePercent = totalValue > 0 ? (cumulative / totalValue) * 100 : 0;
            return { itemId: r.itemId, itemName: r.itemName, unit: r.unit, totalValue: Number(Number(r.totalValue).toFixed(2)), totalQty: Number(Number(r.totalQty).toFixed(3)), valuePercent: totalValue > 0 ? Number(((Number(r.totalValue) / totalValue) * 100).toFixed(1)) : 0, cumulativePercent: Number(cumulativePercent.toFixed(1)), classification: cumulativePercent <= 80 ? 'A' : cumulativePercent <= 95 ? 'B' : 'C' };
        });

        res.json({ totalValue: Number(totalValue.toFixed(2)), a: classified.filter(c => c.classification === 'A').length, b: classified.filter(c => c.classification === 'B').length, c: classified.filter(c => c.classification === 'C').length, items: classified });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
