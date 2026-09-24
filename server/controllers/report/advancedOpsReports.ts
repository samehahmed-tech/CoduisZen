import { Request, Response } from 'express';
import { eq, and, sql, gte, lte, inArray, desc, isNull } from 'drizzle-orm';
import { db } from '../../db';
import { orders, orderItems, menuItems, branches, drivers, tables, floorZones, kdsTickets, users } from '../../../src/db/schema';
import { parseLocalDateRange } from './reportUtils';
import { revenueEligibleOrder } from '../../utils/orderRevenue';

const notDeleted = isNull(orders.deletedAt);
const liveLine = sql`coalesce(${orderItems.status}, '') not in ('VOID', 'VOIDED', 'CANCELLED')`;
// Every dead end, not just CANCELLED (REFUNDED/VOID leak out of loss counts).
const deadOrder = sql`${orders.status} in ('CANCELLED', 'REFUNDED', 'VOID')`;

export const getKitchenPerformance = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        // Live sale orders only — cancelled/prep-less lines used to inflate
        // totals. Clock is order-created → line-prepared (no fire timestamp
        // exists on the line); outliers <0 are excluded from the average.
        const conditions: any[] = [
            gte(orders.createdAt, start), lte(orders.createdAt, end),
            inArray(orders.status, ['DELIVERED', 'COMPLETED']),
            notDeleted,
            liveLine,
            sql`${orderItems.preparedAt} is not null`,
        ];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const prepMinutes = sql`datediff(second, ${orders.createdAt}, ${orderItems.preparedAt}) / 60.0`;
        const rows = await db.select({
            itemName: orderItems.name,
            totalPrepared: sql<number>`count(*)`,
            avgPrepMinutes: sql<number>`coalesce(avg(case when ${prepMinutes} >= 0 and ${prepMinutes} < 24 * 60 then ${prepMinutes} end), 0)`,
            minPrepMinutes: sql<number>`coalesce(min(case when ${prepMinutes} >= 0 and ${prepMinutes} < 24 * 60 then ${prepMinutes} end), 0)`,
            maxPrepMinutes: sql<number>`coalesce(max(case when ${prepMinutes} >= 0 and ${prepMinutes} < 24 * 60 then ${prepMinutes} end), 0)`,
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

        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), revenueEligibleOrder(), notDeleted];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const rows = await db.select({
            menuItemId: orderItems.menuItemId,
            itemName: orderItems.name,
            qtySold: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
            revenue: sql<number>`coalesce(sum(${orderItems.price} * ${orderItems.quantity}), 0)`,
            cost: sql<number>`coalesce(sum(coalesce(${orderItems.cost}, ${menuItems.cost}, 0) * ${orderItems.quantity}), 0)`,
        }).from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .leftJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
            .where(and(...conditions, liveLine))
            .groupBy(orderItems.menuItemId, orderItems.name);

        const totalQty = rows.reduce((s, r) => s + Number(r.qtySold), 0);
        const avgQty = totalQty / (rows.length || 1);
        // Revenue-WEIGHTED margin cutoff: the old plain average of per-item
        // percents let one $0-revenue item drag the Star/Puzzle boundary.
        const totalRev = rows.reduce((s, r) => s + Number(r.revenue), 0);
        const totalCost = rows.reduce((s, r) => s + Number(r.cost), 0);
        const avgMargin = totalRev > 0 ? ((totalRev - totalCost) / totalRev) * 100 : 0;
        const items = rows.map(r => {
            const qty = Number(r.qtySold);
            const rev = Number(r.revenue);
            const cost = Number(r.cost);
            const profit = rev - cost;
            const margin = rev > 0 ? (profit / rev) * 100 : 0;
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

        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), revenueEligibleOrder()];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const rows = await db.select({
            hour: sql<number>`datepart(hour, ${orders.createdAt})`,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            avgTicket: sql<number>`coalesce(avg(${orders.total}), 0)`,
        }).from(orders).where(and(...conditions, notDeleted)).groupBy(sql`datepart(hour, ${orders.createdAt})`);

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

        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), revenueEligibleOrder(), notDeleted];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        // Deterministic most-recent sample (documented): unbounded order made
        // results shift run-to-run on large datasets.
        const ordersList = await db.select({ orderId: orders.id }).from(orders)
            .where(and(...conditions)).orderBy(desc(orders.createdAt)).limit(5000);
        const orderIds = ordersList.map(o => o.orderId);
        if (orderIds.length === 0) return res.json([]);

        const items = await db.select({ orderId: orderItems.orderId, itemName: orderItems.name })
            .from(orderItems).where(and(inArray(orderItems.orderId, orderIds), liveLine));

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
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, ['DELIVERED', 'COMPLETED']), eq(orders.type, 'DINE_IN'), sql`${orders.tableId} is not null`, notDeleted];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const daysDiff = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));

        const rows = await db.select({
            tableId: orders.tableId,
            tableName: tables.name,
            zoneName: floorZones.name,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
        }).from(orders)
            .leftJoin(tables, eq(orders.tableId, tables.id))
            .leftJoin(floorZones, eq(tables.zoneId, floorZones.id))
            .where(and(...conditions))
            .groupBy(orders.tableId, tables.name, floorZones.name)
            .orderBy(sql`count(*) desc`);

        res.json(rows.map(r => ({ tableId: r.tableId, tableName: r.tableName || r.tableId, zoneName: r.zoneName || '', totalOrders: Number(r.orderCount), turnsPerDay: Number((Number(r.orderCount) / daysDiff).toFixed(1)), revenue: Number(Number(r.revenue).toFixed(2)), revenuePerDay: Number((Number(r.revenue) / daysDiff).toFixed(2)) })));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getWaitTimeReport = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        // Negative/clock-skew durations are excluded from averages (they
        // used to drag the mean below reality); daily buckets use the
        // logical business day.
        const waitMinutes = sql`datediff(second, ${orders.createdAt}, ${orders.completedAt}) / 60.0`;
        const saneWait = sql`${waitMinutes} >= 0`;
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, ['DELIVERED', 'COMPLETED']), sql`${orders.completedAt} is not null`, saneWait, notDeleted];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const byType = await db.select({
            orderType: orders.type,
            orderCount: sql<number>`count(*)`,
            avgWaitMinutes: sql<number>`coalesce(avg(${waitMinutes}), 0)`,
            minWaitMinutes: sql<number>`coalesce(min(${waitMinutes}), 0)`,
            maxWaitMinutes: sql<number>`coalesce(max(${waitMinutes}), 0)`,
        }).from(orders).where(and(...conditions)).groupBy(orders.type);

        const day = sql<string>`coalesce(${orders.businessDate}, format(${orders.createdAt}, 'yyyy-MM-dd'))`;
        const daily = await db.select({
            day,
            avgWaitMinutes: sql<number>`coalesce(avg(${waitMinutes}), 0)`,
            orderCount: sql<number>`count(*)`,
        }).from(orders).where(and(...conditions))
            .groupBy(day)
            .orderBy(day);

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
        // Undelivered (NULL completedAt) rows are excluded — they used to
        // dilute the average with NULLs counted as zeros.
        // Same sanity rule as the Wait Time report: clock-skew negatives never enter averages.
        const saneDelivery = sql`datediff(second, ${orders.createdAt}, ${orders.completedAt}) / 60.0 >= 0`;
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, ['DELIVERED', 'COMPLETED']), eq(orders.type, 'DELIVERY'), sql`${orders.driverId} is not null`, sql`${orders.completedAt} is not null`, saneDelivery, notDeleted];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const rows = await db.select({
            driverId: orders.driverId,
            driverName: drivers.name,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            totalDeliveryFees: sql<number>`coalesce(sum(${orders.deliveryFee}), 0)`,
            avgDeliveryMinutes: sql<number>`coalesce(avg(datediff(second, ${orders.createdAt}, ${orders.completedAt}) / 60.0), 0)`,
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

/**
 * Kitchen staff performance: who completed KDS tickets, how fast, and how
 * often on time (vs target_time). Only tickets with a recorded completer
 * appear — completion tracking started with the completed_by columns, so
 * older tickets are unattributed by design, never guessed.
 * GET /api/reports/kitchen-staff-performance?branchId=&startDate=&endDate=
 */
export const getKitchenStaffPerformance = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const conditions: any[] = [
            gte(kdsTickets.bumpedAt, start),
            lte(kdsTickets.bumpedAt, end),
            sql`${kdsTickets.completedBy} is not null`,
        ];
        if (branchId && branchId !== 'undefined') conditions.push(eq(kdsTickets.branchId, branchId as string));

        const fulfillMinutes = sql`datediff(second, ${kdsTickets.createdAt}, ${kdsTickets.bumpedAt}) / 60.0`;
        const saneFulfill = sql`${fulfillMinutes} >= 0`;
        const onTime = sql`(${kdsTickets.targetTime} is null or ${kdsTickets.bumpedAt} <= ${kdsTickets.targetTime})`;
        const rows = await db.select({
            userId: kdsTickets.completedBy,
            userName: users.name,
            ticketsCompleted: sql<number>`count(*)`,
            avgMinutes: sql<number>`coalesce(avg(case when ${saneFulfill} then ${fulfillMinutes} end), 0)`,
            minMinutes: sql<number>`coalesce(min(case when ${saneFulfill} then ${fulfillMinutes} end), 0)`,
            maxMinutes: sql<number>`coalesce(max(case when ${saneFulfill} then ${fulfillMinutes} end), 0)`,
            onTimeCount: sql<number>`sum(case when ${onTime} then 1 else 0 end)`,
            rushCount: sql<number>`sum(case when ${kdsTickets.priority} = 'RUSH' then 1 else 0 end)`,
            remakeCount: sql<number>`sum(case when ${kdsTickets.priority} = 'REMAKE' then 1 else 0 end)`,
        }).from(kdsTickets)
            .leftJoin(users, eq(kdsTickets.completedBy, users.id))
            .where(and(...conditions))
            .groupBy(kdsTickets.completedBy, users.name)
            .orderBy(sql`count(*) desc`);

        const staff = rows.map((r: any) => {
            const completed = Number(r.ticketsCompleted || 0);
            const onTime = Number(r.onTimeCount || 0);
            return {
                userId: r.userId,
                userName: r.userName || null,
                ticketsCompleted: completed,
                avgMinutes: Number(Number(r.avgMinutes || 0).toFixed(1)),
                minMinutes: Number(Number(r.minMinutes || 0).toFixed(1)),
                maxMinutes: Number(Number(r.maxMinutes || 0).toFixed(1)),
                onTimeCount: onTime,
                onTimePercent: completed > 0 ? Number(((onTime / completed) * 100).toFixed(1)) : 0,
                rushCount: Number(r.rushCount || 0),
                remakeCount: Number(r.remakeCount || 0),
            };
        });
        const totalTickets = staff.reduce((s, r) => s + r.ticketsCompleted, 0);
        const totalOnTime = staff.reduce((s, r) => s + r.onTimeCount, 0);
        res.json({
            staff,
            unattributedNote: 'Tickets completed before completion tracking are excluded (no completer recorded).',
            summary: {
                staffCount: staff.length,
                totalTickets,
                onTimePercent: totalTickets > 0 ? Number(((totalOnTime / totalTickets) * 100).toFixed(1)) : 0,
            },
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getBranchComparison = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const revenueEligible = revenueEligibleOrder();

        const rows = await db.select({
            branchId: orders.branchId,
            branchName: branches.name,
            orderCount: sql<number>`count(*)`,
            eligibleOrderCount: sql<number>`sum(case when ${revenueEligible} then 1 else 0 end)`,
            revenue: sql<number>`coalesce(sum(case when ${revenueEligible} then ${orders.total} else 0 end), 0)`,
            avgTicket: sql<number>`coalesce(avg(case when ${revenueEligible} then ${orders.total} end), 0)`,
            cancelCount: sql<number>`sum(case when ${deadOrder} then 1 else 0 end)`,
            totalDiscount: sql<number>`coalesce(sum(case when ${revenueEligible} then ${orders.discount} else 0 end), 0)`,
        }).from(orders)
            .leftJoin(branches, eq(orders.branchId, branches.id))
            .where(and(gte(orders.createdAt, start), lte(orders.createdAt, end), notDeleted))
            .groupBy(orders.branchId, branches.name)
            .orderBy(sql`sum(case when ${revenueEligible} then ${orders.total} else 0 end) desc`);

        const topBranch = rows.length > 0 ? rows[0] : null;
        res.json({
            branches: rows.map(r => ({
                branchId: r.branchId, branchName: r.branchName || 'N/A',
                orderCount: Number(r.orderCount),
                eligibleOrderCount: Number((r as any).eligibleOrderCount || 0),
                revenue: Number(Number(r.revenue).toFixed(2)),
                avgTicket: Number(Number(r.avgTicket).toFixed(2)), cancelCount: Number(r.cancelCount),
                totalDiscount: Number(Number(r.totalDiscount).toFixed(2)),
            })),
            topBranch: topBranch?.branchName || 'N/A',
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
