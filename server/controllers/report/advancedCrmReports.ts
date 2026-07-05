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

        // Customers in this period
        const periodCustomers = await db.select({
            customerId: orders.customerId,
            orderCount: sql<number>`count(*)`,
            firstOrder: sql<string>`min(${orders.createdAt})`,
        }).from(orders).where(and(...conditions)).groupBy(orders.customerId);

        // Customers who also ordered BEFORE this period
        const returningIds = new Set<string>();
        for (const c of periodCustomers) {
            if (!c.customerId) continue;
            const [prev] = await db.select({ cnt: sql<number>`count(*)` }).from(orders)
                .where(and(eq(orders.customerId, c.customerId), sql`${orders.createdAt} < ${start}`, inArray(orders.status, deliveredStatuses)));
            if (Number(prev?.cnt || 0) > 0) returningIds.add(c.customerId);
        }

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

        // Get first-ever order for each customer
        const customerFirstOrder = await db.select({
            customerId: orders.customerId,
            firstOrder: sql<string>`min(${orders.createdAt})`,
        }).from(orders).where(and(inArray(orders.status, deliveredStatuses), sql`${orders.customerId} is not null`)).groupBy(orders.customerId);

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

        const customerOrders = await db.select({
            customerId: orders.customerId,
            customerName: orders.customerName,
            orderCount: sql<number>`count(*)`,
            totalSpent: sql<number>`coalesce(sum(${orders.total}), 0)`,
        }).from(orders).where(and(...conditions))
            .groupBy(orders.customerId, orders.customerName)
            .orderBy(sql`count(*) desc`)
            .limit(100);

        const distribution = { once: 0, twice: 0, thrice: 0, frequent: 0, veryFrequent: 0 };
        for (const c of customerOrders) {
            const cnt = Number(c.orderCount);
            if (cnt === 1) distribution.once++;
            else if (cnt === 2) distribution.twice++;
            else if (cnt === 3) distribution.thrice++;
            else if (cnt <= 10) distribution.frequent++;
            else distribution.veryFrequent++;
        }

        res.json({
            distribution,
            topCustomers: customerOrders.slice(0, 20).map(c => ({
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
        const conditions: any[] = [inArray(orders.status, deliveredStatuses), sql`${orders.customerId} is not null`];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const customerLastOrder = await db.select({
            customerId: orders.customerId,
            customerName: orders.customerName,
            lastOrder: sql<string>`max(${orders.createdAt})`,
            orderCount: sql<number>`count(*)`,
            totalSpent: sql<number>`coalesce(sum(${orders.total}), 0)`,
        }).from(orders).where(and(...conditions)).groupBy(orders.customerId, orders.customerName);

        const now = new Date();
        const churn30 = customerLastOrder.filter(c => (now.getTime() - new Date(c.lastOrder).getTime()) > 30 * 86400000 && (now.getTime() - new Date(c.lastOrder).getTime()) <= 60 * 86400000);
        const churn60 = customerLastOrder.filter(c => (now.getTime() - new Date(c.lastOrder).getTime()) > 60 * 86400000 && (now.getTime() - new Date(c.lastOrder).getTime()) <= 90 * 86400000);
        const churn90 = customerLastOrder.filter(c => (now.getTime() - new Date(c.lastOrder).getTime()) > 90 * 86400000);
        const active = customerLastOrder.filter(c => (now.getTime() - new Date(c.lastOrder).getTime()) <= 30 * 86400000);

        res.json({
            summary: { total: customerLastOrder.length, active: active.length, atRisk30: churn30.length, atRisk60: churn60.length, churned90: churn90.length },
            atRisk: [...churn30, ...churn60, ...churn90].slice(0, 50).map(c => ({
                customerId: c.customerId, customerName: c.customerName || 'Unknown', lastOrder: c.lastOrder,
                daysSinceLastOrder: Math.floor((now.getTime() - new Date(c.lastOrder).getTime()) / 86400000),
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
            summary: { totalCustomers: Number(totals?.totalCustomers || 0), totalPoints: Number(totals?.totalPoints || 0), totalSpent: Number(Number(totals?.totalSpent || 0).toFixed(2)) },
            tiers: tiers.map(r => ({ tier: r.tier, count: Number(r.count), totalPoints: Number(r.totalPoints), avgPoints: Number(Number(r.avgPoints).toFixed(0)), totalSpent: Number(Number(r.totalSpent).toFixed(2)) })),
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
