import { Request, Response } from 'express';
import { eq, and, sql, gte, lte, inArray, desc } from 'drizzle-orm';
import { db } from '../../db';
import { orders, shifts } from '../../../src/db/schema';
import { parseLocalDateRange } from './reportUtils';

export const getTipsReport = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, deliveredStatuses), sql`${orders.tipAmount} > 0`];
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

        const daily = await db.select({
            day: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM-DD')`,
            totalTips: sql<number>`coalesce(sum(${orders.tipAmount}), 0)`,
            count: sql<number>`count(*)`,
        }).from(orders).where(and(...conditions))
            .groupBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`)
            .orderBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`);

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
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, deliveredStatuses), sql`${orders.serviceCharge} > 0`];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const [summary] = await db.select({
            totalServiceCharge: sql<number>`coalesce(sum(${orders.serviceCharge}), 0)`,
            orderCount: sql<number>`count(*)`,
            avgServiceCharge: sql<number>`coalesce(avg(${orders.serviceCharge}), 0)`,
        }).from(orders).where(and(...conditions));

        const daily = await db.select({
            day: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM-DD')`,
            totalServiceCharge: sql<number>`coalesce(sum(${orders.serviceCharge}), 0)`,
            count: sql<number>`count(*)`,
        }).from(orders).where(and(...conditions))
            .groupBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`)
            .orderBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`);

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
        const conditions: any[] = [gte(shifts.openingTime, start), lte(shifts.openingTime, end)];
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
        for (const shift of rows) {
            const shiftOrders = shift.shiftId ? await db.select({
                orderCount: sql<number>`count(*)`,
                revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
                cancelledCount: sql<number>`count(*) filter (where ${orders.status} = 'CANCELLED')`,
            }).from(orders).where(eq(orders.shiftId, shift.shiftId)) : [{ orderCount: 0, revenue: 0, cancelledCount: 0 }];

            const so = shiftOrders[0] || { orderCount: 0, revenue: 0, cancelledCount: 0 };
            const variance = Number(shift.actualBalance || 0) - Number(shift.expectedBalance || 0);
            result.push({
                ...shift,
                orderCount: Number(so.orderCount || 0),
                revenue: Number(Number(so.revenue || 0).toFixed(2)),
                cancelledCount: Number(so.cancelledCount || 0),
                variance: Number(variance.toFixed(2)),
                openingBalance: Number(shift.openingBalance || 0),
                expectedBalance: Number(shift.expectedBalance || 0),
                actualBalance: Number(shift.actualBalance || 0),
            });
        }

        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
