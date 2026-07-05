/**
 * Analytics/BI Service — Centralized Intelligence Layer
 * Implements: Phase 2.6 (BI Aggregation) and 2.7 (Customer Segmentation/RFM)
 * 
 * Provides pre-computed snapshots for high-performance dashboards and AI insights.
 */

import { db } from '../db';
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

export const analyticsService = {

    /**
     * Incremental update of analytics snapshots.
     * Called when an order is completed/paid.
     */
    async recordOrderImpact(orderId: string) {
        try {
            const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
            if (!order || order.status !== 'COMPLETED' && order.status !== 'DELIVERED') return;

            const branchId = order.branchId;
            const orderDate = new Date(order.createdAt || new Date()).toISOString().split('T')[0];
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
                })
                .onConflictDoUpdate({
                    target: [dailyBranchSummaries.branchId, dailyBranchSummaries.date],
                    set: {
                        totalRevenue: sql`${dailyBranchSummaries.totalRevenue} + ${total}`,
                        netRevenue: sql`${dailyBranchSummaries.netRevenue} + ${subtotal}`,
                        totalOrders: sql`${dailyBranchSummaries.totalOrders} + 1`,
                        totalTax: sql`${dailyBranchSummaries.totalTax} + ${tax}`,
                        totalDiscounts: sql`${dailyBranchSummaries.totalDiscounts} + ${discount}`,
                        dineInRevenue: order.type === 'DINE_IN' 
                            ? sql`${dailyBranchSummaries.dineInRevenue} + ${total}` 
                            : dailyBranchSummaries.dineInRevenue,
                        takeawayRevenue: order.type === 'TAKEAWAY' 
                            ? sql`${dailyBranchSummaries.takeawayRevenue} + ${total}` 
                            : dailyBranchSummaries.takeawayRevenue,
                        deliveryRevenue: order.type === 'DELIVERY' 
                            ? sql`${dailyBranchSummaries.deliveryRevenue} + ${total}` 
                            : dailyBranchSummaries.deliveryRevenue,
                        avgOrderValue: sql`(${dailyBranchSummaries.totalRevenue} + ${total}) / (${dailyBranchSummaries.totalOrders} + 1)`,
                        updatedAt: new Date(),
                    }
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
                    })
                    .onConflictDoUpdate({
                        target: [itemDailySnapshots.menuItemId, itemDailySnapshots.branchId, itemDailySnapshots.date],
                        set: {
                            quantitySold: sql`${itemDailySnapshots.quantitySold} + ${item.quantity}`,
                            totalSales: sql`${itemDailySnapshots.totalSales} + ${itemTotal}`,
                            totalCost: sql`${itemDailySnapshots.totalCost} + ${itemCost}`,
                            grossProfit: sql`${itemDailySnapshots.grossProfit} + ${profit}`,
                            avgPrice: Number(item.price || 0), // Use latest price
                            updatedAt: new Date(),
                        }
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
                })
                .onConflictDoUpdate({
                    target: [customerRfmMetrics.customerId, customerRfmMetrics.branchId],
                    set: {
                        recency: diffDays,
                        frequency: orderCount,
                        monetary: totalSpent,
                        recencyScore: rScore,
                        frequencyScore: fScore,
                        monetaryScore: mScore,
                        rfmSegment: segment,
                        lastOrderDate,
                        updatedAt: new Date(),
                    }
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
                    })
                    .onConflictDoUpdate({
                        target: [userDailyPerformance.userId, userDailyPerformance.branchId, userDailyPerformance.date],
                        set: {
                            orderCount: sql`${userDailyPerformance.orderCount} + 1`,
                            totalSales: sql`${userDailyPerformance.totalSales} + ${amount}`,
                            totalPoints: sql`${userDailyPerformance.totalPoints} + ${points}`,
                            avgProcessingTime: sql`(${userDailyPerformance.avgProcessingTime} + ${processingTime}) / 2`,
                            updatedAt: new Date(),
                        }
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
                    })
                    .onConflictDoUpdate({
                        target: [userDailyPerformance.userId, userDailyPerformance.branchId, userDailyPerformance.date],
                        set: {
                            orderCount: sql`${userDailyPerformance.orderCount} + 1`,
                            totalSales: sql`${userDailyPerformance.totalSales} + ${amount}`,
                            totalPoints: sql`${userDailyPerformance.totalPoints} + ${points}`,
                            updatedAt: new Date(),
                        }
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
