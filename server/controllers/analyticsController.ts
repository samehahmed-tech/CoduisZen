import { Request, Response } from 'express';
import { db } from '../db';
import { branches, orders, inventoryStock, warehouses, inventoryItems, userDailyPerformance, users, auditLogs, refundRecords, dayCloseReports } from '../../src/db/schema';
import { sql } from 'drizzle-orm';
import { and, eq, gte, inArray, desc, lte } from 'drizzle-orm';
import { detectLatestAnomaly, DetectedAnomaly } from '../utils/anomalyDetection';
import { METRIC_CATALOG } from '../services/metricCatalog';
import { resolveBusinessDateRange } from '../utils/businessDateRange';
import { analyticsService } from '../services/analyticsService';
import { resolveConsolidatedReportScope } from '../utils/consolidatedReportScope';

export const getMetricCatalog = async (_req: Request, res: Response) => {
    return res.json({ version: '2026-10-27', metrics: METRIC_CATALOG });
};

export const getAnalyticsReconciliation = async (req: Request, res: Response) => {
    try {
        const branchId = req.effectiveBranchId || (req.query.branchId ? String(req.query.branchId).trim() : '');
        if (!branchId) return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
        const range = resolveBusinessDateRange(req.query.businessDateFrom, req.query.businessDateTo);
        return res.json(await analyticsService.reconcileBranchSnapshots(branchId, range.from, range.to));
    } catch (error: any) {
        return res.status(500).json({ error: 'ANALYTICS_RECONCILIATION_FAILED', detail: error?.message });
    }
};

