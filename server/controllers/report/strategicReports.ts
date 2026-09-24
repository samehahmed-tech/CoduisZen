import { Request, Response } from 'express';
import { eq, and, sql, gte, lte, inArray, desc, isNull } from 'drizzle-orm';
import { db } from '../../db';
import { orders, orderItems, menuItems, inventoryItems, inventoryBatches, stockMovements, purchaseOrders, purchaseOrderItems, suppliers, auditLogs, recipes, recipeIngredients, fiscalLogs, etaDeadLetters } from '../../../src/db/schema';
import { parseLocalDateRange, orderBusinessDateFilter, orderBusinessDayExpression } from './reportUtils';
import { revenueEligibleOrder } from '../../utils/orderRevenue';

const notDeleted = isNull(orders.deletedAt);
const liveLine = sql`coalesce(${orderItems.status}, '') not in ('VOID', 'VOIDED', 'CANCELLED')`;

export const getSeasonalityReport = async (req: Request, res: Response) => {
    try {
        const { branchId, months } = req.query;
        // Lookback window, default 24 months. The in-progress month is flagged
        // partial:true (never compare it 1:1 with full months).
        const lookback = Math.min(60, Math.max(1, Number(months) || 24));
        const conditions: any[] = [
            inArray(orders.status, ['DELIVERED', 'COMPLETED']),
            notDeleted,
            sql`${orders.createdAt} > dateadd(month, -${lookback}, getdate())`,
        ];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const rows = await db.select({
            month: sql<string>`format(${orders.createdAt}, 'yyyy-MM')`,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            avgTicket: sql<number>`coalesce(avg(${orders.total}), 0)`,
        }).from(orders).where(and(...conditions))
            .groupBy(sql`format(${orders.createdAt}, 'yyyy-MM')`)
            .orderBy(sql`format(${orders.createdAt}, 'yyyy-MM')`)
            .limit(lookback);

        res.json(rows.map(r => ({ month: r.month, partial: r.month === currentMonth, orderCount: Number(r.orderCount), revenue: Number(Number(r.revenue).toFixed(2)), avgTicket: Number(Number(r.avgTicket).toFixed(2)) })));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getOnlineVsOfflineTrend = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const conditions: any[] = [businessDateFilter, revenueEligibleOrder(), notDeleted];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        // Online = digital origins (app/website/online) plus aggregator
        // deliveries (deliverySource other than restaurant); everything else
        // (pos, call_center in-house) counts as offline. Same channel rule
        // as channel-mix, evaluated per row in JS for clarity.
        const day = orderBusinessDayExpression();
        const rows = await db.select({
            day,
            source: orders.source,
            deliverySource: orders.deliverySource,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
        }).from(orders).where(and(...conditions))
            .groupBy(day, orders.source, orders.deliverySource)
            .orderBy(day);

        const onlineSources = ['online', 'app', 'website'];
        const dailyMap = new Map<string, { online: number; offline: number; onlineOrders: number; offlineOrders: number }>();
        for (const r of rows) {
            const d = dailyMap.get(r.day) || { online: 0, offline: 0, onlineOrders: 0, offlineOrders: 0 };
            const ds = String((r as any).deliverySource || '').toLowerCase();
            const isOnline = onlineSources.includes(String(r.source || '').toLowerCase()) || (ds !== '' && ds !== 'restaurant');
            if (isOnline) { d.online += Number(r.revenue); d.onlineOrders += Number(r.orderCount); }
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
        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const conditions: any[] = [businessDateFilter, revenueEligibleOrder(), notDeleted];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        // Cost from the per-line snapshot (history never reprices); revenue is
        // gross item sales (modifiers/discounts/fees excluded — same basis as
        // sales-by-item, reconciles with it, not with order totals).
        const day = orderBusinessDayExpression();
        const rows = await db.select({
            day,
            revenue: sql<number>`coalesce(sum(${orderItems.price} * ${orderItems.quantity}), 0)`,
            cost: sql<number>`coalesce(sum(coalesce(${orderItems.cost}, ${menuItems.cost}, 0) * ${orderItems.quantity}), 0)`,
        }).from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .leftJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
            .where(and(...conditions, liveLine))
            .groupBy(day)
            .orderBy(day);

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
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const fiscalConds: any[] = [gte(fiscalLogs.createdAt, start), lte(fiscalLogs.createdAt, end)];
        if (branchId && branchId !== 'undefined') fiscalConds.push(eq(fiscalLogs.branchId, branchId as string));

        const fiscalStats = await db.select({
            status: fiscalLogs.status,
            count: sql<number>`count(*)`,
        }).from(fiscalLogs).where(and(...fiscalConds)).groupBy(fiscalLogs.status);

        const deadLetters = await db.select({
            status: etaDeadLetters.status,
            count: sql<number>`count(*)`,
        }).from(etaDeadLetters).where(and(gte(etaDeadLetters.createdAt, start), lte(etaDeadLetters.createdAt, end))).groupBy(etaDeadLetters.status);

        const total = fiscalStats.reduce((s, r) => s + Number(r.count), 0);
        const submitted = Number(fiscalStats.find(r => r.status === 'SUBMITTED')?.count || 0);
        const failed = Number(fiscalStats.find(r => r.status === 'FAILED')?.count || 0);

        res.json({
            fiscal: {
                total, submitted, failed,
                pending: total - submitted - failed,
                successRate: total > 0 ? Number(((submitted / total) * 100).toFixed(1)) : 0,
                // Full status breakdown (statuses: PENDING / SUBMITTED / FAILED).
                byStatus: fiscalStats.map(r => ({ status: r.status, count: Number(r.count) })),
                branchId: (branchId as string) || 'ALL',
            },
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
        const conditions: any[] = [revenueEligibleOrder()];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        // Last 12 ISO weeks of revenue. (Was: Oracle 'yyyy-IW' format which
        // SQL Server does not understand — buckets were wrong.)
        const weekExpr = sql<string>`concat(datepart(year, ${orders.createdAt}), '-W', right('0' + cast(datepart(iso_week, ${orders.createdAt}) as varchar(2)), 2))`;
        const rows = await db.select({
            week: weekExpr,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            orderCount: sql<number>`count(*)`,
        }).from(orders).where(and(...conditions, notDeleted, sql`${orders.createdAt} > dateadd(week, -12, getdate())`))
            .groupBy(weekExpr)
            .orderBy(weekExpr);

        const weeklyRevenues = rows.map(r => Number(r.revenue));
        const avgWeekly = weeklyRevenues.length > 0 ? weeklyRevenues.reduce((s, v) => s + v, 0) / weeklyRevenues.length : 0;
        const trend = weeklyRevenues.length >= 2 ? (weeklyRevenues[weeklyRevenues.length - 1] - weeklyRevenues[0]) / (weeklyRevenues.length - 1) : 0;

        // Floor at zero: a falling trend must never project negative revenue.
        const forecast = Array.from({ length: 4 }).map((_, i) => ({
            week: `+${i + 1}`,
            projectedRevenue: Number(Math.max(0, avgWeekly + trend * (i + 1)).toFixed(2)),
        }));

        res.json({
            history: rows.map(r => ({ week: r.week, revenue: Number(Number(r.revenue).toFixed(2)), orderCount: Number(r.orderCount) })),
            forecast,
            avgWeeklyRevenue: Number(avgWeekly.toFixed(2)),
            weeklyTrend: Number(trend.toFixed(2)),
            // Revenue-only projection (no opex/payouts modeled).
            basis: 'revenue_only_estimate',
            estimate: true,
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getSupplierPriceTracking = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        // Only RECEIVED/PARTIAL lines with actual receipts — DRAFT/SENT/
        // CANCELLED lines carry phantom prices and zero receipts.
        const conditions: any[] = [
            gte(purchaseOrders.createdAt, start),
            lte(purchaseOrders.createdAt, end),
            inArray(purchaseOrders.status, ['RECEIVED', 'PARTIAL']),
            sql`${purchaseOrderItems.receivedQty} > 0`,
        ];
        if (branchId && branchId !== 'undefined') conditions.push(eq(purchaseOrders.branchId, branchId as string));

        const rows = await db.select({
            itemId: purchaseOrderItems.itemId,
            itemName: inventoryItems.name,
            supplierId: purchaseOrders.supplierId,
            supplierName: suppliers.name,
            // Quantity-weighted average (a 1-unit receipt must not outweigh a
            // 1000-unit one) + plain min/max for the range.
            avgPrice: sql<number>`coalesce(sum(${purchaseOrderItems.unitPrice} * ${purchaseOrderItems.receivedQty}) / nullif(sum(${purchaseOrderItems.receivedQty}), 0), 0)`,
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
        // Live cost recomputed from current ingredient master costs (per
        // serving = Σ qty × costPrice / yield). The stored calculatedCost may
        // be stale — it is shown for comparison and flagged when old.
        const rows = await db.select({
            recipeId: recipes.id,
            menuItemId: recipes.menuItemId,
            menuItemName: menuItems.name,
            menuItemPrice: menuItems.price,
            recipeYield: recipes.yield,
            storedCost: recipes.calculatedCost,
            lastCostCalculation: recipes.lastCostCalculation,
            liveCost: sql<number>`coalesce(sum(${recipeIngredients.quantity} * coalesce(${inventoryItems.costPrice}, ${inventoryItems.purchasePrice}, 0)) / nullif(${recipes.yield}, 0), 0)`,
        }).from(recipes)
            .innerJoin(menuItems, eq(recipes.menuItemId, menuItems.id))
            .leftJoin(recipeIngredients, eq(recipeIngredients.recipeId, recipes.id))
            .leftJoin(inventoryItems, eq(recipeIngredients.inventoryItemId, inventoryItems.id))
            .where(isNull(menuItems.deletedAt))
            .groupBy(recipes.id, recipes.menuItemId, menuItems.name, menuItems.price, recipes.yield, recipes.calculatedCost, recipes.lastCostCalculation);

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const alerts = rows.map(r => {
            const price = Number(r.menuItemPrice) || 0;
            const cost = Number(r.liveCost || 0);
            const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
            const lastCalc = r.lastCostCalculation ? new Date(r.lastCostCalculation as any) : null;
            return {
                recipeId: r.recipeId,
                menuItemId: r.menuItemId,
                menuItemName: r.menuItemName,
                price: Number(price.toFixed(2)),
                cost: Number(cost.toFixed(2)),
                storedCost: Number(Number(r.storedCost || 0).toFixed(2)),
                stale: !lastCalc || lastCalc < thirtyDaysAgo,
                margin: Number(margin.toFixed(1)),
                // Fixed house bands (documented): <30% CRITICAL, <50% WARNING.
                alert: margin < 30 ? 'CRITICAL' : margin < 50 ? 'WARNING' : 'OK',
            };
        }).sort((a, b) => a.margin - b.margin);

        res.json({ critical: alerts.filter(a => a.alert === 'CRITICAL').length, warning: alerts.filter(a => a.alert === 'WARNING').length, ok: alerts.filter(a => a.alert === 'OK').length, costBasis: 'LIVE_INGREDIENT_COST', items: alerts });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getABCClassification = async (_req: Request, res: Response) => {
    try {
        // ABC ranks by 90-day CONSUMPTION value (what the kitchen actually
        // burns), not on-hand value — ranking on-hand crowns dead stock "A"
        // and hides fast movers sitting at zero.
        const rows = await db.select({
            itemId: stockMovements.itemId,
            itemName: inventoryItems.name,
            unit: inventoryItems.unit,
            totalValue: sql<number>`coalesce(sum(abs(${stockMovements.quantity}) * ${stockMovements.unitCost}), 0)`,
            totalQty: sql<number>`coalesce(sum(abs(${stockMovements.quantity})), 0)`,
        }).from(stockMovements)
            .innerJoin(inventoryItems, eq(stockMovements.itemId, inventoryItems.id))
            .where(and(
                inArray(stockMovements.type, ['SALE_CONSUMPTION', 'PRODUCTION_CONSUMPTION']),
                sql`${stockMovements.createdAt} > dateadd(day, -90, getdate())`,
            ))
            .groupBy(stockMovements.itemId, inventoryItems.name, inventoryItems.unit)
            .orderBy(sql`sum(abs(${stockMovements.quantity}) * ${stockMovements.unitCost}) desc`);

        const totalValue = rows.reduce((s, r) => s + Number(r.totalValue), 0);
        let cumulative = 0;
        const classified = rows.map(r => {
            cumulative += Number(r.totalValue);
            const cumulativePercent = totalValue > 0 ? (cumulative / totalValue) * 100 : 0;
            return { itemId: r.itemId, itemName: r.itemName, unit: r.unit, totalValue: Number(Number(r.totalValue).toFixed(2)), totalQty: Number(Number(r.totalQty).toFixed(3)), valuePercent: totalValue > 0 ? Number(((Number(r.totalValue) / totalValue) * 100).toFixed(1)) : 0, cumulativePercent: Number(cumulativePercent.toFixed(1)), classification: cumulativePercent <= 80 ? 'A' : cumulativePercent <= 95 ? 'B' : 'C' };
        });

        res.json({ totalValue: Number(totalValue.toFixed(2)), basis: 'CONSUMPTION_VALUE_90D', a: classified.filter(c => c.classification === 'A').length, b: classified.filter(c => c.classification === 'B').length, c: classified.filter(c => c.classification === 'C').length, items: classified });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
