/**
 * Analytics/BI Service — Centralized Intelligence Layer
 * Implements: Phase 2.6 (BI Aggregation) and 2.7 (Customer Segmentation/RFM)
 * 
 * Provides pre-computed snapshots for high-performance dashboards and AI insights.
 */

import { db, pool } from '../db';
import { 
    orders, 
    orderItems, 
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

const log = logger.child({ service: 'analytics' });

let analyticsSchemaReady = false;

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
            id int IDENTITY(1,1) NOT NULL,
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
    `);

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
            await db.insert(dailyBranchSummaries)
                .values({
                    branchId,
                    date: orderDate,
                    totalRevenue: total,
                    netRevenue: subtotal,
                    totalOrders: 1,
                    totalTax: tax,
                    totalDiscounts: discount,
                    dineInRevenue: order.type === 'DINE_IN' ? total : 0,
                    takeawayRevenue: order.type === 'TAKEAWAY' ? total : 0,
                    deliveryRevenue: order.type === 'DELIVERY' ? total : 0,
                    uniqueCustomers: order.customerId ? 1 : 0,
                    updatedAt: new Date(),
                });

            // 2. Update Item Performance Snapshots
            const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
            for (const item of items) {
                if (!item.menuItemId) continue;
                
                const itemTotal = Number(item.price || 0) * Number(item.quantity || 0);
                const itemCost = Number(item.cost || 0) * Number(item.quantity || 0);
                const profit = itemTotal - itemCost;

                await db.insert(itemDailySnapshots)
                    .values({
                        menuItemId: item.menuItemId,
                        branchId,
                        date: orderDate,
                        quantitySold: Number(item.quantity || 0),
                        totalSales: itemTotal,
                        totalCost: itemCost,
                        grossProfit: profit,
                        avgPrice: Number(item.price || 0),
                        updatedAt: new Date(),
                    });
            }

            // 3. Update User Performance (Gamification)
            const userId = order.callCenterAgentId;
            if (userId) {
                await this.recordUserPerformance(userId, branchId, orderDate, total, order);
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
    async updateCustomerRfm(customerId: string, branchId?: string) {
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

            if (customerOrders.length === 0) return;

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

        } catch (error: any) {
            log.error({ err: error.message, customerId }, 'Failed to update RFM metrics');
        }
    },

    /**
     * Update user (employee) performance metrics
     */
    async recordUserPerformance(userId: string, branchId: string, date: string, amount: number, order: any) {
        try {
            await ensureAnalyticsSchema();
            // Calculate points: 10 per order + 1 per 100 units of currency
            let points = 10 + Math.floor(amount / 100);

            // Speed bonus: If completed within 10 mins (600s)
            if (order.completedAt && order.createdAt) {
                const processingTime = (new Date(order.completedAt).getTime() - new Date(order.createdAt).getTime()) / 1000;
                if (processingTime < 600) points += 5; // Speed bonus
                
                await db.insert(userDailyPerformance)
                    .values({
                        userId,
                        branchId,
                        date,
                        orderCount: 1,
                        totalSales: amount,
                        totalPoints: points,
                        avgProcessingTime: processingTime,
                        updatedAt: new Date(),
                    });
            } else {
                 await db.insert(userDailyPerformance)
                    .values({
                        userId,
                        branchId,
                        date,
                        orderCount: 1,
                        totalSales: amount,
                        totalPoints: points,
                        updatedAt: new Date(),
                    });
            }
        } catch (error: any) {
            log.error({ err: error.message, userId }, 'Failed to update user performance');
        }
    },

    /**
     * Batch recompute for a whole branch (used to populate initial snapshots)
     */
    async recomputeBranchSnapshots(branchId: string, daysBack: number = 30) {
        log.info({ branchId, daysBack }, 'Recomputing branch analytics snapshots');
        // Implementation would iterate through past orders and call recordOrderImpact
        // For brevity, we focus on the incremental approach for now.
    }
};
