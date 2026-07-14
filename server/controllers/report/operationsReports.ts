import { Request, Response } from 'express';
import { eq, and, sql, gte, lte, inArray, desc } from 'drizzle-orm';
import { db } from '../../db';
import { orders, branches, drivers } from '../../../src/db/schema';
import { parseLocalDateRange } from './reportUtils';

export const getBranchPerformance = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);

        const rows = await db.select({
            branchId: orders.branchId,
            branchName: branches.name,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            avgTicket: sql<number>`coalesce(avg(${orders.total}), 0)`,
            cancelledCount: sql<number>`sum(case when ${orders.status} = 'CANCELLED' then 1 else 0 end)`,
        })
            .from(orders)
            .innerJoin(branches, eq(orders.branchId, branches.id))
            .where(and(
                gte(orders.createdAt, start),
                lte(orders.createdAt, end),
            ))
            .groupBy(orders.branchId, branches.name)
            .orderBy(sql`sum(${orders.total}) desc`);

        res.json(rows.map(r => ({
            ...r,
            orderCount: Number(r.orderCount),
            revenue: Number(Number(r.revenue).toFixed(2)),
            avgTicket: Number(Number(r.avgTicket).toFixed(2)),
            cancelledCount: Number(r.cancelledCount),
        })));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getOrderPrepTime = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];

        const conditions: any[] = [
            gte(orders.createdAt, start),
            lte(orders.createdAt, end),
            inArray(orders.status, deliveredStatuses),
            sql`${orders.completedAt} is not null`,
        ];
        if (branchId) conditions.push(eq(orders.branchId, branchId as string));

        const rows = await db.select({
            branchName: branches.name,
            orderType: orders.type,
            avgPrepMinutes: sql<number>`coalesce(avg(datediff(second, ${orders.createdAt}, ${orders.completedAt}) / 60.0), 0)`,
            minPrepMinutes: sql<number>`coalesce(min(datediff(second, ${orders.createdAt}, ${orders.completedAt}) / 60.0), 0)`,
            maxPrepMinutes: sql<number>`coalesce(max(datediff(second, ${orders.createdAt}, ${orders.completedAt}) / 60.0), 0)`,
            orderCount: sql<number>`count(*)`,
        })
            .from(orders)
            .innerJoin(branches, eq(orders.branchId, branches.id))
            .where(and(...conditions))
            .groupBy(branches.name, orders.type)
            .orderBy(branches.name);

        res.json(rows.map(r => ({
            ...r,
            avgPrepMinutes: Number(Number(r.avgPrepMinutes).toFixed(1)),
            minPrepMinutes: Number(Number(r.minPrepMinutes).toFixed(1)),
            maxPrepMinutes: Number(Number(r.maxPrepMinutes).toFixed(1)),
            orderCount: Number(r.orderCount),
        })));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