export const getBranchPerformance = async (req: Request, res: Response) => {
    try {
        const dateRange = resolveBusinessDateRange(req.query.businessDateFrom, req.query.businessDateTo);
        const startDate = new Date(`${dateRange.from}T00:00:00.000Z`);
        const endDate = new Date(`${dateRange.to}T23:59:59.999Z`);
        endDate.setHours(23, 59, 59, 999);

        const effectiveBranchId = req.effectiveBranchId;

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
                gte(orders.businessDate, dateRange.from),
                lte(orders.businessDate, dateRange.to),
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

/** Head-office report with an explicit branch scope and source/provenance contract. */
export const getConsolidatedPerformance = async (req: Request, res: Response) => {
    try {
        const scope = resolveConsolidatedReportScope({
            role: req.user?.role,
            requestedBranchId: req.query.branchId,
            assignedBranchId: req.user?.branchId,
            allowedBranches: req.user?.allowedBranches,
        });
        if ('reason' in scope) return res.status(403).json({ error: scope.reason });

        const dateRange = resolveBusinessDateRange(req.query.businessDateFrom, req.query.businessDateTo);
        const branchRows = await db.select({ id: branches.id, name: branches.name, nameAr: branches.nameAr })
            .from(branches)
            .where(and(
                eq(branches.isActive, true),
                scope.global ? undefined : eq(branches.id, scope.branchId!),
            ));
        const branchIds = branchRows.map((branch) => branch.id);
        if (!branchIds.length) {
            return res.json({ period: dateRange, scope: { global: scope.global, branchIds: [] }, totals: { orders: 0, revenue: 0, cancelled: 0 }, branches: [] });
        }

        const orderRows = await db.select({ branchId: orders.branchId, status: orders.status, total: orders.total })
            .from(orders)
            .where(and(
                inArray(orders.branchId, branchIds),
                gte(orders.businessDate, dateRange.from),
                lte(orders.businessDate, dateRange.to),
            ));
        const rows = branchRows.map((branch) => {
            const branchOrders = orderRows.filter((order) => order.branchId === branch.id);
            const cancelled = branchOrders.filter((order) => String(order.status || '').toUpperCase() === 'CANCELLED').length;
            const valid = branchOrders.filter((order) => String(order.status || '').toUpperCase() !== 'CANCELLED');
            const revenue = valid.reduce((sum, order) => sum + Number(order.total || 0), 0);
            return { branchId: branch.id, branchName: branch.name, branchNameAr: branch.nameAr, orders: valid.length, revenue, cancelled };
        });
        return res.json({
            period: dateRange,
            scope: { global: scope.global, branchIds },
            source: { entity: 'orders', dateField: 'businessDate', revenueField: 'total', cancelledExcluded: true },
            totals: rows.reduce((total, row) => ({ orders: total.orders + row.orders, revenue: total.revenue + row.revenue, cancelled: total.cancelled + row.cancelled }), { orders: 0, revenue: 0, cancelled: 0 }),
            branches: rows,
        });
    } catch (error: any) {
        return res.status(500).json({ error: 'CONSOLIDATED_ANALYTICS_FAILED', detail: error?.message });
    }
};

const classifyOrderChannel = (order: any): string => {
    const deliverySource = String(order.deliverySource || '').trim().toUpperCase();
    const source = String(order.source || '').trim().toLowerCase();
    if (deliverySource && deliverySource !== 'RESTAURANT') return `AGGREGATOR:${deliverySource}`;
    if (source === 'online' || source === 'app') return 'ONLINE';
    if (source === 'call_center' || order.isCallCenterOrder === true || order.isCallCenterOrder === 1) return 'CALL_CENTER';
    const type = String(order.type || '').trim().toUpperCase();
    if (type === 'DINE_IN') return 'DINE_IN';
    if (type === 'TAKEAWAY' || type === 'PICKUP') return 'TAKEAWAY';
    return 'POS';
};

/** Compare revenue and volume by order channel using the same business-date and branch scope as BI. */
export const getChannelPerformance = async (req: Request, res: Response) => {
    try {
        const dateRange = resolveBusinessDateRange(req.query.businessDateFrom, req.query.businessDateTo);
        const branchId = req.effectiveBranchId || (req.query.branchId ? String(req.query.branchId).trim() : undefined);
        const rows = await db.select({
            branchId: orders.branchId,
            type: orders.type,
            source: orders.source,
            isCallCenterOrder: orders.isCallCenterOrder,
            deliverySource: orders.deliverySource,
            status: orders.status,
            total: orders.total,
        }).from(orders).where(and(
            branchId ? eq(orders.branchId, branchId) : undefined,
            gte(orders.businessDate, dateRange.from),
            lte(orders.businessDate, dateRange.to),
        ));

        const grouped = new Map<string, { channel: string; orders: number; revenue: number; cancelled: number }>();
        for (const order of rows) {
            const channel = classifyOrderChannel(order);
            const current = grouped.get(channel) || { channel, orders: 0, revenue: 0, cancelled: 0 };
            if (String(order.status || '').toUpperCase() === 'CANCELLED') {
                current.cancelled += 1;
            } else {
                current.orders += 1;
                current.revenue += Number(order.total || 0);
            }
            grouped.set(channel, current);
        }

        const channels = Array.from(grouped.values())
            .sort((a, b) => b.revenue - a.revenue)
            .map(item => ({ ...item, avgTicket: item.orders > 0 ? Number((item.revenue / item.orders).toFixed(2)) : 0 }));
        return res.json({
            branchId: branchId || null,
            period: dateRange,
            channels,
            totals: {
                orders: channels.reduce((sum, item) => sum + item.orders, 0),
                revenue: channels.reduce((sum, item) => sum + item.revenue, 0),
                cancelled: channels.reduce((sum, item) => sum + item.cancelled, 0),
            },
        });
    } catch (error: any) {
        return res.status(500).json({ error: 'CHANNEL_ANALYTICS_FAILED', detail: error?.message });
    }
};

export const getLaborEfficiency = async (req: Request, res: Response) => {
    try {
        const branchId = req.effectiveBranchId || (req.query.branchId as string | undefined);
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
        const laborRow = Array.isArray(result)
            ? result[0]
            : ((result as any)?.recordset?.[0] ?? (result as any)?.rows?.[0]);
        res.json(laborRow || { gross_sales: 0, total_payroll: 0, labor_cost_percent: 0 });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

export const getUserLeaderboard = async (req: Request, res: Response) => {
    try {
        const branchId = req.effectiveBranchId || (req.query.branchId as string | undefined);
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

export const getOperationalAnomalies = async (req: Request, res: Response) => {
    try {
        const branchId = req.effectiveBranchId || (req.query.branchId as string | undefined);
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        const dayExpr = (column: any) => sql<string>`CAST(${column} AS DATE)`;
        const branchFilter = branchId ? eq(orders.branchId, branchId) : undefined;

        const [discountRows, voidRows, refundRows, cashRows] = await Promise.all([
            db.select({ date: dayExpr(orders.createdAt), value: sql<number>`COALESCE(SUM(${orders.discount}), 0)` })
                .from(orders).where(and(gte(orders.createdAt, startDate), lte(orders.createdAt, endDate), branchFilter)).groupBy(dayExpr(orders.createdAt)),
            db.select({ date: dayExpr(auditLogs.createdAt), value: sql<number>`COUNT(*)` })
                .from(auditLogs).where(and(gte(auditLogs.createdAt, startDate), lte(auditLogs.createdAt, endDate), branchId ? eq(auditLogs.branchId, branchId) : undefined, sql`${auditLogs.eventType} LIKE '%VOID%'`)).groupBy(dayExpr(auditLogs.createdAt)),
            db.select({ date: dayExpr(refundRecords.createdAt), value: sql<number>`COALESCE(SUM(${refundRecords.amount}), 0)` })
                .from(refundRecords).where(and(gte(refundRecords.createdAt, startDate), lte(refundRecords.createdAt, endDate), branchId ? eq(refundRecords.branchId, branchId) : undefined, eq(refundRecords.status, 'PROCESSED'))).groupBy(dayExpr(refundRecords.createdAt)),
            db.select({ date: dayExpr(dayCloseReports.createdAt), value: sql<number>`COALESCE(SUM(ABS(${dayCloseReports.variance})), 0)` })
                .from(dayCloseReports).where(and(gte(dayCloseReports.createdAt, startDate), lte(dayCloseReports.createdAt, endDate), branchId ? eq(dayCloseReports.branchId, branchId) : undefined)).groupBy(dayExpr(dayCloseReports.createdAt)),
        ]);

        const build = (key: string, label: string, rows: Array<{ date: string; value: unknown }>, source: string): DetectedAnomaly | null => {
            const normalized = rows.map(row => ({ date: String(row.date), value: Number(row.value || 0) })).sort((a, b) => a.date.localeCompare(b.date));
            const latest = normalized.at(-1);
            if (!latest) return null;
            return detectLatestAnomaly({ key, label, date: latest.date, value: latest.value, baseline: normalized.slice(0, -1).map(row => row.value), source });
        };

        const anomalies = [
            build('DISCOUNT_SPIKE', 'Discounts', discountRows, 'orders.discount'),
            build('VOID_SPIKE', 'Voids', voidRows, 'audit_logs.event_type'),
            build('REFUND_SPIKE', 'Processed refunds', refundRows, 'refund_records.amount'),
            build('CASH_VARIANCE_SPIKE', 'Cash variance', cashRows, 'day_close_reports.variance'),
        ].filter((item): item is DetectedAnomaly => Boolean(item));

        return res.json({ branchId: branchId || null, period: { from: startDate.toISOString(), to: endDate.toISOString() }, anomalies });
    } catch (error: any) {
        return res.status(500).json({ error: 'ANOMALY_ANALYSIS_FAILED', detail: error?.message });
    }
};
