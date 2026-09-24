import { Request, Response } from 'express';
import { eq, and, sql, gte, lte, inArray, desc, isNull } from 'drizzle-orm';
import { db } from '../../db';
import { orders, payments, shifts } from '../../../src/db/schema';
import { parseLocalDateRange, orderBusinessDayExpression } from './reportUtils';
import { revenueEligibleOrder } from '../../utils/orderRevenue';

const notDeleted = isNull(orders.deletedAt);

export const getTipsReport = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
        // Prefer businessDate (day-key) when present so results stay consistent
        // with the Day Close module across timezones; createdAt acts as a fallback
        // for legacy rows without a businessDate.
        const orderDateCondition = sql`(${orders.businessDate} is not null and ${orders.businessDate} >= ${startDate as string} and ${orders.businessDate} <= ${endDate as string}) or (${orders.businessDate} is null and ${orders.createdAt} >= ${start} and ${orders.createdAt} <= ${end})`;
        const conditions: any[] = [orderDateCondition, inArray(orders.status, deliveredStatuses), notDeleted, sql`${orders.tipAmount} > 0`];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const [summary] = await db.select({
            totalTips: sql<number>`coalesce(sum(${orders.tipAmount}), 0)`,
            orderCount: sql<number>`count(*)`,
            avgTip: sql<number>`coalesce(avg(${orders.tipAmount}), 0)`,
            maxTip: sql<number>`coalesce(max(${orders.tipAmount}), 0)`,
        }).from(orders).where(and(...conditions));

        const byType = await db.select({
            orderType: orders.type,
            totalTips: sql<number>`coalesce(sum(${orders.tipAmount}), 0)`,
            count: sql<number>`count(*)`,
        }).from(orders).where(and(...conditions)).groupBy(orders.type).orderBy(sql`sum(${orders.tipAmount}) desc`);

        // Daily buckets use the logical business day (same key as the filter).
        const day = orderBusinessDayExpression();
        const daily = await db.select({
            day,
            totalTips: sql<number>`coalesce(sum(${orders.tipAmount}), 0)`,
            count: sql<number>`count(*)`,
        }).from(orders).where(and(...conditions))
            .groupBy(day)
            .orderBy(day);

        res.json({
            summary: { totalTips: Number(Number(summary?.totalTips || 0).toFixed(2)), orderCount: Number(summary?.orderCount || 0), avgTip: Number(Number(summary?.avgTip || 0).toFixed(2)), maxTip: Number(Number(summary?.maxTip || 0).toFixed(2)) },
            byType: byType.map(r => ({ orderType: r.orderType, totalTips: Number(Number(r.totalTips).toFixed(2)), count: Number(r.count) })),
            daily: daily.map(r => ({ day: r.day, totalTips: Number(Number(r.totalTips).toFixed(2)), count: Number(r.count) })),
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getServiceChargeReport = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
        const orderDateCondition = sql`(${orders.businessDate} is not null and ${orders.businessDate} >= ${startDate as string} and ${orders.businessDate} <= ${endDate as string}) or (${orders.businessDate} is null and ${orders.createdAt} >= ${start} and ${orders.createdAt} <= ${end})`;
        const conditions: any[] = [orderDateCondition, inArray(orders.status, deliveredStatuses), notDeleted, sql`${orders.serviceCharge} > 0`];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const [summary] = await db.select({
            totalServiceCharge: sql<number>`coalesce(sum(${orders.serviceCharge}), 0)`,
            orderCount: sql<number>`count(*)`,
            avgServiceCharge: sql<number>`coalesce(avg(${orders.serviceCharge}), 0)`,
        }).from(orders).where(and(...conditions));

        const day = orderBusinessDayExpression();
        const daily = await db.select({
            day,
            totalServiceCharge: sql<number>`coalesce(sum(${orders.serviceCharge}), 0)`,
            count: sql<number>`count(*)`,
        }).from(orders).where(and(...conditions))
            .groupBy(day)
            .orderBy(day);

        res.json({
            summary: { totalServiceCharge: Number(Number(summary?.totalServiceCharge || 0).toFixed(2)), orderCount: Number(summary?.orderCount || 0), avgServiceCharge: Number(Number(summary?.avgServiceCharge || 0).toFixed(2)) },
            daily: daily.map(r => ({ day: r.day, totalServiceCharge: Number(Number(r.totalServiceCharge).toFixed(2)), count: Number(r.count) })),
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getShiftSummary = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        // Include shifts that overlap the selected day: opened within the window
        // or still open (closingTime null) having opened before the window end.
        const conditions: any[] = [sql`(${shifts.openingTime} >= ${start} and ${shifts.openingTime} <= ${end}) or (${shifts.closingTime} is null and ${shifts.openingTime} <= ${end})`];
        if (branchId && branchId !== 'undefined') conditions.push(eq(shifts.branchId, branchId as string));

        const rows = await db.select({
            shiftId: shifts.id,
            branchId: shifts.branchId,
            userId: shifts.userId,
            openingTime: shifts.openingTime,
            closingTime: shifts.closingTime,
            openingBalance: shifts.openingBalance,
            expectedBalance: shifts.expectedBalance,
            actualBalance: shifts.actualBalance,
            status: shifts.status,
            notes: shifts.notes,
        }).from(shifts).where(and(...conditions)).orderBy(desc(shifts.openingTime));

        // For each shift, get order stats
        const result = [];
        const revenueEligible = revenueEligibleOrder();
        for (const shift of rows) {
            const shiftOrders = shift.shiftId ? await db.select({
                orderCount: sql<number>`count(*)`,
                revenue: sql<number>`coalesce(sum(case when ${revenueEligible} then ${orders.total} else 0 end), 0)`,
                cancelledCount: sql<number>`sum(case when ${orders.status} = 'CANCELLED' then 1 else 0 end)`,
            }).from(orders).where(eq(orders.shiftId, shift.shiftId)) : [{ orderCount: 0, revenue: 0, cancelledCount: 0 }];

            const so = shiftOrders[0] || { orderCount: 0, revenue: 0, cancelledCount: 0 };
            const [cashPayments] = await db.select({
                total: sql<number>`coalesce(sum(${payments.amount}), 0)`,
            }).from(payments)
                .innerJoin(orders, eq(payments.orderId, orders.id))
                .where(and(
                    eq(orders.shiftId, shift.shiftId),
                    eq(payments.status, 'COMPLETED'),
                    sql`upper(${payments.method}) in ('CASH', 'CASH_ON_DELIVERY')`,
                ));
            const cashSales = Number(cashPayments?.total || 0);
            const calculatedExpectedBalance = Number(shift.openingBalance || 0) + cashSales;
            // Open shifts may still have the DB default 0 in expected_balance.
            // Calculate their live cash from the payment ledger instead of
            // presenting a misleading zero on the dashboard.
            const expectedBalance = String(shift.status || '').toUpperCase() === 'OPEN'
                ? calculatedExpectedBalance
                : Number(shift.expectedBalance || calculatedExpectedBalance);
            const variance = Number(shift.actualBalance || 0) - expectedBalance;
            result.push({
                ...shift,
                orderCount: Number(so.orderCount || 0),
                revenue: Number(Number(so.revenue || 0).toFixed(2)),
                cancelledCount: Number(so.cancelledCount || 0),
                cashSales: Number(cashSales.toFixed(2)),
                variance: Number(variance.toFixed(2)),
                openingBalance: Number(shift.openingBalance || 0),
                expectedBalance: Number(expectedBalance.toFixed(2)),
                actualBalance: Number(shift.actualBalance || 0),
            });
        }

        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
