import { Request, Response } from 'express';
import { db } from '../db';
import { branches, orders, inventoryStock, warehouses, inventoryItems, userDailyPerformance, users } from '../../src/db/schema';
import { sql } from 'drizzle-orm';
import { and, eq, gte, inArray, desc, lte } from 'drizzle-orm';

export const getBranchPerformance = async (req: Request, res: Response) => {
    try {
        const user = req.user;
        const startDateRaw = req.query.startDate as string | undefined;
        const endDateRaw = req.query.endDate as string | undefined;
        const startDate = startDateRaw ? new Date(startDateRaw) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = endDateRaw ? new Date(endDateRaw) : new Date();
        endDate.setHours(23, 59, 59, 999);

        const branchFilterId = req.query.branchId as string | undefined;
        const roleScopedBranchId = user?.role === 'BRANCH_MANAGER' ? (user.branchId || undefined) : undefined;
        const effectiveBranchId = roleScopedBranchId || branchFilterId;

        const allBranches = effectiveBranchId
            ? await db.select().from(branches).where(eq(branches.id, effectiveBranchId))
            : await db.select().from(branches).where(eq(branches.isActive, true));

        const branchIds = allBranches.map(b => b.id);
        if (branchIds.length === 0) return res.json([]);

        const branchOrders = await db.select().from(orders).where(
            and(
                inArray(orders.branchId, branchIds),
                gte(orders.createdAt, startDate),
                lte(orders.createdAt, endDate),
            )
        );

        const branchWarehouses = await db.select().from(warehouses).where(inArray(warehouses.branchId, branchIds));
        const warehouseIds = branchWarehouses.map(w => w.id);
        const stocks = warehouseIds.length > 0
            ? await db.select().from(inventoryStock).where(inArray(inventoryStock.warehouseId, warehouseIds))
            : [];
        const itemIds = Array.from(new Set(stocks.map(s => s.itemId)));
        const items = itemIds.length > 0 ? await db.select().from(inventoryItems).where(inArray(inventoryItems.id, itemIds)) : [];
        const thresholdByItem = new Map(items.map(i => [i.id, Number(i.threshold || 0)]));
        const warehouseToBranch = new Map(branchWarehouses.map(w => [w.id, w.branchId]));

        const output = allBranches.map(branch => {
            const scopedOrders = branchOrders.filter(o => o.branchId === branch.id);
            const cancelled = scopedOrders.filter(o => String(o.status) === 'CANCELLED').length;
            const validSalesOrders = scopedOrders.filter(o => String(o.status) !== 'CANCELLED');
            const revenue = validSalesOrders.reduce((s, o) => s + Number(o.total || 0), 0);
            const ordersCount = validSalesOrders.length;
            const avgTicket = ordersCount > 0 ? revenue / ordersCount : 0;
            const activeOrders = validSalesOrders.filter(o => !['DELIVERED'].includes(String(o.status))).length;

            const lowStock = stocks.filter(s => {
                const bId = warehouseToBranch.get(s.warehouseId);
                if (bId !== branch.id) return false;
                const threshold = thresholdByItem.get(s.itemId) || 0;
                return Number(s.quantity || 0) <= threshold;
            }).length;

            return {
                branchId: branch.id,
                branchName: branch.name,
                location: branch.location || branch.address || '',
                revenue,
                ordersCount,
                avgTicket,
                cancelled,
                activeOrders,
                lowStock,
            };
        });

        res.json(output);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getLaborEfficiency = async (req: Request, res: Response) => {
    try {
        const branchId = req.query.branchId as string;
        // Native aggregation via raw SQL since it's an analytical query
        const query = sql`
           WITH sales AS (
              SELECT COALESCE(SUM(total), 0) as gross_sales
              FROM orders
              WHERE branch_id = ${branchId}
                AND status NOT IN ('CANCELLED')
           ),
           labor AS (
              SELECT COALESCE(SUM(net_salary), 0) as total_payroll
              FROM payslips
              WHERE branch_id = ${branchId}
           )
           SELECT 
              sales.gross_sales, 
              labor.total_payroll, 
              CASE WHEN sales.gross_sales > 0 THEN (labor.total_payroll / sales.gross_sales) * 100 ELSE 0 END as labor_cost_percent
           FROM sales, labor
        `;
        const result = await db.execute(query);
        res.json(result.rows[0] || { gross_sales: 0, total_payroll: 0, labor_cost_percent: 0 });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

export const getUserLeaderboard = async (req: Request, res: Response) => {
    try {
        const branchId = req.query.branchId as string | undefined;
        const limit = parseInt(req.query.limit as string) || 5;

        // Aggregate points and sales per user for the leaderboard
        const leaderboard = await db.select({
            userId: userDailyPerformance.userId,
            userName: users.name,
            totalPoints: sql<number>`SUM(${userDailyPerformance.totalPoints})`,
            totalSales: sql<number>`SUM(${userDailyPerformance.totalSales})`,
            orderCount: sql<number>`SUM(${userDailyPerformance.orderCount})`,
            avgSpeed: sql<number>`AVG(${userDailyPerformance.avgProcessingTime})`,
        })
        .from(userDailyPerformance)
        .innerJoin(users, eq(userDailyPerformance.userId, users.id))
        .where(branchId ? eq(userDailyPerformance.branchId, branchId) : undefined)
        .groupBy(userDailyPerformance.userId, users.name)
        .orderBy(desc(sql`SUM(${userDailyPerformance.totalPoints})`))
        .offset(0).fetch(limit);

        res.json(leaderboard);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
