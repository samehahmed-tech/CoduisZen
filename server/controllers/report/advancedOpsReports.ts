import { Request, Response } from 'express';
import { eq, and, sql, gte, lte, inArray, desc } from 'drizzle-orm';
import { db } from '../../db';
import { orders, orderItems, menuItems, branches, drivers } from '../../../src/db/schema';
import { parseLocalDateRange } from './reportUtils';

export const getKitchenPerformance = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const conditions: any[] = [
            gte(orders.createdAt, start), lte(orders.createdAt, end),
            sql`${orderItems.preparedAt} is not null`,
        ];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const rows = await db.select({
            itemName: orderItems.name,
            totalPrepared: sql<number>`count(*)`,
            avgPrepMinutes: sql<number>`coalesce(avg(extract(epoch from (${orderItems.preparedAt} - ${orders.createdAt})) / 60), 0)`,
            minPrepMinutes: sql<number>`coalesce(min(extract(epoch from (${orderItems.preparedAt} - ${orders.createdAt})) / 60), 0)`,
            maxPrepMinutes: sql<number>`coalesce(max(extract(epoch from (${orderItems.preparedAt} - ${orders.createdAt})) / 60), 0)`,
        }).from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .where(and(...conditions))
            .groupBy(orderItems.name)
            .orderBy(sql`count(*) desc`)
            .limit(50);

        res.json(rows.map(r => ({
            itemName: r.itemName,
            totalPrepared: Number(r.totalPrepared),
            avgPrepMinutes: Number(Number(r.avgPrepMinutes).toFixed(1)),
            minPrepMinutes: Number(Number(r.minPrepMinutes).toFixed(1)),
            maxPrepMinutes: Number(Number(r.maxPrepMinutes).toFixed(1)),
        })));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getMenuEngineeringMatrix = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, deliveredStatuses)];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const rows = await db.select({
            menuItemId: orderItems.menuItemId,
            itemName: orderItems.name,
            qtySold: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
            revenue: sql<number>`coalesce(sum(${orderItems.price} * ${orderItems.quantity}), 0)`,
            cost: sql<number>`coalesce(sum(coalesce(${menuItems.cost}, 0) * ${orderItems.quantity}), 0)`,
        }).from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .leftJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
            .where(and(...conditions))
            .groupBy(orderItems.menuItemId, orderItems.name);

        const totalQty = rows.reduce((s, r) => s + Number(r.qtySold), 0);
        const avgQty = totalQty / (rows.length || 1);
        const items = rows.map(r => {
            const qty = Number(r.qtySold);
            const rev = Number(r.revenue);
            const cost = Number(r.cost);
            const profit = rev - cost;
            const margin = rev > 0 ? (profit / rev) * 100 : 0;
            const avgMargin = rows.reduce((s, rr) => s + ((Number(rr.revenue) - Number(rr.cost)) / (Number(rr.revenue) || 1)) * 100, 0) / (rows.length || 1);
            const highPop = qty >= avgQty;
            const highProfit = margin >= avgMargin;
            let classification: string;
            if (highPop && highProfit) classification = 'Star';
            else if (highPop && !highProfit) classification = 'Plowhorse';
            else if (!highPop && highProfit) classification = 'Puzzle';
            else classification = 'Dog';
            return { menuItemId: r.menuItemId, itemName: r.itemName, qtySold: qty, revenue: Number(rev.toFixed(2)), cost: Number(cost.toFixed(2)), profit: Number(profit.toFixed(2)), margin: Number(margin.toFixed(1)), classification };
        }).sort((a, b) => b.revenue - a.revenue);
        const summary = { stars: items.filter(i => i.classification === 'Star').length, plowhorses: items.filter(i => i.classification === 'Plowhorse').length, puzzles: items.filter(i => i.classification === 'Puzzle').length, dogs: items.filter(i => i.classification === 'Dog').length };
        res.json({ summary, items });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getDaypartAnalysis = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, deliveredStatuses)];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const rows = await db.select({
            hour: sql<number>`extract(hour from ${orders.createdAt})`,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            avgTicket: sql<number>`coalesce(avg(${orders.total}), 0)`,
        }).from(orders).where(and(...conditions)).groupBy(sql`extract(hour from ${orders.createdAt})`);

        const dayparts = [
            { name: 'Breakfast', start: 6, end: 11, orderCount: 0, revenue: 0, avgTicket: 0, hours: [] as number[] },
            { name: 'Lunch', start: 11, end: 15, orderCount: 0, revenue: 0, avgTicket: 0, hours: [] as number[] },
            { name: 'Afternoon', start: 15, end: 18, orderCount: 0, revenue: 0, avgTicket: 0, hours: [] as number[] },
            { name: 'Dinner', start: 18, end: 23, orderCount: 0, revenue: 0, avgTicket: 0, hours: [] as number[] },
            { name: 'Late Night', start: 23, end: 6, orderCount: 0, revenue: 0, avgTicket: 0, hours: [] as number[] },
        ];

        for (const row of rows) {
            const h = Number(row.hour);
            for (const dp of dayparts) {
                const inRange = dp.start < dp.end ? (h >= dp.start && h < dp.end) : (h >= dp.start || h < dp.end);
                if (inRange) { dp.orderCount += Number(row.orderCount); dp.revenue += Number(row.revenue); dp.hours.push(h); break; }
            }
        }
        const totalRev = dayparts.reduce((s, d) => s + d.revenue, 0);
        res.json(dayparts.map(d => ({ name: d.name, orderCount: d.orderCount, revenue: Number(d.revenue.toFixed(2)), avgTicket: d.orderCount > 0 ? Number((d.revenue / d.orderCount).toFixed(2)) : 0, percentage: totalRev > 0 ? Number(((d.revenue / totalRev) * 100).toFixed(1)) : 0 })));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getBasketAnalysis = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, deliveredStatuses)];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const ordersList = await db.select({ orderId: orders.id }).from(orders).where(and(...conditions)).limit(5000);
        const orderIds = ordersList.map(o => o.orderId);
        if (orderIds.length === 0) return res.json([]);

        const items = await db.select({ orderId: orderItems.orderId, itemName: orderItems.name })
            .from(orderItems).where(inArray(orderItems.orderId, orderIds));

        const orderMap = new Map<string, string[]>();
        for (const item of items) {
            const list = orderMap.get(item.orderId!) || [];
            if (!list.includes(item.itemName!)) list.push(item.itemName!);
            orderMap.set(item.orderId!, list);
        }

        const pairMap = new Map<string, number>();
        for (const [, itemsList] of orderMap) {
            if (itemsList.length < 2) continue;
            for (let i = 0; i < itemsList.length; i++) for (let j = i + 1; j < itemsList.length; j++) {
                const pair = [itemsList[i], itemsList[j]].sort().join(' + ');
                pairMap.set(pair, (pairMap.get(pair) || 0) + 1);
            }
        }

        const result = Array.from(pairMap.entries()).map(([pair, count]) => ({ pair, count, percentage: Number(((count / orderIds.length) * 100).toFixed(1)) }))
            .sort((a, b) => b.count - a.count).slice(0, 30);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getTableTurnoverRate = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, ['DELIVERED', 'COMPLETED']), eq(orders.type, 'DINE_IN'), sql`${orders.tableId} is not null`];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const daysDiff = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));

        const rows = await db.select({
            tableId: orders.tableId,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
        }).from(orders).where(and(...conditions)).groupBy(orders.tableId).orderBy(sql`count(*) desc`);

        res.json(rows.map(r => ({ tableId: r.tableId, totalOrders: Number(r.orderCount), turnsPerDay: Number((Number(r.orderCount) / daysDiff).toFixed(1)), revenue: Number(Number(r.revenue).toFixed(2)), revenuePerDay: Number((Number(r.revenue) / daysDiff).toFixed(2)) })));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getWaitTimeReport = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, ['DELIVERED', 'COMPLETED']), sql`${orders.completedAt} is not null`];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const byType = await db.select({
            orderType: orders.type,
            orderCount: sql<number>`count(*)`,
            avgWaitMinutes: sql<number>`coalesce(avg(extract(epoch from (${orders.completedAt} - ${orders.createdAt})) / 60), 0)`,
            minWaitMinutes: sql<number>`coalesce(min(extract(epoch from (${orders.completedAt} - ${orders.createdAt})) / 60), 0)`,
            maxWaitMinutes: sql<number>`coalesce(max(extract(epoch from (${orders.completedAt} - ${orders.createdAt})) / 60), 0)`,
        }).from(orders).where(and(...conditions)).groupBy(orders.type);

        const daily = await db.select({
            day: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM-DD')`,
            avgWaitMinutes: sql<number>`coalesce(avg(extract(epoch from (${orders.completedAt} - ${orders.createdAt})) / 60), 0)`,
            orderCount: sql<number>`count(*)`,
        }).from(orders).where(and(...conditions))
            .groupBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`)
            .orderBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`);

        res.json({
            byType: byType.map(r => ({ orderType: r.orderType, orderCount: Number(r.orderCount), avgWaitMinutes: Number(Number(r.avgWaitMinutes).toFixed(1)), minWaitMinutes: Number(Number(r.minWaitMinutes).toFixed(1)), maxWaitMinutes: Number(Number(r.maxWaitMinutes).toFixed(1)) })),
            daily: daily.map(r => ({ day: r.day, avgWaitMinutes: Number(Number(r.avgWaitMinutes).toFixed(1)), orderCount: Number(r.orderCount) })),
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getDriverUtilization = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, ['DELIVERED', 'COMPLETED']), eq(orders.type, 'DELIVERY'), sql`${orders.driverId} is not null`];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const rows = await db.select({
            driverId: orders.driverId,
            driverName: drivers.name,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            totalDeliveryFees: sql<number>`coalesce(sum(${orders.deliveryFee}), 0)`,
            avgDeliveryMinutes: sql<number>`coalesce(avg(extract(epoch from (${orders.completedAt} - ${orders.createdAt})) / 60), 0)`,
        }).from(orders)
            .leftJoin(drivers, eq(orders.driverId, drivers.id))
            .where(and(...conditions))
            .groupBy(orders.driverId, drivers.name)
            .orderBy(sql`count(*) desc`);

        const daysDiff = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
        res.json(rows.map(r => ({ driverId: r.driverId, driverName: r.driverName || 'Unknown', orderCount: Number(r.orderCount), ordersPerDay: Number((Number(r.orderCount) / daysDiff).toFixed(1)), revenue: Number(Number(r.revenue).toFixed(2)), totalDeliveryFees: Number(Number(r.totalDeliveryFees).toFixed(2)), avgDeliveryMinutes: Number(Number(r.avgDeliveryMinutes).toFixed(1)) })));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getBranchComparison = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];

        const rows = await db.select({
            branchId: orders.branchId,
            branchName: branches.name,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            avgTicket: sql<number>`coalesce(avg(${orders.total}), 0)`,
            cancelCount: sql<number>`count(*) filter (where ${orders.status} = 'CANCELLED')`,
            totalDiscount: sql<number>`coalesce(sum(${orders.discount}), 0)`,
        }).from(orders)
            .leftJoin(branches, eq(orders.branchId, branches.id))
            .where(and(gte(orders.createdAt, start), lte(orders.createdAt, end)))
            .groupBy(orders.branchId, branches.name)
            .orderBy(sql`sum(${orders.total}) desc`);

        const topBranch = rows.length > 0 ? rows[0] : null;
        res.json({
            branches: rows.map(r => ({
                branchId: r.branchId, branchName: r.branchName || 'N/A',
                orderCount: Number(r.orderCount), revenue: Number(Number(r.revenue).toFixed(2)),
                avgTicket: Number(Number(r.avgTicket).toFixed(2)), cancelCount: Number(r.cancelCount),
                totalDiscount: Number(Number(r.totalDiscount).toFixed(2)),
            })),
            topBranch: topBranch?.branchName || 'N/A',
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
