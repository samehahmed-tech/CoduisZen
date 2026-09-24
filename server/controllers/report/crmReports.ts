import { Request, Response } from 'express';
import { eq, and, sql, gte, lte, inArray, desc } from 'drizzle-orm';
import { db } from '../../db';
import { orders, customers, campaigns } from '../../../src/db/schema';
import { parseLocalDateRange } from './reportUtils';

export const getCustomerLTV = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId, limit, offset } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
        // NOTE: period-bounded top spenders, not true lifetime value (orders
        // outside the window are not counted). Paginated — the old fixed
        // top-100 silently dropped everyone else.
        const pageLimit = Math.min(Math.max(Number(limit) || 100, 1), 1000);
        const pageOffset = Math.max(Number(offset) || 0, 0);

        const conditions: any[] = [
            gte(orders.createdAt, start),
            lte(orders.createdAt, end),
            inArray(orders.status, deliveredStatuses),
            sql`${orders.customerId} is not null`,
        ];
        if (branchId) conditions.push(eq(orders.branchId, branchId as string));

        const [total] = await db.select({ count: sql<number>`count(distinct ${orders.customerId})` })
            .from(orders).where(and(...conditions));

        const rows = await db.select({
            customerId: orders.customerId,
            customerName: customers.name,
            phone: customers.phone,
            totalSpent: sql<number>`coalesce(sum(${orders.total}), 0)`,
            orderCount: sql<number>`count(*)`,
            avgTicket: sql<number>`coalesce(avg(${orders.total}), 0)`,
            firstOrder: sql<string>`min(${orders.createdAt})`,
            lastOrder: sql<string>`max(${orders.createdAt})`,
        })
            .from(orders)
            .innerJoin(customers, eq(orders.customerId, customers.id))
            .where(and(...conditions))
            .groupBy(orders.customerId, customers.name, customers.phone)
            .orderBy(sql`sum(${orders.total}) desc`)
            .limit(pageLimit)
            .offset(pageOffset);

        res.json({
            spendBasis: 'PERIOD_TOP_SPENDERS',
            totalCustomers: Number(total?.count || 0),
            customers: rows.map(r => ({
                ...r,
                totalSpent: Number(Number(r.totalSpent).toFixed(2)),
                orderCount: Number(r.orderCount),
                avgTicket: Number(Number(r.avgTicket).toFixed(2)),
            })),
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getCampaignROI = async (_req: Request, res: Response) => {
    try {
        const rows = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt)).limit(50);

        res.json(rows.map(r => ({
            id: r.id,
            name: r.name,
            type: r.type,
            status: r.status,
            reach: r.reach || 0,
            conversions: r.conversions || 0,
            // Stored estimate, NOT attributed order revenue (no order-level
            // campaign attribution exists) — treat ROI as directional.
            revenue: Number(r.revenue || 0),
            revenueBasis: 'STORED_ESTIMATE_UNATTRIBUTED',
            budget: Number(r.budget || 0),
            roi: Number(r.budget || 0) > 0 ? Number(((Number(r.revenue || 0) - Number(r.budget || 0)) / Number(r.budget || 0) * 100).toFixed(1)) : 0,
            conversionRate: Number(r.reach || 0) > 0 ? Number((Number(r.conversions || 0) / Number(r.reach || 0) * 100).toFixed(1)) : 0,
            createdAt: r.createdAt,
        })));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
