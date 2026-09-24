import { Request, Response } from 'express';
import { eq, and, sql, gte, lte, inArray, desc, asc, isNull } from 'drizzle-orm';
import { db } from '../../db';
import { orders, orderItems, menuItems } from '../../../src/db/schema';
import { parseLocalDateRange, orderBusinessDateFilter, orderBusinessDayExpression } from './reportUtils';
import { revenueEligibleOrder } from '../../utils/orderRevenue';

// SQL Server datepart(weekday) depends on @@DATEFIRST, so raw values shift
// per server setting. This normalizes to Sunday=1..Saturday=7 always.
const sundayFirstWeekday = (dateExpr: any) =>
    sql<number>`((datepart(weekday, ${dateExpr}) + @@DATEFIRST - 1) % 7) + 1`;
// Day key for bucketing: the order's logical business day (falls back to the
// creation date when businessDate is NULL) — matches the range filter.
const businessDayKey = () =>
    sql`coalesce(try_cast(${orders.businessDate} as date), ${orders.createdAt})`;
const notDeleted = isNull(orders.deletedAt);
const liveLine = sql`coalesce(${orderItems.status}, '') not in ('VOID', 'VOIDED', 'CANCELLED')`;

export const getPeakHoursHeatmap = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);

        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const conditions: any[] = [businessDateFilter, revenueEligibleOrder()];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        // Weekday comes from the logical business day (consistent with the
        // range filter); hour stays wall-clock creation hour (documented).
        const dow = sundayFirstWeekday(businessDayKey());
        const hour = sql<number>`datepart(hour, ${orders.createdAt})`;
        const rows = await db.select({
            dayOfWeek: dow,
            hour,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
        }).from(orders).where(and(...conditions, notDeleted))
            .groupBy(dow, hour)
            .orderBy(dow, hour);

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

        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const conditions: any[] = [businessDateFilter, revenueEligibleOrder()];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const rows = await db.select({
            id: orderItems.id,
            itemName: orderItems.name,
            modifiers: orderItems.modifiers,
            quantity: orderItems.quantity,
        }).from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .where(and(...conditions, notDeleted, liveLine, sql`${orderItems.modifiers} is not null`));

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

        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const conditions: any[] = [businessDateFilter, revenueEligibleOrder()];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        // Group by logical business day — same key the range filter uses, so
        // daily revenue reconciles with getDailySales.
        const day = orderBusinessDayExpression();
        const rows = await db.select({
            day,
            avgTicket: sql<number>`coalesce(avg(${orders.total}), 0)`,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
        }).from(orders).where(and(...conditions, notDeleted))
            .groupBy(day)
            .orderBy(day);

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


        const buildConditions = (startDateStr: string, endDateStr: string, s: Date, e: Date) => {
            const businessDateFilter = orderBusinessDateFilter(startDateStr, endDateStr, s, e);
            const c: any[] = [businessDateFilter, revenueEligibleOrder(), notDeleted];
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

        // Null (rendered as N/A) when the comparison base is zero — 0% would lie.
        const pct = (a: number, b: number) => b > 0 ? Number((((a - b) / b) * 100).toFixed(1)) : null;
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

        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const conditions: any[] = [businessDateFilter, revenueEligibleOrder()];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const rows = await db.select({
            menuItemId: orderItems.menuItemId,
            itemName: orderItems.name,
            qtySold: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
            revenue: sql<number>`coalesce(sum(${orderItems.price} * ${orderItems.quantity}), 0)`,
        }).from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .where(and(...conditions, notDeleted, liveLine))
            .groupBy(orderItems.menuItemId, orderItems.name);

        // A slow-moving report must include items with ZERO sales — otherwise
        // the slowest items never appear. Merge the full catalog in JS.
        const catalog = await db.select({ id: menuItems.id, name: menuItems.name })
            .from(menuItems)
            .where(isNull(menuItems.deletedAt));
        const soldById = new Map((rows as any[]).map((r) => [r.menuItemId, r]));
        const all = catalog.map((c) => {
            const s: any = soldById.get(c.id);
            return {
                menuItemId: c.id,
                itemName: s?.itemName || c.name,
                qtySold: Number(s?.qtySold || 0),
                revenue: Number(Number(s?.revenue || 0).toFixed(2)),
            };
        });
        all.sort((a, b) => a.qtySold - b.qtySold || a.revenue - b.revenue);

        res.json(all.slice(0, 50));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getRevenueByWeekday = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);

        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const conditions: any[] = [businessDateFilter, revenueEligibleOrder()];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const dow = sundayFirstWeekday(businessDayKey());
        const rows = await db.select({
            dayOfWeek: dow,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            avgTicket: sql<number>`coalesce(avg(${orders.total}), 0)`,
        }).from(orders).where(and(...conditions, notDeleted))
            .groupBy(dow)
            .orderBy(dow);

        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        res.json(rows.map(r => ({
            dayOfWeek: Number(r.dayOfWeek),
            dayName: dayNames[Number(r.dayOfWeek) - 1] || 'Unknown',
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
            .where(and(...conditions, notDeleted))
            .orderBy(desc(orders.createdAt))
            .limit(200);

        const [summary] = await db.select({
            voidCount: sql<number>`count(*)`,
            voidTotal: sql<number>`coalesce(sum(${orderItems.price} * ${orderItems.quantity}), 0)`,
        }).from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .where(and(...conditions, notDeleted));

        res.json({
            summary: { voidCount: Number(summary?.voidCount || 0), voidTotal: Number(Number(summary?.voidTotal || 0).toFixed(2)) },
            // Gross line values only (price × qty — modifiers/tax excluded), so
            // this won't reconcile 1:1 with order-level refund totals.
            totalsBasis: 'GROSS_LINE_VALUES',
            items: rows.map(r => ({ ...r, total: Number((Number(r.price) * Number(r.quantity)).toFixed(2)) })),
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
