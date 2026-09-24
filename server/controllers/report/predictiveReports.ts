import { Request, Response } from 'express';
import { eq, and, sql, gte, lte, inArray, desc, or, isNull } from 'drizzle-orm';
import { db } from '../../db';
import { orders, payments, orderItems, menuItems, menuCategories, customers, shifts, journalEntries, journalLines, chartOfAccounts, costCenters } from '../../../src/db/schema';
import { parseLocalDateRange, orderBusinessDateFilter } from './reportUtils';

// datepart(weekday) depends on @@DATEFIRST — normalize to Sunday=1..Saturday=7.
const sundayFirstWeekday = (dateExpr: any) =>
    sql<number>`((datepart(weekday, ${dateExpr}) + @@DATEFIRST - 1) % 7) + 1`;
const notDeleted = isNull(orders.deletedAt);
const liveLine = sql`coalesce(${orderItems.status}, '') not in ('VOID', 'VOIDED', 'CANCELLED')`;

export const getDemandForecast = async (req: Request, res: Response) => {
    try {
        const { branchId } = req.query;
        const conditions: any[] = [inArray(orders.status, ['DELIVERED', 'COMPLETED'])];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        // Get last 8 weeks daily data
        const dow = sundayFirstWeekday(orders.createdAt);
        const daily = await db.select({
            dayOfWeek: dow,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
        }).from(orders).where(and(...conditions, notDeleted, sql`${orders.createdAt} > dateadd(week, -8, getdate())`))
            .groupBy(dow)
            .orderBy(dow);

        // Top items last 4 weeks
        const topItems = await db.select({
            itemName: orderItems.name,
            avgDailyQty: sql<number>`coalesce(sum(${orderItems.quantity}) / 28.0, 0)`,
            totalQty: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
        }).from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .where(and(...conditions, sql`${orders.createdAt} > dateadd(week, -4, getdate())`))
            .groupBy(orderItems.name)
            .orderBy(sql`sum(${orderItems.quantity}) desc`)
            .limit(20);

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const weeksCount = 8;
        const byDow = new Map(daily.map((d) => [Number(d.dayOfWeek), d]));
        // Emit all 7 weekdays (zeros included) with Sunday-first labels.
        const forecast = [1, 2, 3, 4, 5, 6, 7].map((dowNum) => {
            const d = byDow.get(dowNum);
            const orderCount = Number(d?.orderCount || 0);
            const revenue = Number(d?.revenue || 0);
            return {
                dayOfWeek: dayNames[dowNum - 1],
                avgOrders: Math.round(orderCount / weeksCount),
                avgRevenue: Number((revenue / weeksCount).toFixed(2)),
                predictedOrders: Math.round(orderCount / weeksCount * 1.05),
                predictedRevenue: Number((revenue / weeksCount * 1.05).toFixed(2)),
            };
        });

        res.json({
            weeklyForecast: forecast,
            estimate: true,
            topItemsDemand: topItems.map(t => ({
                itemName: t.itemName,
                avgDailyQty: Number(Number(t.avgDailyQty).toFixed(1)),
                totalQty4Weeks: Number(Number(t.totalQty).toFixed(0)),
                weeklyQty: Number((Number(t.totalQty) / 4).toFixed(1)),
            })),
        });
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
            // Catalog price first (true "current" price after price changes),
            // then latest sold price — never max() which sticks to old highs.
            currentPrice: sql<number>`coalesce(max(${menuItems.price}), max(${orderItems.price}))`,
            cost: sql<number>`coalesce(max(${orderItems.cost}), max(${menuItems.cost}), 0)`,
            totalQty: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
            revenue: sql<number>`coalesce(sum(${orderItems.price} * ${orderItems.quantity}), 0)`,
        }).from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .leftJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
            .where(and(...conditions, notDeleted, liveLine, sql`${orders.createdAt} > dateadd(day, -30, getdate())`))
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
        // Fixed textbook multipliers — hypothetical scenarios, NOT fitted
        // elasticity. Zero-cost items would show infinite margin: flagged.
        res.json({
            scenarioBasis: 'HYPOTHETICAL_FIXED_MULTIPLIERS',
            items: simulations.map((s) => ({ ...s, zeroCost: !(s.cost > 0) })),
        });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getMenuCannibalization = async (req: Request, res: Response) => {
    try {
        const { branchId } = req.query;
        const conditions: any[] = [inArray(orders.status, ['DELIVERED', 'COMPLETED']), notDeleted];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const recent = await db.select({ itemName: orderItems.name, qty: sql<number>`sum(${orderItems.quantity})`, revenue: sql<number>`sum(${orderItems.price} * ${orderItems.quantity})` })
            .from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id))
            .where(and(...conditions, liveLine, sql`${orders.createdAt} > dateadd(day, -30, getdate())`))
            .groupBy(orderItems.name);

        const prior = await db.select({ itemName: orderItems.name, qty: sql<number>`sum(${orderItems.quantity})`, revenue: sql<number>`sum(${orderItems.price} * ${orderItems.quantity})` })
            .from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id))
            .where(and(...conditions, liveLine, sql`${orders.createdAt} > dateadd(day, -60, getdate()) AND ${orders.createdAt} <= dateadd(day, -30, getdate())`))
            .groupBy(orderItems.name);

        const priorMap = new Map(prior.map(p => [p.itemName, { qty: Number(p.qty), revenue: Number(p.revenue) }]));
        const results = recent.map(r => {
            const p = priorMap.get(r.itemName);
            const recentQty = Number(r.qty); const priorQty = p?.qty || 0;
            return { itemName: r.itemName, recentQty, priorQty, qtyChange: recentQty - priorQty, qtyChangePercent: priorQty > 0 ? Number(((recentQty - priorQty) / priorQty * 100).toFixed(1)) : null, recentRevenue: Number(Number(r.revenue).toFixed(2)), priorRevenue: Number((p?.revenue || 0).toFixed(2)) };
        }).sort((a, b) => (a.qtyChangePercent ?? 0) - (b.qtyChangePercent ?? 0));

        const declining = results.filter(r => (r.qtyChangePercent ?? 0) < -10);
        const growing = results.filter(r => (r.qtyChangePercent ?? 0) > 10);
        // New (no prior sales) and discontinued (no recent sales) items get
        // their own buckets instead of vanishing with a null percent.
        const recentNames = new Set(recent.map((r) => r.itemName));
        const newItems = results.filter((r) => r.priorQty === 0);
        const discontinued = prior
            .filter((p) => !recentNames.has(p.itemName))
            .map((p) => ({ itemName: p.itemName, recentQty: 0, priorQty: Number(p.qty), qtyChange: -Number(p.qty), qtyChangePercent: -100, recentRevenue: 0, priorRevenue: Number(Number(p.revenue).toFixed(2)) }));
        res.json({ declining, growing, newItems, discontinued, all: results });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getAnomalyDetection = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), notDeleted];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        // Unusual high-discount orders
        const highDiscounts = await db.select({ id: orders.id, orderNumber: orders.orderNumber, discount: orders.discount, total: orders.total, createdAt: orders.createdAt })
            .from(orders).where(and(...conditions, sql`${orders.discount} > ${orders.subtotal} * 0.3`)).orderBy(desc(orders.discount)).limit(20);

        // Off-hours orders: before 6AM or at/after 10PM (hour is 0-23, so the
        // old `>= 24` predicate could never fire).
        const offHour = sql<number>`datepart(hour, ${orders.createdAt})`;
        const offHours = await db.select({ hour: offHour, count: sql<number>`count(*)` })
            .from(orders).where(and(...conditions, sql`${offHour} < 6 OR ${offHour} >= 22`))
            .groupBy(offHour);

        // Cancelled rate by day
        const dailyCancel = await db.select({
            day: sql<string>`format(${orders.createdAt}, 'yyyy-MM-dd')`,
            totalOrders: sql<number>`count(*)`,
            cancelledOrders: sql<number>`sum(case when ${orders.status} = 'CANCELLED' then 1 else 0 end)`,
        }).from(orders).where(and(...conditions))
            .groupBy(sql`format(${orders.createdAt}, 'yyyy-MM-dd')`)
        .having(sql`cast(sum(case when ${orders.status} = 'CANCELLED' then 1 else 0 end) as float) / cast(count(*) as float) > 0.15`)
        .orderBy(sql`cast(sum(case when ${orders.status} = 'CANCELLED' then 1 else 0 end) as float) / cast(count(*) as float) desc`);

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

        // Monthly revenue & COGS (last 6 months, business-day based).
        // COGS uses the per-line cost snapshot so history never reprices.
        const monthExpr = sql<string>`format(coalesce(try_cast(${orders.businessDate} as date), ${orders.createdAt}), 'yyyy-MM')`;
        const monthly = await db.select({
            month: monthExpr,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            orderCount: sql<number>`count(*)`,
            cogs: sql<number>`coalesce(sum(${orderItems.quantity} * coalesce(${orderItems.cost}, 0)), 0)`,
        }).from(orders)
            .leftJoin(orderItems, and(
                eq(orderItems.orderId, orders.id),
                sql`coalesce(${orderItems.status}, '') not in ('VOID', 'VOIDED', 'CANCELLED')`,
            ))
            .where(and(...conditions, notDeleted, sql`${orders.createdAt} > dateadd(month, -6, getdate())`))
            .groupBy(monthExpr)
            .orderBy(monthExpr);

        // Fixed costs: POSTED operating-expense lines of the last 30 days,
        // netted (debit − credit), on journal DATE, branch-scoped via cost
        // center (NULL-cost-center lines stay in scope). COGS journals are
        // variable costs — excluded so the fixed base is not inflated.
        const fixedConds: any[] = [
            sql`${chartOfAccounts.type} = 'EXPENSE'`,
            eq(journalEntries.status, 'POSTED'),
            sql`${journalEntries.date} > dateadd(day, -30, getdate())`,
            sql`coalesce(${journalEntries.referenceType}, '') not in ('COGS', 'COGS_REVERSAL')`,
        ];
        if (branchId && branchId !== 'undefined') {
            fixedConds.push(or(eq(costCenters.branchId, branchId as string), isNull(journalLines.costCenterId)));
        }
        const [fixedCosts] = await db.select({
            total: sql<number>`coalesce(sum(${journalLines.debit} - ${journalLines.credit}), 0)`,
        }).from(journalLines)
            .innerJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
            .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
            .leftJoin(costCenters, eq(journalLines.costCenterId, costCenters.id))
            .where(and(...fixedConds));

        const totalRevenue = monthly.reduce((s, m) => s + Number(m.revenue), 0);
        const totalCogs = monthly.reduce((s, m) => s + Number((m as any).cogs), 0);
        const totalOrders = monthly.reduce((s, m) => s + Number(m.orderCount), 0);
        const avgRevenue = monthly.length > 0 ? totalRevenue / monthly.length : 0;
        const avgOrders = monthly.length > 0 ? totalOrders / monthly.length : 0;
        const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
        const fixedMonthly = Number(fixedCosts?.total || 0);
        // Break-even = fixed costs / contribution-margin ratio. Null (not zero)
        // when the margin is not positive — zero would imply "already there".
        const marginRatio = totalRevenue > 0 ? (totalRevenue - totalCogs) / totalRevenue : 0;
        const hasMargin = marginRatio > 0;
        const breakEvenRevenue = hasMargin ? fixedMonthly / marginRatio : null;
        const breakEvenOrders = hasMargin && avgTicket > 0 ? Math.ceil((breakEvenRevenue as number) / avgTicket) : null;
        // Actual calendar-month length instead of a hard 30.
        const now = new Date();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() || 30;

        res.json({
            monthly: monthly.map(m => ({ month: m.month, revenue: Number(Number(m.revenue).toFixed(2)), cogs: Number(Number((m as any).cogs || 0).toFixed(2)), orderCount: Number(m.orderCount) })),
            fixedCostsEstimate: Number(fixedMonthly.toFixed(2)),
            fixedCostsBasis: 'POSTED_EXPENSE_EXCLUDING_COGS_LAST_30_DAYS',
            contributionMarginRatio: Number(marginRatio.toFixed(4)),
            avgMonthlyRevenue: Number(avgRevenue.toFixed(2)),
            avgMonthlyOrders: Math.round(avgOrders),
            avgTicket: Number(avgTicket.toFixed(2)),
            breakEvenRevenue: breakEvenRevenue == null ? null : Number((breakEvenRevenue as number).toFixed(2)),
            breakEvenOrders,
            breakEvenOrdersPerDay: breakEvenOrders == null ? null : Math.ceil((breakEvenOrders as number) / daysInMonth),
            daysInMonth,
            method: 'fixed_posted_opex / contribution_margin',
            estimate: true,
        });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getPaymentReconciliation = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);

        // Both legs scoped identically: same business-day window, same branch,
        // live orders only. Payments leg joins orders so branch/date match.
        const orderConditions: any[] = [businessDateFilter, inArray(orders.status, ['DELIVERED', 'COMPLETED']), notDeleted];
        if (branchId && branchId !== 'undefined') orderConditions.push(eq(orders.branchId, branchId as string));

        const [orderTotals] = await db.select({
            totalRevenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            orderCount: sql<number>`count(*)`,
        }).from(orders).where(and(...orderConditions));

        // Payments leg joins orders: same business-day window, same branch,
        // same live-order scope AND the same DELIVERED/COMPLETED order-status
        // filter as the orders leg — otherwise cancelled-order payments fake
        // a discrepancy.
        const paymentBase: any[] = [businessDateFilter, notDeleted, inArray(orders.status, ['DELIVERED', 'COMPLETED'])];
        if (branchId && branchId !== 'undefined') paymentBase.push(eq(orders.branchId, branchId as string));

        const paymentsByMethod = await db.select({
            method: payments.method,
            total: sql<number>`coalesce(sum(${payments.amount}), 0)`,
            count: sql<number>`count(*)`,
        }).from(payments)
            .innerJoin(orders, eq(payments.orderId, orders.id))
            .where(and(...paymentBase, eq(payments.status, 'COMPLETED')))
            .groupBy(payments.method);

        const [refunded] = await db.select({
            total: sql<number>`coalesce(sum(${payments.amount}), 0)`,
            count: sql<number>`count(*)`,
        }).from(payments)
            .innerJoin(orders, eq(payments.orderId, orders.id))
            .where(and(...paymentBase, eq(payments.status, 'REFUNDED')));

        const totalPayments = paymentsByMethod.reduce((s, p) => s + Number(p.total), 0);
        const refundedTotal = Number(refunded?.total || 0);
        const netPayments = totalPayments - refundedTotal;
        const discrepancy = Number(orderTotals?.totalRevenue || 0) - netPayments;

        res.json({
            orderTotal: Number(Number(orderTotals?.totalRevenue || 0).toFixed(2)),
            orderCount: Number(orderTotals?.orderCount || 0),
            paymentTotal: Number(totalPayments.toFixed(2)),
            refundedTotal: Number(refundedTotal.toFixed(2)),
            refundedCount: Number(refunded?.count || 0),
            netPayments: Number(netPayments.toFixed(2)),
            discrepancy: Number(discrepancy.toFixed(2)),
            discrepancyPercent: Number(orderTotals?.totalRevenue || 0) > 0 ? Number((discrepancy / Number(orderTotals?.totalRevenue || 1) * 100).toFixed(2)) : 0,
            byMethod: paymentsByMethod.map(p => ({ method: p.method, total: Number(Number(p.total).toFixed(2)), count: Number(p.count) })),
        });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getDailyFlashReport = async (req: Request, res: Response) => {
    try {
        const { branchId } = req.query;
        // Logical business day (yyyy-MM-dd) — no midnight double-count, no
        // wall-clock vs business-day drift.
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const conditions: any[] = [sql`coalesce(${orders.businessDate}, format(${orders.createdAt}, 'yyyy-MM-dd')) = ${todayStr}`, notDeleted];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const [salesAll] = await db.select({ revenue: sql<number>`coalesce(sum(${orders.total}), 0)`, orderCount: sql<number>`count(*)`, avgTicket: sql<number>`coalesce(avg(${orders.total}), 0)`, totalDiscount: sql<number>`coalesce(sum(${orders.discount}), 0)`, totalTips: sql<number>`coalesce(sum(${orders.tipAmount}), 0)` })
            .from(orders).where(and(...conditions, inArray(orders.status, ['DELIVERED', 'COMPLETED'])));

        const [cancels] = await db.select({ count: sql<number>`count(*)` }).from(orders).where(and(...conditions, inArray(orders.status, ['CANCELLED', 'REFUNDED', 'VOID'])));

        const byType = await db.select({ type: orders.type, count: sql<number>`count(*)`, revenue: sql<number>`coalesce(sum(${orders.total}), 0)` })
            .from(orders).where(and(...conditions, inArray(orders.status, ['DELIVERED', 'COMPLETED']))).groupBy(orders.type);

        // Payment mix joins today's live orders (same scope) and counts only
        // completed takings.
        const payConds: any[] = [...conditions, eq(payments.status, 'COMPLETED')];
        const payMethods = await db.select({ method: payments.method, total: sql<number>`coalesce(sum(${payments.amount}), 0)` })
            .from(payments)
            .innerJoin(orders, eq(payments.orderId, orders.id))
            .where(and(...payConds)).groupBy(payments.method);

        res.json({
            date: todayStr,
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
        const conditions: any[] = [inArray(orders.status, ['DELIVERED', 'COMPLETED']), notDeleted];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));
        if (menuItemId) conditions.push(eq(orderItems.menuItemId, menuItemId as string));

        const monthly = await db.select({
            month: sql<string>`format(${orders.createdAt}, 'yyyy-MM')`,
            itemName: orderItems.name,
            qty: sql<number>`sum(${orderItems.quantity})`,
            revenue: sql<number>`sum(${orderItems.price} * ${orderItems.quantity})`,
        }).from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id))
            .where(and(...conditions)).groupBy(sql`format(${orders.createdAt}, 'yyyy-MM')`, orderItems.name)
            .orderBy(sql`format(${orders.createdAt}, 'yyyy-MM')`)
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
            cost: sql<number>`coalesce(sum(coalesce(${orderItems.cost}, ${menuItems.cost}, 0) * ${orderItems.quantity}), 0)`,
        }).from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .leftJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
            .leftJoin(menuCategories, eq(menuItems.categoryId, menuCategories.id))
            .where(and(...conditions, notDeleted, liveLine))
            .groupBy(menuItems.categoryId, menuCategories.name)
            .orderBy(sql`sum(${orderItems.price} * ${orderItems.quantity}) desc`);

        const totalRev = rows.reduce((s, r) => s + Number(r.revenue), 0);
        const totalProfit = rows.reduce((s, r) => s + (Number(r.revenue) - Number(r.cost)), 0);
        res.json(rows.map(r => {
            const rev = Number(r.revenue); const cost = Number(r.cost); const profit = rev - cost;
            // Signed shares when the mix loses money overall: clamping to 0
            // hid loss-making categories behind a fake 0%.
            const profitShare = totalProfit !== 0 ? Number((profit / totalProfit * 100).toFixed(1)) : 0;
            return { categoryId: r.categoryId, categoryName: r.categoryName || 'Uncategorized', qtySold: Number(r.qtySold), revenue: Number(rev.toFixed(2)), cost: Number(cost.toFixed(2)), profit: Number(profit.toFixed(2)), margin: rev > 0 ? Number((profit / rev * 100).toFixed(1)) : 0, revenueShare: totalRev > 0 ? Number((rev / totalRev * 100).toFixed(1)) : 0, profitShare };
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

        // One grouped query (no N+1): revenue + COGS snapshot + cancelled
        // count per shift. COGS makes this actual profitability, not revenue.
        const shiftIds = shiftData.map((s) => s.shiftId).filter(Boolean);
        const metricsByShift = new Map<string, any>();
        if (shiftIds.length > 0) {
            const metrics = await db.select({
                shiftId: orders.shiftId,
                revenue: sql<number>`coalesce(sum(case when ${orders.status} in ('DELIVERED', 'COMPLETED') then ${orders.total} else 0 end), 0)`,
                orderCount: sql<number>`sum(case when ${orders.status} in ('DELIVERED', 'COMPLETED') then 1 else 0 end)`,
                cogs: sql<number>`coalesce(sum(${orderItems.quantity} * coalesce(${orderItems.cost}, 0)), 0)`,
                cancelledCount: sql<number>`sum(case when ${orders.status} in ('CANCELLED', 'REFUNDED', 'VOID') then 1 else 0 end)`,
            }).from(orders)
                .leftJoin(orderItems, and(
                    eq(orderItems.orderId, orders.id),
                    inArray(orders.status, ['DELIVERED', 'COMPLETED']),
                    sql`coalesce(${orderItems.status}, '') not in ('VOID', 'VOIDED', 'CANCELLED')`,
                ))
                .where(and(inArray(orders.shiftId, shiftIds as string[]), notDeleted))
                .groupBy(orders.shiftId);
            for (const m of metrics) {
                if (m.shiftId) metricsByShift.set(m.shiftId, m);
            }
        }
        const result = shiftData.map((s) => {
            const m = metricsByShift.get(s.shiftId!) || { revenue: 0, orderCount: 0, cogs: 0, cancelledCount: 0 };
            const revenue = Number(m.revenue || 0);
            const cogs = Number(m.cogs || 0);
            return {
                shiftId: s.shiftId,
                openingTime: s.openingTime,
                closingTime: s.closingTime,
                revenue: Number(revenue.toFixed(2)),
                cogs: Number(cogs.toFixed(2)),
                grossProfit: Number((revenue - cogs).toFixed(2)),
                orderCount: Number(m.orderCount || 0),
                cancelledCount: Number(m.cancelledCount || 0),
                openingCash: Number(s.openingCash || 0),
                closingCash: Number(s.closingCash || 0),
                expectedCash: Number(s.expectedCash || 0),
                variance: Number((Number(s.closingCash || 0) - Number(s.expectedCash || 0)).toFixed(2)),
            };
        });
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

        // Area = text after the last comma; addresses WITHOUT a comma used to
        // crash the whole report (charindex−1 = −1 → substring error).
        const areaExpr = sql<string>`case when charindex(',', reverse(${orders.deliveryAddress})) > 0 then reverse(substring(reverse(${orders.deliveryAddress}), 1, charindex(',', reverse(${orders.deliveryAddress})) - 1)) else ${orders.deliveryAddress} end`;
        const zones = await db.select({
            area: areaExpr,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            avgTicket: sql<number>`coalesce(avg(${orders.total}), 0)`,
            totalFees: sql<number>`coalesce(sum(${orders.deliveryFee}), 0)`,
        }).from(orders).where(and(...conditions, notDeleted))
            .groupBy(areaExpr)
            .orderBy(sql`count(*) desc`).limit(30);

        res.json(zones.map(z => ({ area: z.area?.trim() || 'Unknown', orderCount: Number(z.orderCount), revenue: Number(Number(z.revenue).toFixed(2)), avgTicket: Number(Number(z.avgTicket).toFixed(2)), totalFees: Number(Number(z.totalFees).toFixed(2)) })));
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getDeliveryCostVsRevenue = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), eq(orders.type, 'DELIVERY'), inArray(orders.status, ['DELIVERED', 'COMPLETED']), notDeleted];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const daily = await db.select({
            day: sql<string>`format(${orders.createdAt}, 'yyyy-MM-dd')`,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            deliveryFees: sql<number>`coalesce(sum(${orders.deliveryFee}), 0)`,
            freeDeliveries: sql<number>`sum(case when ${orders.freeDelivery} = 1 then 1 else 0 end)`,
        }).from(orders).where(and(...conditions))
            .groupBy(sql`format(${orders.createdAt}, 'yyyy-MM-dd')`)
            .orderBy(sql`format(${orders.createdAt}, 'yyyy-MM-dd')`);

        const [totals] = await db.select({
            totalOrders: sql<number>`count(*)`,
            totalRevenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            totalFees: sql<number>`coalesce(sum(${orders.deliveryFee}), 0)`,
            freeCount: sql<number>`sum(case when ${orders.freeDelivery} = 1 then 1 else 0 end)`,
        }).from(orders).where(and(...conditions));

        res.json({
            // Fee share only — driver pay/fuel/aggregator commission are not
            // modeled here, so this is NOT delivery profitability.
            costBasis: 'DELIVERY_FEE_SHARE_NO_DRIVER_COST',
            summary: { totalOrders: Number(totals?.totalOrders || 0), totalRevenue: Number(Number(totals?.totalRevenue || 0).toFixed(2)), totalFees: Number(Number(totals?.totalFees || 0).toFixed(2)), freeDeliveries: Number(totals?.freeCount || 0), feePercentOfRevenue: Number(totals?.totalRevenue || 0) > 0 ? Number((Number(totals?.totalFees || 0) / Number(totals?.totalRevenue || 1) * 100).toFixed(1)) : 0 },
            daily: daily.map(d => ({ day: d.day, orderCount: Number(d.orderCount), revenue: Number(Number(d.revenue).toFixed(2)), deliveryFees: Number(Number(d.deliveryFees).toFixed(2)), freeDeliveries: Number(d.freeDeliveries) })),
        });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getCustomerJourneyFunnel = async (req: Request, res: Response) => {
    try {
        // Built from real orders (not the denormalized visits counter which
        // drifts): cohort = customers ordering in the window (default last 90
        // days), stages by their lifetime delivered-order count.
        const { branchId, startDate, endDate } = req.query;
        const end = endDate ? new Date(`${endDate}T23:59:59`) : new Date();
        const start = startDate
            ? new Date(`${startDate}T00:00:00`)
            : new Date(end.getTime() - 90 * 86400000);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return res.status(400).json({ error: 'Invalid date range' });
        }
        const scopeConds: any[] = [inArray(orders.status, ['DELIVERED', 'COMPLETED']), notDeleted, sql`${orders.customerId} is not null`];
        if (branchId && branchId !== 'undefined') scopeConds.push(eq(orders.branchId, branchId as string));

        const cohortRows = await db.select({
            customerId: orders.customerId,
            lifetimeOrders: sql<number>`count(*)`,
            lifetimeSpent: sql<number>`coalesce(sum(${orders.total}), 0)`,
        }).from(orders).where(and(...scopeConds))
            .groupBy(orders.customerId);
        const inWindow = new Set(
            (await db.select({ customerId: orders.customerId }).from(orders)
                .where(and(...scopeConds, gte(orders.createdAt, start), lte(orders.createdAt, end)))
                .groupBy(orders.customerId)).map((r) => r.customerId),
        );
        const cohort = cohortRows.filter((r) => r.customerId && inWindow.has(r.customerId));
        const countAtLeast = (n: number) => cohort.filter((c) => Number(c.lifetimeOrders) >= n).length;
        const total = cohort.length;
        const two = countAtLeast(2);
        const five = countAtLeast(5);
        const ten = countAtLeast(10);
        const pct = (n: number) => (total > 0 ? Number(((n / total) * 100).toFixed(1)) : 0);
        // Note: every cohort member has ≥1 lifetime order by construction, so
        // a separate "1+" stage would duplicate "Ordered in window" — the
        // funnel starts at repeat behavior.
        res.json({
            cohort: { from: start, to: end, customers: total },
            funnel: [
                { stage: 'Ordered in window (1+)', count: total, percent: 100 },
                { stage: '2+ Orders (Repeat)', count: two, percent: pct(two) },
                { stage: '5+ Orders (Regular)', count: five, percent: pct(five) },
                { stage: '10+ Orders (Loyal)', count: ten, percent: pct(ten) },
            ],
        });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getChannelMixTrend = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, ['DELIVERED', 'COMPLETED']), notDeleted];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const daily = await db.select({
            day: sql<string>`format(${orders.createdAt}, 'yyyy-MM-dd')`,
            // Channel key: a non-restaurant delivery_source (talabat, elmenus…)
            // identifies the aggregator; otherwise the origin (pos, call_center).
            // Both POS and call-center platform orders share this convention.
            source: sql<string>`case when ${orders.deliverySource} is not null and ${orders.deliverySource} <> 'restaurant' then ${orders.deliverySource} else coalesce(${orders.source}, 'pos') end`,
            count: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
        }).from(orders).where(and(...conditions))
            .groupBy(sql`format(${orders.createdAt}, 'yyyy-MM-dd')`, sql`case when ${orders.deliverySource} is not null and ${orders.deliverySource} <> 'restaurant' then ${orders.deliverySource} else coalesce(${orders.source}, 'pos') end`)
            .orderBy(sql`format(${orders.createdAt}, 'yyyy-MM-dd')`);

        res.json(daily.map(d => ({ day: d.day, source: d.source || 'pos', count: Number(d.count), revenue: Number(Number(d.revenue).toFixed(2)) })));
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getOptimalPricing = async (req: Request, res: Response) => {
    try {
        // Rule-based pricing aid (cost-plus vs a target margin), NOT a demand
        // model — no sales history or elasticity is used.
        const targetMargin = Math.min(95, Math.max(5, Number(req.query.targetMargin) || 65));
        const items = await db.select({
            id: menuItems.id,
            name: menuItems.name,
            price: menuItems.price,
            cost: menuItems.cost,
        }).from(menuItems).where(and(eq(menuItems.isAvailable, true), isNull(menuItems.deletedAt)));

        const result = items.map(item => {
            const price = Number(item.price) || 0;
            const cost = Number(item.cost) || 0;
            const margin = price > 0 ? (price - cost) / price * 100 : 0;
            const suggestedPrice = cost > 0 ? Number((cost / (1 - targetMargin / 100)).toFixed(2)) : price;
            const priceChange = suggestedPrice - price;
            return { id: item.id, name: item.name, currentPrice: price, cost, currentMargin: Number(margin.toFixed(1)), suggestedPrice, priceChange: Number(priceChange.toFixed(2)), needsReview: !(cost > 0), action: margin < 30 ? 'INCREASE' : margin > 80 ? 'DECREASE' : 'OK' };
        }).sort((a, b) => a.currentMargin - b.currentMargin);

        res.json({ targetMargin, method: 'RULE_BASED_COST_PLUS', items: result, needsIncrease: result.filter(r => r.action === 'INCREASE').length, ok: result.filter(r => r.action === 'OK').length, canDecrease: result.filter(r => r.action === 'DECREASE').length });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};

export const getThirdPartyVsInHouse = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), eq(orders.type, 'DELIVERY'), inArray(orders.status, ['DELIVERED', 'COMPLETED']), notDeleted];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        // Split by WHO delivers (deliverySource), not by driver assignment:
        // in-house = restaurant/own fleet, third-party = aggregator platform.
        // (Driver-based split mislabels own-driver platform orders and
        // unassigned in-house ones.)
        const inHouseCond = and(...conditions, sql`(${orders.deliverySource} is null or ${orders.deliverySource} = 'restaurant')`);
        const thirdPartyCond = and(...conditions, sql`(${orders.deliverySource} is not null and ${orders.deliverySource} <> 'restaurant')`);
        const inHouse = await db.select({
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            avgDeliveryMinutes: sql<number>`coalesce(avg(datediff(second, ${orders.createdAt}, ${orders.completedAt}) / 60.0), 0)`,
        }).from(orders).where(inHouseCond);

        const thirdParty = await db.select({
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
        }).from(orders).where(thirdPartyCond);

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
        }).from(menuItems).where(isNull(menuItems.deletedAt)).orderBy(desc(menuItems.createdAt)).limit(30);

        // One grouped query (the old per-item loop was N+1).
        const itemIds = recentItems.map((i) => i.id);
        const firstAgg = new Map<string, any>();
        if (itemIds.length > 0) {
            const aggRows = await db.select({
                menuItemId: orderItems.menuItemId,
                firstOrderDate: sql<string>`min(${orders.createdAt})`,
                totalOrders: sql<number>`count(*)`,
                totalQty: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
                totalRevenue: sql<number>`coalesce(sum(${orderItems.price} * ${orderItems.quantity}), 0)`,
            }).from(orderItems)
                .innerJoin(orders, eq(orderItems.orderId, orders.id))
                .where(and(
                    inArray(orderItems.menuItemId, itemIds),
                    inArray(orders.status, ['DELIVERED', 'COMPLETED']),
                    notDeleted,
                    liveLine,
                ))
                .groupBy(orderItems.menuItemId);
            for (const a of aggRows) {
                if (a.menuItemId) firstAgg.set(a.menuItemId, a);
            }
        }

        const result = recentItems.map((item) => {
            const firstOrder = firstAgg.get(item.id);
            const addedDate = new Date(item.createdAt!);
            const firstDate = firstOrder?.firstOrderDate ? new Date(firstOrder.firstOrderDate) : null;
            const rawDays = firstDate ? Math.floor((firstDate.getTime() - addedDate.getTime()) / 86400000) : null;
            return {
                itemId: item.id, itemName: item.name, addedDate: item.createdAt,
                firstOrderDate: firstOrder?.firstOrderDate || null,
                daysToFirstOrder: rawDays === null ? null : Math.max(0, rawDays),
                // Negative gaps mean backdated orders — surfaced, not silenced.
                backdated: rawDays !== null && rawDays < 0,
                totalOrders: Number(firstOrder?.totalOrders || 0),
                totalQty: Number(firstOrder?.totalQty || 0),
                totalRevenue: Number(Number(firstOrder?.totalRevenue || 0).toFixed(2)),
            };
        });
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
};
