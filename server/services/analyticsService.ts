/**
 * Analytics/BI Service — Centralized Intelligence Layer
 * Implements: Phase 2.6 (BI Aggregation) and 2.7 (Customer Segmentation/RFM)
 * 
 * Provides pre-computed snapshots for high-performance dashboards and AI insights.
 */

import { db, pool } from '../db';
import { randomUUID } from 'node:crypto';
import {
    orders,
    orderItems,
    orderStatusHistory,
    customerRfmMetrics,
    customers,
    dailyBranchSummaries,
    itemDailySnapshots,
    menuItems,
    userDailyPerformance,
    users
} from '../../src/db/schema';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';
import logger from '../utils/logger';
import { reconcileDailyBranchSnapshots, type ReconciliationDay } from '../utils/analyticsReconciliation';

const log = logger.child({ service: 'analytics' });

let analyticsSchemaReady = false;
let userPerformanceIdRequiresValue = false;
let userPerformanceHasBusinessDate = false;

const ensureAnalyticsSchema = async () => {
    if (analyticsSchemaReady) return;

    await pool.query(`
        IF OBJECT_ID('daily_branch_summaries', 'U') IS NOT NULL
           AND COL_LENGTH('daily_branch_summaries', 'business_date') IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM daily_branch_summaries)
            DROP TABLE daily_branch_summaries;

        IF OBJECT_ID('item_daily_snapshots', 'U') IS NOT NULL
           AND COL_LENGTH('item_daily_snapshots', 'business_date') IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM item_daily_snapshots)
            DROP TABLE item_daily_snapshots;

        IF OBJECT_ID('daily_branch_summaries', 'U') IS NULL
        CREATE TABLE daily_branch_summaries (
            id int IDENTITY(1,1) NOT NULL,
            branch_id nvarchar(255) NOT NULL,
            [date] date NOT NULL,
            total_revenue real DEFAULT 0,
            net_revenue real DEFAULT 0,
            total_orders int DEFAULT 0,
            avg_order_value real DEFAULT 0,
            total_tax real DEFAULT 0,
            total_discounts real DEFAULT 0,
            dine_in_revenue real DEFAULT 0,
            takeaway_revenue real DEFAULT 0,
            delivery_revenue real DEFAULT 0,
            gross_profit real DEFAULT 0,
            unique_customers int DEFAULT 0,
            created_at datetime2 DEFAULT GETDATE(),
            updated_at datetime2 DEFAULT GETDATE(),
            CONSTRAINT pk_daily_branch_summaries PRIMARY KEY (id),
            CONSTRAINT fk_daily_branch_summaries_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
        );

        IF OBJECT_ID('item_daily_snapshots', 'U') IS NULL
        CREATE TABLE item_daily_snapshots (
            id int IDENTITY(1,1) NOT NULL,
            menu_item_id nvarchar(255) NOT NULL,
            branch_id nvarchar(255) NULL,
            [date] date NOT NULL,
            quantity_sold real DEFAULT 0,
            total_sales real DEFAULT 0,
            total_cost real DEFAULT 0,
            gross_profit real DEFAULT 0,
            avg_price real DEFAULT 0,
            updated_at datetime2 DEFAULT GETDATE(),
            CONSTRAINT pk_item_daily_snapshots PRIMARY KEY (id),
            CONSTRAINT fk_item_daily_snapshots_menu_item FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
            CONSTRAINT fk_item_daily_snapshots_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
        );

        IF OBJECT_ID('customer_rfm_metrics', 'U') IS NULL
        CREATE TABLE customer_rfm_metrics (
            id int IDENTITY(1,1) NOT NULL,
            customer_id nvarchar(255) NOT NULL,
            branch_id nvarchar(255) NULL,
            recency int NULL,
            frequency int NULL,
            monetary real NULL,
            recency_score int NULL,
            frequency_score int NULL,
            monetary_score int NULL,
            rfm_segment nvarchar(255) NULL,
            last_order_date datetime2 NULL,
            updated_at datetime2 DEFAULT GETDATE(),
            CONSTRAINT pk_customer_rfm_metrics PRIMARY KEY (id),
            CONSTRAINT fk_customer_rfm_metrics_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
        );

        IF OBJECT_ID('user_daily_performance', 'U') IS NULL
        CREATE TABLE user_daily_performance (
            id nvarchar(255) NOT NULL,
            user_id nvarchar(255) NOT NULL,
            branch_id nvarchar(255) NOT NULL,
            [date] nvarchar(255) NOT NULL,
            order_count int DEFAULT 0,
            total_sales real DEFAULT 0,
            total_points int DEFAULT 0,
            avg_processing_time real DEFAULT 0,
            created_at datetime2 DEFAULT GETDATE(),
            updated_at datetime2 DEFAULT GETDATE(),
            CONSTRAINT pk_user_daily_performance PRIMARY KEY (id),
            CONSTRAINT fk_user_daily_performance_user FOREIGN KEY (user_id) REFERENCES users(id),
            CONSTRAINT fk_user_daily_performance_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
        );

        -- Older installations used business_date/orders_processed while the
        -- current analytics contract writes date/order_count. Add the current
        -- column in place so reporting recovers without destructive rebuilds.
        IF OBJECT_ID('user_daily_performance', 'U') IS NOT NULL
           AND COL_LENGTH('user_daily_performance', 'date') IS NULL
        BEGIN
            EXEC(N'ALTER TABLE user_daily_performance ADD [date] nvarchar(255) NULL');
            IF COL_LENGTH('user_daily_performance', 'business_date') IS NOT NULL
                EXEC(N'UPDATE user_daily_performance
                      SET [date] = COALESCE([date], CONVERT(nvarchar(255), business_date, 23))
                      WHERE [date] IS NULL');
        END;
    `);

    const idMetadata = await pool.query(`
        SELECT c.name, c.is_identity
        FROM sys.columns c
        WHERE c.object_id = OBJECT_ID('user_daily_performance')
          AND c.name IN ('id', 'business_date')
    `);
    const metadataRows = Array.isArray(idMetadata)
        ? idMetadata
        : ((idMetadata as any)?.recordset ?? (idMetadata as any)?.rows ?? []);
    const idRow = metadataRows.find((row: any) => row.name === 'id');
    userPerformanceIdRequiresValue = !Boolean(idRow?.is_identity);
    userPerformanceHasBusinessDate = metadataRows.some((row: any) => row.name === 'business_date');

    analyticsSchemaReady = true;
};

