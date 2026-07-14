import { Request, Response } from 'express';
import { eq, and, sql, gte, lte, inArray, desc, asc } from 'drizzle-orm';
import { db } from '../../db';
import { orders, orderItems } from '../../../src/db/schema';
import { parseLocalDateRange, orderBusinessDateFilter } from './reportUtils';

export const getPeakHoursHeatmap = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const conditions: any[] = [businessDateFilter, inArray(orders.status, deliveredStatuses)];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const rows = await db.select({
            dayOfWeek: sql<number>`datepart(weekday, ${orders.createdAt})`,
            hour: sql<number>`datepart(hour, ${orders.createdAt})`,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
        }).from(orders).where(and(...conditions))
            .groupBy(sql`datepart(weekday, ${orders.createdAt})`, sql`datepart(hour, ${orders.createdAt})`)
            .orderBy(sql`datepart(weekday, ${orders.createdAt})`, sql`datepart(hour, ${orders.createdAt})`);

        res.json(rows.map(r => ({
            dayOfWeek: Number(r.dayOfWeek),
            hour: Number(r.hour),
            orderCount: Number(r.orderCount),
            revenue: Number(Number(r.revenue).toFixed(2)),
        })));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getModifierSales = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const conditions: any[] = [businessDateFilter, inArray(orders.status, deliveredStatuses)];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const rows = await db.select({
            id: orderItems.id,
            itemName: orderItems.name,
            modifiers: orderItems.modifiers,
            quantity: orderItems.quantity,
        }).from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .where(and(...conditions, sql`${orderItems.modifiers} is not null`));

        const modifierMap = new Map<string, { name: string; count: number; revenue: number }>();
        for (const row of rows) {
            const mods = row.modifiers as any[];
            if (!mods || !Array.isArray(mods)) continue;
            for (const mod of mods) {
                const key = `${mod.groupName}:${mod.optionName}`;
                const existing = modifierMap.get(key) || { name: `${mod.groupName} → ${mod.optionName}`, count: 0, revenue: 0 };
                existing.count += (row.quantity || 1);
                existing.revenue += (mod.price || 0) * (row.quantity || 1);
                modifierMap.set(key, existing);
            }
        }

        const result = Array.from(modifierMap.values())
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 100);

        res.json(result.map(r => ({ ...r, revenue: Number(r.revenue.toFixed(2)) })));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getAvgTicketTrend = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const conditions: any[] = [businessDateFilter, inArray(orders.status, deliveredStatuses)];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const rows = await db.select({
            day: sql<string>`format(${orders.createdAt}, 'yyyy-MM-dd')`,
            avgTicket: sql<number>`coalesce(avg(${orders.total}), 0)`,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
        }).from(orders).where(and(...conditions))
            .groupBy(sql`format(${orders.createdAt}, 'yyyy-MM-dd')`)
            .orderBy(sql`format(${orders.createdAt}, 'yyyy-MM-dd')`);

        res.json(rows.map(r => ({
            day: r.day,
            avgTicket: Number(Number(r.avgTicket).toFixed(2)),
            orderCount: Number(r.orderCount),
            revenue: Number(Number(r.revenue).toFixed(2)),
        })));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getSalesComparison = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, compareStartDate, compareEndDate, branchId } = req.query;
        if (!startDate || !endDate || !compareStartDate || !compareEndDate) return res.status(400).json({ error: 'Both date ranges are required' });
        const { start: s1, end: e1 } = parseLocalDateRange(startDate as string, endDate as string);
        const { start: s2, end: e2 } = parseLocalDateRange(compareStartDate as string, compareEndDate as string);
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];

        const buildConditions = (startDateStr: string, endDateStr: string, s: Date, e: Date) => {
            const businessDateFilter = orderBusinessDateFilter(startDateStr, endDateStr, s, e);
            const c: any[] = [businessDateFilter, inArray(orders.status, deliveredStatuses)];
            if (branchId && branchId !== 'undefined') c.push(eq(orders.branchId, branchId as string));
            return c;
        };

        const [current] = await db.select({
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            avgTicket: sql<number>`coalesce(avg(${orders.total}), 0)`,
            totalDiscount: sql<number>`coalesce(sum(${orders.discount}), 0)`,
        }).from(orders).where(and(...buildConditions(startDate as string, endDate as string, s1, e1)));

        const [compare] = await db.select({
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            avgTicket: sql<number>`coalesce(avg(${orders.total}), 0)`,
            totalDiscount: sql<number>`coalesce(sum(${orders.discount}), 0)`,
        }).from(orders).where(and(...buildConditions(compareStartDate as string, compareEndDate as string, s2, e2)));

        const pct = (a: number, b: number) => b > 0 ? Number((((a - b) / b) * 100).toFixed(1)) : 0;
        const cur = { orderCount: Number(current?.orderCount || 0), revenue: Number(Number(current?.revenue || 0).toFixed(2)), avgTicket: Number(Number(current?.avgTicket || 0).toFixed(2)), totalDiscount: Number(Number(current?.totalDiscount || 0).toFixed(2)) };
        const cmp = { orderCount: Number(compare?.orderCount || 0), revenue: Number(Number(compare?.revenue || 0).toFixed(2)), avgTicket: Number(Number(compare?.avgTicket || 0).toFixed(2)), totalDiscount: Number(Number(compare?.totalDiscount || 0).toFixed(2)) };

        res.json({
            current: { period: `${startDate} → ${endDate}`, ...cur },
            compare: { period: `${compareStartDate} → ${compareEndDate}`, ...cmp },
            change: {
                orderCount: pct(cur.orderCount, cmp.orderCount),
                revenue: pct(cur.revenue, cmp.revenue),
                avgTicket: pct(cur.avgTicket, cmp.avgTicket),
                totalDiscount: pct(cur.totalDiscount, cmp.totalDiscount),
            },
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getSlowMovingItems = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const conditions: any[] = [businessDateFilter, inArray(orders.status, deliveredStatuses)];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const rows = await db.select({
            menuItemId: orderItems.menuItemId,
            itemName: orderItems.name,
            qtySold: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
            revenue: sql<number>`coalesce(sum(${orderItems.price} * ${orderItems.quantity}), 0)`,
        }).from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .where(and(...conditions))
            .groupBy(orderItems.menuItemId, orderItems.name)
            .orderBy(asc(sql`sum(${orderItems.quantity})`))
            .limit(50);

        res.json(rows.map(r => ({
            menuItemId: r.menuItemId,
            itemName: r.itemName,
            qtySold: Number(r.qtySold),
            revenue: Number(Number(r.revenue).toFixed(2)),
        })));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getRevenueByWeekday = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const conditions: any[] = [businessDateFilter, inArray(orders.status, deliveredStatuses)];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const rows = await db.select({
            dayOfWeek: sql<number>`datepart(weekday, ${orders.createdAt})`,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            avgTicket: sql<number>`coalesce(avg(${orders.total}), 0)`,
        }).from(orders).where(and(...conditions))
            .groupBy(sql`datepart(weekday, ${orders.createdAt})`)
            .orderBy(sql`datepart(weekday, ${orders.createdAt})`);

        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        res.json(rows.map(r => ({
            dayOfWeek: Number(r.dayOfWeek),
            dayName: dayNames[Number(r.dayOfWeek)] || 'Unknown',
            orderCount: Number(r.orderCount),
            revenue: Number(Number(r.revenue).toFixed(2)),
            avgTicket: Number(Number(r.avgTicket).toFixed(2)),
        })));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getVoidItemsLog = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const conditions: any[] = [
            businessDateFilter,
            inArray(orderItems.status, ['VOID', 'VOIDED', 'CANCELLED']),
        ];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const rows = await db.select({
            itemName: orderItems.name,
            orderId: orderItems.orderId,
            orderNumber: orders.orderNumber,
            price: orderItems.price,
            quantity: orderItems.quantity,
            createdAt: orders.createdAt,
        }).from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .where(and(...conditions))
            .orderBy(desc(orders.createdAt))
            .limit(200);

        const [summary] = await db.select({
            voidCount: sql<number>`count(*)`,
            voidTotal: sql<number>`coalesce(sum(${orderItems.price} * ${orderItems.quantity}), 0)`,
        }).from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .where(and(...conditions));

        res.json({
            summary: { voidCount: Number(summary?.voidCount || 0), voidTotal: Number(Number(summary?.voidTotal || 0).toFixed(2)) },
            items: rows.map(r => ({ ...r, total: Number((Number(r.price) * Number(r.quantity)).toFixed(2)) })),
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
