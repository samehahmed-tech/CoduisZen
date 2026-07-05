import { Request, Response } from 'express';
import { eq, and, sql, gte, lte, inArray, desc, or } from 'drizzle-orm';
import { db } from '../../db';
import { orders, payments, orderItems, menuItems, menuCategories, customers, shifts, journalEntries, journalLines, chartOfAccounts } from '../../../src/db/schema';
import { parseLocalDateRange } from './reportUtils';

export const getDemandForecast = async (req: Request, res: Response) => {
    try {
        const { branchId } = req.query;
        const conditions: any[] = [inArray(orders.status, ['DELIVERED', 'COMPLETED'])];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        // Get last 8 weeks daily data
        const daily = await db.select({
            dayOfWeek: sql<number>`extract(dow from ${orders.createdAt})`,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
        }).from(orders).where(and(...conditions, sql`${orders.createdAt} > now() - interval '8 weeks'`))
            .groupBy(sql`extract(dow from ${orders.createdAt})`)
            .orderBy(sql`extract(dow from ${orders.createdAt})`);

        // Top items last 4 weeks
        const topItems = await db.select({
            itemName: orderItems.name,
            avgDailyQty: sql<number>`coalesce(sum(${orderItems.quantity}) / 28.0, 0)`,
            totalQty: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
        }).from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .where(and(...conditions, sql`${orders.createdAt} > now() - interval '4 weeks'`))
            .groupBy(orderItems.name)
            .orderBy(sql`sum(${orderItems.quantity}) desc`)
            .limit(20);

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const weeksCount = 8;
        const forecast = daily.map(d => ({
            dayOfWeek: dayNames[Number(d.dayOfWeek)] || d.dayOfWeek,
            avgOrders: Math.round(Number(d.orderCount) / weeksCount),
            avgRevenue: Number((Number(d.revenue) / weeksCount).toFixed(2)),
            predictedOrders: Math.round(Number(d.orderCount) / weeksCount * 1.05),
            predictedRevenue: Number((Number(d.revenue) / weeksCount * 1.05).toFixed(2)),
        }));

        res.json({ weeklyForecast: forecast, topItemsDemand: topItems.map(t => ({ itemName: t.itemName, avgDailyQty: Number(Number(t.avgDailyQty).toFixed(1)), weeklyQty: Number(Number(t.totalQty).toFixed(0)) })) });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getPriceElasticity = async (req: Request, res: Response) => {
    try {
        const { branchId } = req.query;
        const conditions: any[] = [inArray(orders.status, ['DELIVERED', 'COMPLETED'])];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const items = await db.select({
            menuItemId: orderItems.menuItemId,
            itemName: orderItems.name,
            currentPrice: sql<number>`max(${orderItems.price})`,
            cost: sql<number>`coalesce(max(${menuItems.cost}), 0)`,
            totalQty: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
            revenue: sql<number>`coalesce(sum(${orderItems.price} * ${orderItems.quantity}), 0)`,
        }).from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .leftJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
            .where(and(...conditions, sql`${orders.createdAt} > now() - interval '30 days'`))
            .groupBy(orderItems.menuItemId, orderItems.name)
            .orderBy(sql`sum(${orderItems.quantity}) desc`)
            .limit(30);

        const simulations = items.map(item => {
            const price = Number(item.currentPrice);
            const cost = Number(item.cost);
            const qty = Number(item.totalQty);
            const scenarios = [
                { change: -10, newPrice: price * 0.9, estQty: Math.round(qty * 1.15), estRevenue: Number((price * 0.9 * qty * 1.15).toFixed(2)), estProfit: Number(((price * 0.9 - cost) * qty * 1.15).toFixed(2)) },
                { change: -5, newPrice: price * 0.95, estQty: Math.round(qty * 1.07), estRevenue: Number((price * 0.95 * qty * 1.07).toFixed(2)), estProfit: Number(((price * 0.95 - cost) * qty * 1.07).toFixed(2)) },
                { change: 0, newPrice: price, estQty: qty, estRevenue: Number((price * qty).toFixed(2)), estProfit: Number(((price - cost) * qty).toFixed(2)) },
                { change: 5, newPrice: price * 1.05, estQty: Math.round(qty * 0.95), estRevenue: Number((price * 1.05 * qty * 0.95).toFixed(2)), estProfit: Number(((price * 1.05 - cost) * qty * 0.95).toFixed(2)) },
                { change: 10, newPrice: price * 1.10, estQty: Math.round(qty * 0.88), estRevenue: Number((price * 1.10 * qty * 0.88).toFixed(2)), estProfit: Number(((price * 1.10 - cost) * qty * 0.88).toFixed(2)) },
            ];
            return { menuItemId: item.menuItemId, itemName: item.itemName, currentPrice: price, cost, currentQty: qty, currentRevenue: Number(item.revenue), scenarios };
        });
        res.json(simulations);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getMenuCannibalization = async (req: Request, res: Response) => {
    try {
        const { branchId } = req.query;
        const conditions: any[] = [inArray(orders.status, ['DELIVERED', 'COMPLETED'])];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const recent = await db.select({ itemName: orderItems.name, qty: sql<number>`sum(${orderItems.quantity})`, revenue: sql<number>`sum(${orderItems.price} * ${orderItems.quantity})` })
            .from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id))
            .where(and(...conditions, sql`${orders.createdAt} > now() - interval '30 days'`))
            .groupBy(orderItems.name);

        const prior = await db.select({ itemName: orderItems.name, qty: sql<number>`sum(${orderItems.quantity})`, revenue: sql<number>`sum(${orderItems.price} * ${orderItems.quantity})` })
            .from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id))
            .where(and(...conditions, sql`${orders.createdAt} > now() - interval '60 days' AND ${orders.createdAt} <= now() - interval '30 days'`))
            .groupBy(orderItems.name);

        const priorMap = new Map(prior.map(p => [p.itemName, { qty: Number(p.qty), revenue: Number(p.revenue) }]));
        const results = recent.map(r => {
            const p = priorMap.get(r.itemName);
            const recentQty = Number(r.qty); const priorQty = p?.qty || 0;
            return { itemName: r.itemName, recentQty, priorQty, qtyChange: recentQty - priorQty, qtyChangePercent: priorQty > 0 ? Number(((recentQty - priorQty) / priorQty * 100).toFixed(1)) : null, recentRevenue: Number(Number(r.revenue).toFixed(2)), priorRevenue: Number((p?.revenue || 0).toFixed(2)) };
        }).sort((a, b) => (a.qtyChangePercent ?? 0) - (b.qtyChangePercent ?? 0));

        const declining = results.filter(r => (r.qtyChangePercent ?? 0) < -10);
        const growing = results.filter(r => (r.qtyChangePercent ?? 0) > 10);
        res.json({ declining, growing, all: results });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getAnomalyDetection = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end)];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        // Unusual high-discount orders
        const highDiscounts = await db.select({ id: orders.id, orderNumber: orders.orderNumber, discount: orders.discount, total: orders.total, createdAt: orders.createdAt })
            .from(orders).where(and(...conditions, sql`${orders.discount} > ${orders.subtotal} * 0.3`)).orderBy(desc(orders.discount)).limit(20);

        // Off-hours orders (before 6AM or after midnight)
        const offHours = await db.select({ hour: sql<number>`extract(hour from ${orders.createdAt})`, count: sql<number>`count(*)` })
            .from(orders).where(and(...conditions, sql`extract(hour from ${orders.createdAt}) < 6 OR extract(hour from ${orders.createdAt}) >= 24`))
            .groupBy(sql`extract(hour from ${orders.createdAt})`);

        // Cancelled rate by day
        const dailyCancel = await db.select({
            day: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM-DD')`,
            totalOrders: sql<number>`count(*)`,
            cancelledOrders: sql<number>`count(*) filter (where ${orders.status} = 'CANCELLED')`,
        }).from(orders).where(and(...conditions))
            .groupBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`)
            .having(sql`count(*) filter (where ${orders.status} = 'CANCELLED')::float / count(*)::float > 0.15`)
            .orderBy(sql`count(*) filter (where ${orders.status} = 'CANCELLED')::float / count(*)::float desc`);

        res.json({
            highDiscounts: highDiscounts.map(o => ({ ...o, discountPercent: Number(o.total) > 0 ? Number(((Number(o.discount) / (Number(o.total) + Number(o.discount))) * 100).toFixed(1)) : 0 })),
            offHoursOrders: offHours.map(o => ({ ...o, count: Number(o.count) })),
            highCancelDays: dailyCancel.map(d => ({ ...d, totalOrders: Number(d.totalOrders), cancelledOrders: Number(d.cancelledOrders), cancelRate: Number((Number(d.cancelledOrders) / Number(d.totalOrders) * 100).toFixed(1)) })),
        });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getBreakEvenAnalysis = async (req: Request, res: Response) => {
    try {
        const { branchId } = req.query;
        const conditions: any[] = [inArray(orders.status, ['DELIVERED', 'COMPLETED'])];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        // Monthly revenue & COGS
        const monthly = await db.select({
            month: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM')`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            orderCount: sql<number>`count(*)`,
        }).from(orders).where(and(...conditions, sql`${orders.createdAt} > now() - interval '6 months'`))
            .groupBy(sql`to_char(${orders.createdAt}, 'YYYY-MM')`)
            .orderBy(sql`to_char(${orders.createdAt}, 'YYYY-MM')`);

        // Estimate fixed costs from chart of accounts
        const [fixedCosts] = await db.select({
            total: sql<number>`coalesce(sum(${journalLines.debit}), 0)`,
        }).from(journalLines)
            .innerJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
            .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
            .where(sql`${chartOfAccounts.type} = 'EXPENSE' AND ${journalEntries.createdAt} > now() - interval '1 month'`);

        const avgRevenue = monthly.length > 0 ? monthly.reduce((s, m) => s + Number(m.revenue), 0) / monthly.length : 0;
        const avgOrders = monthly.length > 0 ? monthly.reduce((s, m) => s + Number(m.orderCount), 0) / monthly.length : 0;
        const avgTicket = avgOrders > 0 ? avgRevenue / avgOrders : 0;
        const fixedMonthly = Number(fixedCosts?.total || 0);
        const breakEvenRevenue = fixedMonthly > 0 ? fixedMonthly * 1.5 : avgRevenue * 0.7; // approx
        const breakEvenOrders = avgTicket > 0 ? Math.ceil(breakEvenRevenue / avgTicket) : 0;

        res.json({ monthly: monthly.map(m => ({ ...m, revenue: Number(Number(m.revenue).toFixed(2)), orderCount: Number(m.orderCount) })), fixedCostsEstimate: Number(fixedMonthly.toFixed(2)), avgMonthlyRevenue: Number(avgRevenue.toFixed(2)), avgMonthlyOrders: Math.round(avgOrders), avgTicket: Number(avgTicket.toFixed(2)), breakEvenRevenue: Number(breakEvenRevenue.toFixed(2)), breakEvenOrders, breakEvenOrdersPerDay: Math.ceil(breakEvenOrders / 30) });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getPaymentReconciliation = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);

        const orderConditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, ['DELIVERED', 'COMPLETED'])];
        if (branchId && branchId !== 'undefined') orderConditions.push(eq(orders.branchId, branchId as string));

        const [orderTotals] = await db.select({
            totalRevenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            orderCount: sql<number>`count(*)`,
        }).from(orders).where(and(...orderConditions));

        const paymentConditions: any[] = [gte(payments.createdAt, start), lte(payments.createdAt, end)];

        const paymentsByMethod = await db.select({
            method: payments.method,
            total: sql<number>`coalesce(sum(${payments.amount}), 0)`,
            count: sql<number>`count(*)`,
        }).from(payments).where(and(...paymentConditions)).groupBy(payments.method);

        const totalPayments = paymentsByMethod.reduce((s, p) => s + Number(p.total), 0);
        const discrepancy = Number(orderTotals?.totalRevenue || 0) - totalPayments;

        res.json({
            orderTotal: Number(Number(orderTotals?.totalRevenue || 0).toFixed(2)),
            orderCount: Number(orderTotals?.orderCount || 0),
            paymentTotal: Number(totalPayments.toFixed(2)),
            discrepancy: Number(discrepancy.toFixed(2)),
            discrepancyPercent: Number(orderTotals?.totalRevenue || 0) > 0 ? Number((discrepancy / Number(orderTotals?.totalRevenue || 1) * 100).toFixed(2)) : 0,
            byMethod: paymentsByMethod.map(p => ({ method: p.method, total: Number(Number(p.total).toFixed(2)), count: Number(p.count) })),
        });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getDailyFlashReport = async (req: Request, res: Response) => {
    try {
        const { branchId } = req.query;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
        const conditions: any[] = [gte(orders.createdAt, today), lte(orders.createdAt, tomorrow)];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const [salesAll] = await db.select({ revenue: sql<number>`coalesce(sum(${orders.total}), 0)`, orderCount: sql<number>`count(*)`, avgTicket: sql<number>`coalesce(avg(${orders.total}), 0)`, totalDiscount: sql<number>`coalesce(sum(${orders.discount}), 0)`, totalTips: sql<number>`coalesce(sum(${orders.tipAmount}), 0)` })
            .from(orders).where(and(...conditions, inArray(orders.status, ['DELIVERED', 'COMPLETED'])));

        const [cancels] = await db.select({ count: sql<number>`count(*)` }).from(orders).where(and(...conditions, eq(orders.status, 'CANCELLED')));

        const byType = await db.select({ type: orders.type, count: sql<number>`count(*)`, revenue: sql<number>`coalesce(sum(${orders.total}), 0)` })
            .from(orders).where(and(...conditions, inArray(orders.status, ['DELIVERED', 'COMPLETED']))).groupBy(orders.type);

        const payMethods = await db.select({ method: payments.method, total: sql<number>`coalesce(sum(${payments.amount}), 0)` })
            .from(payments).where(and(gte(payments.createdAt, today), lte(payments.createdAt, tomorrow))).groupBy(payments.method);

        res.json({
            date: today.toISOString().split('T')[0],
            revenue: Number(Number(salesAll?.revenue || 0).toFixed(2)),
            orderCount: Number(salesAll?.orderCount || 0),
            avgTicket: Number(Number(salesAll?.avgTicket || 0).toFixed(2)),
            totalDiscount: Number(Number(salesAll?.totalDiscount || 0).toFixed(2)),
            totalTips: Number(Number(salesAll?.totalTips || 0).toFixed(2)),
            cancelledOrders: Number(cancels?.count || 0),
            byType: byType.map(t => ({ type: t.type, count: Number(t.count), revenue: Number(Number(t.revenue).toFixed(2)) })),
            paymentMix: payMethods.map(p => ({ method: p.method, total: Number(Number(p.total).toFixed(2)) })),
        });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getMenuItemLifecycle = async (req: Request, res: Response) => {
    try {
        const { branchId, menuItemId } = req.query;
        const conditions: any[] = [inArray(orders.status, ['DELIVERED', 'COMPLETED'])];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));
        if (menuItemId) conditions.push(eq(orderItems.menuItemId, menuItemId as string));

        const monthly = await db.select({
            month: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM')`,
            itemName: orderItems.name,
            qty: sql<number>`sum(${orderItems.quantity})`,
            revenue: sql<number>`sum(${orderItems.price} * ${orderItems.quantity})`,
        }).from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id))
            .where(and(...conditions)).groupBy(sql`to_char(${orders.createdAt}, 'YYYY-MM')`, orderItems.name)
            .orderBy(sql`to_char(${orders.createdAt}, 'YYYY-MM')`)
            .limit(200);

        res.json(monthly.map(m => ({ month: m.month, itemName: m.itemName, qty: Number(m.qty), revenue: Number(Number(m.revenue).toFixed(2)) })));
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getCategoryContribution = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, ['DELIVERED', 'COMPLETED'])];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const rows = await db.select({
            categoryId: menuItems.categoryId,
            categoryName: menuCategories.name,
            qtySold: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
            revenue: sql<number>`coalesce(sum(${orderItems.price} * ${orderItems.quantity}), 0)`,
            cost: sql<number>`coalesce(sum(coalesce(${menuItems.cost}, 0) * ${orderItems.quantity}), 0)`,
        }).from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .leftJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
            .leftJoin(menuCategories, eq(menuItems.categoryId, menuCategories.id))
            .where(and(...conditions))
            .groupBy(menuItems.categoryId, menuCategories.name)
            .orderBy(sql`sum(${orderItems.price} * ${orderItems.quantity}) desc`);

        const totalRev = rows.reduce((s, r) => s + Number(r.revenue), 0);
        const totalProfit = rows.reduce((s, r) => s + (Number(r.revenue) - Number(r.cost)), 0);
        res.json(rows.map(r => {
            const rev = Number(r.revenue); const cost = Number(r.cost); const profit = rev - cost;
            return { categoryId: r.categoryId, categoryName: r.categoryName || 'Uncategorized', qtySold: Number(r.qtySold), revenue: Number(rev.toFixed(2)), cost: Number(cost.toFixed(2)), profit: Number(profit.toFixed(2)), margin: rev > 0 ? Number((profit / rev * 100).toFixed(1)) : 0, revenueShare: totalRev > 0 ? Number((rev / totalRev * 100).toFixed(1)) : 0, profitShare: totalProfit > 0 ? Number((profit / totalProfit * 100).toFixed(1)) : 0 };
        }));
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getShiftProfitability = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const shiftConditions: any[] = [gte(shifts.openingTime, start), lte(shifts.openingTime, end)];
        if (branchId && branchId !== 'undefined') shiftConditions.push(eq(shifts.branchId, branchId as string));

        const shiftData = await db.select({
            shiftId: shifts.id,
            openingTime: shifts.openingTime,
            closingTime: shifts.closingTime,
            openingCash: shifts.openingBalance,
            closingCash: shifts.actualBalance,
            expectedCash: shifts.expectedBalance,
        }).from(shifts).where(and(...shiftConditions)).orderBy(desc(shifts.openingTime)).limit(50);

        const result = [];
        for (const s of shiftData) {
            const [rev] = await db.select({ revenue: sql<number>`coalesce(sum(${orders.total}), 0)`, orderCount: sql<number>`count(*)` })
                .from(orders).where(and(eq(orders.shiftId, s.shiftId!), inArray(orders.status, ['DELIVERED', 'COMPLETED'])));
            result.push({ shiftId: s.shiftId, openingTime: s.openingTime, closingTime: s.closingTime, revenue: Number(Number(rev?.revenue || 0).toFixed(2)), orderCount: Number(rev?.orderCount || 0), openingCash: Number(s.openingCash || 0), closingCash: Number(s.closingCash || 0), expectedCash: Number(s.expectedCash || 0), variance: Number((Number(s.closingCash || 0) - Number(s.expectedCash || 0)).toFixed(2)) });
        }
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getDeliveryZoneAnalysis = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), eq(orders.type, 'DELIVERY'), inArray(orders.status, ['DELIVERED', 'COMPLETED']), sql`${orders.deliveryAddress} is not null`];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const zones = await db.select({
            area: sql<string>`split_part(${orders.deliveryAddress}, ',', -1)`,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            avgTicket: sql<number>`coalesce(avg(${orders.total}), 0)`,
            totalFees: sql<number>`coalesce(sum(${orders.deliveryFee}), 0)`,
        }).from(orders).where(and(...conditions))
            .groupBy(sql`split_part(${orders.deliveryAddress}, ',', -1)`)
            .orderBy(sql`count(*) desc`).limit(30);

        res.json(zones.map(z => ({ area: z.area?.trim() || 'Unknown', orderCount: Number(z.orderCount), revenue: Number(Number(z.revenue).toFixed(2)), avgTicket: Number(Number(z.avgTicket).toFixed(2)), totalFees: Number(Number(z.totalFees).toFixed(2)) })));
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getDeliveryCostVsRevenue = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), eq(orders.type, 'DELIVERY'), inArray(orders.status, ['DELIVERED', 'COMPLETED'])];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const daily = await db.select({
            day: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM-DD')`,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            deliveryFees: sql<number>`coalesce(sum(${orders.deliveryFee}), 0)`,
            freeDeliveries: sql<number>`count(*) filter (where ${orders.freeDelivery} = true)`,
        }).from(orders).where(and(...conditions))
            .groupBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`)
            .orderBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`);

        const [totals] = await db.select({
            totalOrders: sql<number>`count(*)`,
            totalRevenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            totalFees: sql<number>`coalesce(sum(${orders.deliveryFee}), 0)`,
            freeCount: sql<number>`count(*) filter (where ${orders.freeDelivery} = true)`,
        }).from(orders).where(and(...conditions));

        res.json({
            summary: { totalOrders: Number(totals?.totalOrders || 0), totalRevenue: Number(Number(totals?.totalRevenue || 0).toFixed(2)), totalFees: Number(Number(totals?.totalFees || 0).toFixed(2)), freeDeliveries: Number(totals?.freeCount || 0), feePercentOfRevenue: Number(totals?.totalRevenue || 0) > 0 ? Number((Number(totals?.totalFees || 0) / Number(totals?.totalRevenue || 1) * 100).toFixed(1)) : 0 },
            daily: daily.map(d => ({ day: d.day, orderCount: Number(d.orderCount), revenue: Number(Number(d.revenue).toFixed(2)), deliveryFees: Number(Number(d.deliveryFees).toFixed(2)), freeDeliveries: Number(d.freeDeliveries) })),
        });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getCustomerJourneyFunnel = async (_req: Request, res: Response) => {
    try {
        const [totalCustomers] = await db.select({ count: sql<number>`count(*)` }).from(customers);
        const [oneOrder] = await db.select({ count: sql<number>`count(*)` }).from(customers).where(sql`${customers.visits} >= 1`);
        const [twoPlus] = await db.select({ count: sql<number>`count(*)` }).from(customers).where(sql`${customers.visits} >= 2`);
        const [fivePlus] = await db.select({ count: sql<number>`count(*)` }).from(customers).where(sql`${customers.visits} >= 5`);
        const [tenPlus] = await db.select({ count: sql<number>`count(*)` }).from(customers).where(sql`${customers.visits} >= 10`);
        const [vip] = await db.select({ count: sql<number>`count(*)` }).from(customers).where(inArray(customers.loyaltyTier, ['Gold', 'Platinum']));

        const total = Number(totalCustomers?.count || 0);
        const funnel = [
            { stage: 'Registered', count: total, percent: 100 },
            { stage: 'First Order', count: Number(oneOrder?.count || 0), percent: total > 0 ? Number((Number(oneOrder?.count || 0) / total * 100).toFixed(1)) : 0 },
            { stage: '2+ Orders (Repeat)', count: Number(twoPlus?.count || 0), percent: total > 0 ? Number((Number(twoPlus?.count || 0) / total * 100).toFixed(1)) : 0 },
            { stage: '5+ Orders (Regular)', count: Number(fivePlus?.count || 0), percent: total > 0 ? Number((Number(fivePlus?.count || 0) / total * 100).toFixed(1)) : 0 },
            { stage: '10+ Orders (Loyal)', count: Number(tenPlus?.count || 0), percent: total > 0 ? Number((Number(tenPlus?.count || 0) / total * 100).toFixed(1)) : 0 },
            { stage: 'VIP (Gold/Platinum)', count: Number(vip?.count || 0), percent: total > 0 ? Number((Number(vip?.count || 0) / total * 100).toFixed(1)) : 0 },
        ];
        res.json(funnel);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getChannelMixTrend = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, ['DELIVERED', 'COMPLETED'])];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const daily = await db.select({
            day: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM-DD')`,
            source: orders.source,
            count: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
        }).from(orders).where(and(...conditions))
            .groupBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`, orders.source)
            .orderBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`);

        res.json(daily.map(d => ({ day: d.day, source: d.source || 'pos', count: Number(d.count), revenue: Number(Number(d.revenue).toFixed(2)) })));
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getOptimalPricing = async (_req: Request, res: Response) => {
    try {
        const items = await db.select({
            id: menuItems.id,
            name: menuItems.name,
            price: menuItems.price,
            cost: menuItems.cost,
        }).from(menuItems).where(sql`${menuItems.isAvailable} = true`);

        const result = items.map(item => {
            const price = Number(item.price) || 0;
            const cost = Number(item.cost) || 0;
            const margin = price > 0 ? (price - cost) / price * 100 : 0;
            const targetMargin = 65;
            const suggestedPrice = cost > 0 ? Number((cost / (1 - targetMargin / 100)).toFixed(2)) : price;
            const priceChange = suggestedPrice - price;
            return { id: item.id, name: item.name, currentPrice: price, cost, currentMargin: Number(margin.toFixed(1)), suggestedPrice, priceChange: Number(priceChange.toFixed(2)), action: margin < 30 ? 'INCREASE' : margin > 80 ? 'DECREASE' : 'OK' };
        }).sort((a, b) => a.currentMargin - b.currentMargin);

        res.json({ targetMargin: 65, items: result, needsIncrease: result.filter(r => r.action === 'INCREASE').length, ok: result.filter(r => r.action === 'OK').length, canDecrease: result.filter(r => r.action === 'DECREASE').length });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getThirdPartyVsInHouse = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), eq(orders.type, 'DELIVERY'), inArray(orders.status, ['DELIVERED', 'COMPLETED'])];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const inHouse = await db.select({
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            avgDeliveryMinutes: sql<number>`coalesce(avg(extract(epoch from (${orders.completedAt} - ${orders.createdAt})) / 60), 0)`,
        }).from(orders).where(and(...conditions, sql`${orders.driverId} is not null`));

        const thirdParty = await db.select({
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
        }).from(orders).where(and(...conditions, sql`${orders.driverId} is null`));

        res.json({
            inHouse: { orderCount: Number(inHouse[0]?.orderCount || 0), revenue: Number(Number(inHouse[0]?.revenue || 0).toFixed(2)), avgDeliveryMinutes: Number(Number(inHouse[0]?.avgDeliveryMinutes || 0).toFixed(1)) },
            thirdParty: { orderCount: Number(thirdParty[0]?.orderCount || 0), revenue: Number(Number(thirdParty[0]?.revenue || 0).toFixed(2)) },
        });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getTimeToFirstOrder = async (_req: Request, res: Response) => {
    try {
        const recentItems = await db.select({
            id: menuItems.id,
            name: menuItems.name,
            createdAt: menuItems.createdAt,
        }).from(menuItems).orderBy(desc(menuItems.createdAt)).limit(30);

        const result = [];
        for (const item of recentItems) {
            const [firstOrder] = await db.select({
                firstOrderDate: sql<string>`min(${orders.createdAt})`,
                totalOrders: sql<number>`count(*)`,
                totalQty: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
                totalRevenue: sql<number>`coalesce(sum(${orderItems.price} * ${orderItems.quantity}), 0)`,
            }).from(orderItems)
                .innerJoin(orders, eq(orderItems.orderId, orders.id))
                .where(and(eq(orderItems.menuItemId, item.id), inArray(orders.status, ['DELIVERED', 'COMPLETED'])));

            const addedDate = new Date(item.createdAt!);
            const firstDate = firstOrder?.firstOrderDate ? new Date(firstOrder.firstOrderDate) : null;
            const daysToFirst = firstDate ? Math.max(0, Math.floor((firstDate.getTime() - addedDate.getTime()) / 86400000)) : null;

            result.push({
                itemId: item.id, itemName: item.name, addedDate: item.createdAt,
                firstOrderDate: firstOrder?.firstOrderDate || null,
                daysToFirstOrder: daysToFirst,
                totalOrders: Number(firstOrder?.totalOrders || 0),
                totalQty: Number(firstOrder?.totalQty || 0),
                totalRevenue: Number(Number(firstOrder?.totalRevenue || 0).toFixed(2)),
            });
        }
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};