export const analyticsService = {

    /**
     * Incremental update of analytics snapshots.
     * Called when an order is completed/paid.
     */
    async recordOrderImpact(orderId: string) {
        try {
            await ensureAnalyticsSchema();
            const [order] = await db.select().top(1).from(orders).where(eq(orders.id, orderId));
            if (!order || order.status !== 'COMPLETED' && order.status !== 'DELIVERED') return;

            const branchId = order.branchId;
            const orderDate = new Date(`${new Date(order.createdAt || new Date()).toISOString().split('T')[0]}T00:00:00.000Z`);
            const total = Number(order.total || 0);
            const subtotal = Number(order.subtotal || 0);
            const tax = Number(order.tax || 0);
            const discount = Number(order.discount || 0);

            // 1. Update Daily Branch Summary
            await pool.query(`
                MERGE INTO daily_branch_summaries WITH (HOLDLOCK) AS target
                USING (SELECT $1 AS branch_id, CAST($2 AS DATE) AS [date]) AS source
                ON target.branch_id = source.branch_id AND target.[date] = source.[date]
                WHEN MATCHED THEN UPDATE SET
                    total_revenue = target.total_revenue + $3,
                    net_revenue = target.net_revenue + $4,
                    total_orders = target.total_orders + 1,
                    avg_order_value = (target.net_revenue + $4) / CAST(target.total_orders + 1 AS real),
                    total_tax = target.total_tax + $5,
                    total_discounts = target.total_discounts + $6,
                    dine_in_revenue = target.dine_in_revenue + $7,
                    takeaway_revenue = target.takeaway_revenue + $8,
                    delivery_revenue = target.delivery_revenue + $9,
                    unique_customers = target.unique_customers + $10,
                    updated_at = GETDATE()
                WHEN NOT MATCHED THEN INSERT (
                    branch_id, [date], total_revenue, net_revenue, total_orders, avg_order_value,
                    total_tax, total_discounts, dine_in_revenue, takeaway_revenue, delivery_revenue,
                    unique_customers, created_at, updated_at
                ) VALUES ($1, CAST($2 AS DATE), $3, $4, 1, $4, $5, $6, $7, $8, $9, $10, GETDATE(), GETDATE());
            `, [
                branchId,
                orderDate,
                total,
                subtotal,
                tax,
                discount,
                order.type === 'DINE_IN' ? total : 0,
                order.type === 'TAKEAWAY' ? total : 0,
                order.type === 'DELIVERY' ? total : 0,
                order.customerId ? 1 : 0,
            ]);

            // 2. Update Item Performance Snapshots
            const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
            for (const item of items) {
                if (!item.menuItemId) continue;
                
                const itemTotal = Number(item.price || 0) * Number(item.quantity || 0);
                const itemCost = Number(item.cost || 0) * Number(item.quantity || 0);
                const profit = itemTotal - itemCost;

                await pool.query(`
                    MERGE INTO item_daily_snapshots WITH (HOLDLOCK) AS target
                    USING (SELECT $1 AS menu_item_id, $2 AS branch_id, CAST($3 AS DATE) AS [date]) AS source
                    ON target.menu_item_id = source.menu_item_id
                        AND (target.branch_id = source.branch_id OR (target.branch_id IS NULL AND source.branch_id IS NULL))
                        AND target.[date] = source.[date]
                    WHEN MATCHED THEN UPDATE SET
                        quantity_sold = target.quantity_sold + $4,
                        total_sales = target.total_sales + $5,
                        total_cost = target.total_cost + $6,
                        gross_profit = target.gross_profit + $7,
                        avg_price = (target.total_sales + $5) / NULLIF(target.quantity_sold + $4, 0),
                        updated_at = GETDATE()
                    WHEN NOT MATCHED THEN INSERT (
                        menu_item_id, branch_id, [date], quantity_sold, total_sales, total_cost,
                        gross_profit, avg_price, updated_at
                    ) VALUES ($1, $2, CAST($3 AS DATE), $4, $5, $6, $7, $8, GETDATE());
                `, [
                    item.menuItemId,
                    branchId,
                    orderDate,
                    Number(item.quantity || 0),
                    itemTotal,
                    itemCost,
                    profit,
                    Number(item.price || 0),
                ]);
            }

            // 3. Update User Performance (Gamification)
            // Attribution: whoever closed the order (DELIVERED/COMPLETED
            // history actor) — covers cashiers, drivers' confirmations and
            // call-center agents — falling back to the recorded agent id.
            let performerId: string | null = order.callCenterAgentId || null;
            try {
                const [closingMove] = await db.select({ changedBy: orderStatusHistory.changedBy })
                    .from(orderStatusHistory)
                    .where(and(
                        eq(orderStatusHistory.orderId, orderId),
                        sql`${orderStatusHistory.status} IN ('DELIVERED', 'COMPLETED')`,
                    ))
                    .orderBy(desc(orderStatusHistory.createdAt))
                    .top(1);
                if ((closingMove as any)?.changedBy) performerId = String((closingMove as any).changedBy);
            } catch { /* keep fallback */ }
            if (performerId) {
                await this.recordUserPerformance(performerId, branchId, orderDate, total, order);
            }

            // 4. Update Customer RFM
            if (order.customerId) {
                await this.updateCustomerRfm(order.customerId, branchId);
            }

            log.info({ orderId, branchId }, 'Analytics snapshots updated');
        } catch (error: any) {
            log.error({ err: error.message, orderId }, 'Failed to record analytics impact');
        }
    },

    /**
     * Compute/Update RFM metrics for a single customer.
     */
    async updateCustomerRfm(customerId: string, branchId?: string): Promise<boolean> {
        try {
            await ensureAnalyticsSchema();
            // Get all customer orders
            const customerOrders = await db.select({
                total: orders.total,
                createdAt: orders.createdAt,
            })
            .from(orders)
            .where(
                and(
                    eq(orders.customerId, customerId),
                    sql`${orders.status} IN ('COMPLETED', 'DELIVERED')`,
                    branchId ? eq(orders.branchId, branchId) : undefined
                )
            );

            if (customerOrders.length === 0) return false;

            const totalSpent = customerOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
            const orderCount = customerOrders.length;
            const lastOrderDate = new Date(Math.max(...customerOrders.map(o => new Date(o.createdAt!).getTime())));
            const diffDays = Math.floor((Date.now() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24));

            // Logic to determine scores (relative would be better, but we use thresholds for now)
            // R (Recency): lower is better
            const rScore = diffDays <= 7 ? 5 : diffDays <= 30 ? 4 : diffDays <= 90 ? 3 : diffDays <= 180 ? 2 : 1;
            // F (Frequency): higher is better
            const fScore = orderCount >= 20 ? 5 : orderCount >= 10 ? 4 : orderCount >= 5 ? 3 : orderCount >= 2 ? 2 : 1;
            // M (Monetary): higher is better
            const mScore = totalSpent >= 5000 ? 5 : totalSpent >= 2000 ? 4 : totalSpent >= 1000 ? 3 : totalSpent >= 500 ? 2 : 1;

            // Segment definition
            let segment = 'NEW';
            const avgScore = (rScore + fScore + mScore) / 3;

            if (rScore >= 4 && fScore >= 4 && mScore >= 4) segment = 'CHAMPIONS';
            else if (fScore >= 4) segment = 'LOYAL';
            else if (rScore >= 4 && fScore <= 2) segment = 'NEW';
            else if (rScore <= 2) segment = 'AT_RISK';
            else if (avgScore >= 3) segment = 'POTENTIAL';
            else segment = 'NEED_ATTENTION';

            await db.insert(customerRfmMetrics)
                .values({
                    customerId,
                    branchId: branchId || null,
                    recency: diffDays,
                    frequency: orderCount,
                    monetary: totalSpent,
                    recencyScore: rScore,
                    frequencyScore: fScore,
                    monetaryScore: mScore,
                    rfmSegment: segment,
                    lastOrderDate,
                    updatedAt: new Date(),
                });
            return true;

        } catch (error: any) {
            log.error({ err: error.message, customerId }, 'Failed to update RFM metrics');
            return false;
        }
    },

    /**
     * Update user (employee) performance metrics
     */
    async recordUserPerformance(userId: string, branchId: string, date: string | Date, amount: number, order: any) {
        try {
            await ensureAnalyticsSchema();
            const normalizedDate = date instanceof Date
                ? date.toISOString().slice(0, 10)
                : String(date).slice(0, 10);
            // Calculate points: 10 per order + 1 per 100 units of currency
            let points = 10 + Math.floor(amount / 100);

            // Speed bonus: If completed within 10 mins (600s)
            if (order.completedAt && order.createdAt) {
                const processingTime = (new Date(order.completedAt).getTime() - new Date(order.createdAt).getTime()) / 1000;
                if (processingTime < 600) points += 5; // Speed bonus
                await this.insertUserPerformanceRow({ userId, branchId, date: normalizedDate, amount, points, processingTime });
            } else {
                await this.insertUserPerformanceRow({ userId, branchId, date: normalizedDate, amount, points });
            }
        } catch (error: any) {
            log.error({ err: error.message, userId }, 'Failed to update user performance');
        }
    },

    async insertUserPerformanceRow(input: {
        userId: string;
        branchId: string;
        date: string;
        amount: number;
        points: number;
        processingTime?: number;
    }) {
        const columns = ['user_id', 'branch_id', '[date]', 'order_count', 'total_sales', 'total_points'];
        const values: unknown[] = [input.userId, input.branchId, input.date, 1, input.amount, input.points];
        if (userPerformanceIdRequiresValue) {
            columns.unshift('id');
            values.unshift(randomUUID());
        }
        if (userPerformanceHasBusinessDate) {
            columns.push('business_date');
            values.push(new Date(`${input.date}T00:00:00.000Z`));
        }
        if (input.processingTime !== undefined) {
            columns.push('avg_processing_time');
            values.push(input.processingTime);
        }
        columns.push('updated_at');
        values.push(new Date());
        const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
        await pool.query(
            `INSERT INTO user_daily_performance (${columns.join(', ')}) VALUES (${placeholders})`,
            values,
        );
    },

    /**
     * Batch recompute for a whole branch (used to populate initial snapshots)
     */
    async recomputeBranchSnapshots(branchId: string, daysBack: number = 30) {
        const end = new Date();
        const start = new Date(end);
        start.setUTCDate(start.getUTCDate() - Math.max(1, Math.min(366, Math.floor(daysBack))));
        return this.reconcileBranchSnapshots(branchId, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
    },

    /**
     * Read-only reconciliation job: compare canonical completed orders to the
     * persisted daily summary. Repair stays explicit and separate from reads.
     */
    async reconcileBranchSnapshots(branchId: string, fromDate: string, toDate: string) {
        await ensureAnalyticsSchema();
        const orderRows = await db.select({
            businessDate: orders.businessDate,
            status: orders.status,
            total: orders.total,
            subtotal: orders.subtotal,
            tax: orders.tax,
            discount: orders.discount,
        }).from(orders).where(and(
            eq(orders.branchId, branchId),
            gte(orders.businessDate, fromDate),
            lte(orders.businessDate, toDate),
            sql`${orders.status} IN ('COMPLETED', 'DELIVERED')`,
        ));
        const expectedByDate = new Map<string, ReconciliationDay>();
        for (const row of orderRows) {
            const date = String(row.businessDate || '').slice(0, 10);
            if (!date) continue;
            const current = expectedByDate.get(date) || { date, revenue: 0, netRevenue: 0, orders: 0, tax: 0, discounts: 0 };
            current.revenue += Number(row.total || 0);
            current.netRevenue += Number(row.subtotal || 0);
            current.orders += 1;
            current.tax += Number(row.tax || 0);
            current.discounts += Number(row.discount || 0);
            expectedByDate.set(date, current);
        }

        const snapshotFrom = new Date(`${fromDate}T00:00:00.000Z`);
        const snapshotTo = new Date(`${toDate}T23:59:59.999Z`);
        const snapshotRows = await db.select({
            date: dailyBranchSummaries.date,
            revenue: dailyBranchSummaries.totalRevenue,
            netRevenue: dailyBranchSummaries.netRevenue,
            orders: dailyBranchSummaries.totalOrders,
            tax: dailyBranchSummaries.totalTax,
            discounts: dailyBranchSummaries.totalDiscounts,
        }).from(dailyBranchSummaries).where(and(
            eq(dailyBranchSummaries.branchId, branchId),
            gte(dailyBranchSummaries.date, snapshotFrom),
            lte(dailyBranchSummaries.date, snapshotTo),
        ));
        const actual = snapshotRows.map(row => ({
            date: String(row.date || '').slice(0, 10),
            revenue: Number(row.revenue || 0),
            netRevenue: Number(row.netRevenue || 0),
            orders: Number(row.orders || 0),
            tax: Number(row.tax || 0),
            discounts: Number(row.discounts || 0),
        }));
        const expected = Array.from(expectedByDate.values()).map(row => ({
            ...row,
            revenue: Number(row.revenue.toFixed(4)),
            netRevenue: Number(row.netRevenue.toFixed(4)),
            tax: Number(row.tax.toFixed(4)),
            discounts: Number(row.discounts.toFixed(4)),
        }));
        const mismatches = reconcileDailyBranchSnapshots(expected, actual);
        return {
            branchId,
            period: { from: fromDate, to: toDate },
            checkedAt: new Date().toISOString(),
            expectedDays: expected.length,
            snapshotDays: actual.length,
            mismatchCount: mismatches.length,
            status: mismatches.length === 0 ? 'MATCH' : 'MISMATCH',
            mismatches,
        };
    }
};
