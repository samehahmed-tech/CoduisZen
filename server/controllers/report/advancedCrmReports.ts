import { Request, Response } from 'express';
import { eq, and, sql, gte, lte, inArray, desc } from 'drizzle-orm';
import { db } from '../../db';
import { orders, customers, campaigns } from '../../../src/db/schema';
import { parseLocalDateRange } from './reportUtils';

export const getCustomerRetention = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, deliveredStatuses), sql`${orders.customerId} is not null`];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        // One query (no N+1): per-customer orders in-period vs pre-period.
        // Branch scope applies to BOTH sides so a branch report never counts
        // another branch's history as "returning".
        const branchConds: any[] = [inArray(orders.status, deliveredStatuses), sql`${orders.customerId} is not null`];
        if (branchId && branchId !== 'undefined') branchConds.push(eq(orders.branchId, branchId as string));
        const cohorts = await db.select({
            customerId: orders.customerId,
            periodOrders: sql<number>`sum(case when ${orders.createdAt} >= ${start} then 1 else 0 end)`,
            prevOrders: sql<number>`sum(case when ${orders.createdAt} < ${start} then 1 else 0 end)`,
        }).from(orders)
            .where(and(...branchConds, sql`${orders.createdAt} < ${end}`))
            .groupBy(orders.customerId);

        const periodCustomers = cohorts.filter((c) => Number(c.periodOrders) > 0);
        const returningIds = new Set(
            periodCustomers.filter((c) => Number(c.prevOrders) > 0).map((c) => c.customerId),
        );

        const total = periodCustomers.length;
        const returning = returningIds.size;
        const newCustomers = total - returning;

        res.json({
            totalCustomers: total,
            returningCustomers: returning,
            newCustomers,
            retentionRate: total > 0 ? Number(((returning / total) * 100).toFixed(1)) : 0,
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getNewVsReturning = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, deliveredStatuses), sql`${orders.customerId} is not null`];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        // All orders in range with customer
        const ordersInRange = await db.select({
            customerId: orders.customerId,
            total: orders.total,
        }).from(orders).where(and(...conditions));

        // First-ever order per customer — branch-scoped when a branch filter
        // is active, otherwise branch-new customers misclassify as returning.
        const firstConds: any[] = [inArray(orders.status, deliveredStatuses), sql`${orders.customerId} is not null`];
        if (branchId && branchId !== 'undefined') firstConds.push(eq(orders.branchId, branchId as string));
        const customerFirstOrder = await db.select({
            customerId: orders.customerId,
            firstOrder: sql<string>`min(${orders.createdAt})`,
        }).from(orders).where(and(...firstConds)).groupBy(orders.customerId);

        const firstOrderMap = new Map(customerFirstOrder.map(c => [c.customerId, new Date(c.firstOrder)]));
        let newRevenue = 0, newOrders = 0, returnRevenue = 0, returnOrders = 0;

        for (const o of ordersInRange) {
            const firstDate = firstOrderMap.get(o.customerId!);
            if (firstDate && firstDate >= start) {
                newRevenue += Number(o.total);
                newOrders++;
            } else {
                returnRevenue += Number(o.total);
                returnOrders++;
            }
        }

        res.json({
            new: { orders: newOrders, revenue: Number(newRevenue.toFixed(2)) },
            returning: { orders: returnOrders, revenue: Number(returnRevenue.toFixed(2)) },
            totalOrders: newOrders + returnOrders,
            totalRevenue: Number((newRevenue + returnRevenue).toFixed(2)),
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getCustomerFrequency = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
        const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, deliveredStatuses), sql`${orders.customerId} is not null`];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        // Distribution runs over ALL customers (no limit) — the old
        // limit(100)-by-volume query counted only the 100 heaviest buyers, so
        // once/twice were always ~0. Top-20 list is a separate capped query.
        const perCustomer = db.select({
            cnt: sql<number>`count(*)`.as('cnt'),
        }).from(orders).where(and(...conditions))
            .groupBy(orders.customerId).as('per_customer');
        const freqRows = await db.select({
            orderCount: sql<number>`"per_customer"."cnt"`,
            customers: sql<number>`count(*)`,
        }).from(perCustomer).groupBy(sql`"per_customer"."cnt"`);

        const distribution = { once: 0, twice: 0, thrice: 0, frequent: 0, veryFrequent: 0 };
        let totalCustomers = 0;
        for (const f of freqRows as any[]) {
            const bucket = Number((f as any).orderCount);
            const n = Number((f as any).customers);
            totalCustomers += n;
            if (bucket === 1) distribution.once += n;
            else if (bucket === 2) distribution.twice += n;
            else if (bucket === 3) distribution.thrice += n;
            else if (bucket <= 10) distribution.frequent += n;
            else distribution.veryFrequent += n;
        }

        const topCustomers = await db.select({
            customerId: orders.customerId,
            customerName: orders.customerName,
            orderCount: sql<number>`count(*)`,
            totalSpent: sql<number>`coalesce(sum(${orders.total}), 0)`,
        }).from(orders).where(and(...conditions))
            .groupBy(orders.customerId, orders.customerName)
            .orderBy(sql`count(*) desc`)
            .limit(20);

        res.json({
            distribution,
            totalCustomers,
            topCustomers: topCustomers.map(c => ({
                customerId: c.customerId,
                customerName: c.customerName || 'Unknown',
                orderCount: Number(c.orderCount),
                totalSpent: Number(Number(c.totalSpent).toFixed(2)),
            })),
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getCustomerChurn = async (req: Request, res: Response) => {
    try {
        const { branchId } = req.query;
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
        const conditions: any[] = [inArray(orders.status, deliveredStatuses), sql`${orders.customerId} is not null`, sql`${orders.deletedAt} is null`];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const customerLastOrder = await db.select({
            customerId: orders.customerId,
            customerName: orders.customerName,
            lastOrder: sql<string>`max(${orders.createdAt})`,
            orderCount: sql<number>`count(*)`,
            totalSpent: sql<number>`coalesce(sum(${orders.total}), 0)`,
        }).from(orders).where(and(...conditions)).groupBy(orders.customerId, orders.customerName);

        const now = new Date();
        const daysSince = (c: any) => (now.getTime() - new Date(c.lastOrder).getTime()) / 86400000;
        // One-time buyers are not "churned" — they never came back to lose.
        const oneTime = customerLastOrder.filter(c => Number(c.orderCount) <= 1);
        const repeaters = customerLastOrder.filter(c => Number(c.orderCount) > 1);
        const churn30 = repeaters.filter(c => daysSince(c) > 30 && daysSince(c) <= 60);
        const churn60 = repeaters.filter(c => daysSince(c) > 60 && daysSince(c) <= 90);
        const churn90 = repeaters.filter(c => daysSince(c) > 90);
        const active = repeaters.filter(c => daysSince(c) <= 30);

        res.json({
            summary: { total: customerLastOrder.length, active: active.length, oneTimeBuyers: oneTime.length, atRisk30: churn30.length, atRisk60: churn60.length, churned90: churn90.length },
            atRisk: [...churn30, ...churn60, ...churn90].slice(0, 50).map(c => ({
                customerId: c.customerId, customerName: c.customerName || 'Unknown', lastOrder: c.lastOrder,
                daysSinceLastOrder: Math.floor(daysSince(c)),
                orderCount: Number(c.orderCount), totalSpent: Number(Number(c.totalSpent).toFixed(2)),
            })),
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getLoyaltyPointsReport = async (_req: Request, res: Response) => {
    try {
        const tiers = await db.select({
            tier: customers.loyaltyTier,
            count: sql<number>`count(*)`,
            totalPoints: sql<number>`coalesce(sum(${customers.loyaltyPoints}), 0)`,
            avgPoints: sql<number>`coalesce(avg(${customers.loyaltyPoints}), 0)`,
            totalSpent: sql<number>`coalesce(sum(${customers.totalSpent}), 0)`,
        }).from(customers).groupBy(customers.loyaltyTier).orderBy(sql`sum(${customers.totalSpent}) desc`);

        const [totals] = await db.select({
            totalCustomers: sql<number>`count(*)`,
            totalPoints: sql<number>`coalesce(sum(${customers.loyaltyPoints}), 0)`,
            totalSpent: sql<number>`coalesce(sum(${customers.totalSpent}), 0)`,
        }).from(customers);

        const topPointHolders = await db.select({
            id: customers.id,
            name: customers.name,
            loyaltyTier: customers.loyaltyTier,
            loyaltyPoints: customers.loyaltyPoints,
            totalSpent: customers.totalSpent,
            visits: customers.visits,
        }).from(customers).orderBy(desc(customers.loyaltyPoints)).limit(20);

        res.json({
            summary: { totalCustomers: Number(totals?.totalCustomers || 0), totalPoints: Number(Number(totals?.totalPoints || 0).toFixed(0)), totalSpent: Number(Number(totals?.totalSpent || 0).toFixed(2)) },
            // Denormalized counters (kept in sync by the order flow); NULL
            // tier customers are genuinely untiered, not a missing bucket.
            counterBasis: 'STORED_COUNTERS',
            tiers: tiers.map(r => ({ tier: r.tier || 'Untiered', count: Number(r.count), totalPoints: Number(Number(r.totalPoints).toFixed(0)), avgPoints: Number(Number(r.avgPoints).toFixed(0)), totalSpent: Number(Number(r.totalSpent).toFixed(2)) })),
            topPointHolders,
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getPromotionImpact = async (req: Request, res: Response) => {
    try {
        const { campaignId } = req.query;
        const allCampaigns = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt)).limit(20);

        if (campaignId) {
            const camp = allCampaigns.find(c => c.id === campaignId);
            if (!camp) return res.status(404).json({ error: 'Campaign not found' });
            const roi = Number(camp.budget) > 0 ? Number((((Number(camp.revenue) - Number(camp.budget)) / Number(camp.budget)) * 100).toFixed(1)) : 0;
            return res.json({ ...camp, roi });
        }

        res.json(allCampaigns.map(c => ({
            id: c.id, name: c.name, type: c.type, status: c.status,
            reach: Number(c.reach), conversions: Number(c.conversions),
            revenue: Number(Number(c.revenue).toFixed(2)), budget: Number(Number(c.budget).toFixed(2)),
            roi: Number(c.budget) > 0 ? Number((((Number(c.revenue) - Number(c.budget)) / Number(c.budget)) * 100).toFixed(1)) : 0,
            conversionRate: Number(c.reach) > 0 ? Number(((Number(c.conversions) / Number(c.reach)) * 100).toFixed(1)) : 0,
            createdAt: c.createdAt,
        })));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
