import { Request, Response } from 'express';
import { eq, and, sql, gte, lte, inArray, desc, isNull } from 'drizzle-orm';
import { db } from '../../db';
import { orders, orderItems, menuItems, menuCategories, tables, floorZones } from '../../../src/db/schema';
import { parseLocalDateRange, orderBusinessDateFilter } from './reportUtils';
import { revenueEligibleOrder } from '../../utils/orderRevenue';

// Soft-deleted orders never count in sales analytics; voided lines never
// count in item-level sales.
const notDeleted = isNull(orders.deletedAt);
const liveLine = sql`coalesce(${orderItems.status}, '') not in ('VOID', 'VOIDED', 'CANCELLED')`;

export const getSalesByOrderType = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);

        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const conditions: any[] = [businessDateFilter, revenueEligibleOrder(), notDeleted];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const rows = await db.select({
            orderType: orders.type,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            netRevenue: sql<number>`coalesce(sum(${orders.subtotal} - ${orders.discount}), 0)`,
            avgTicket: sql<number>`coalesce(avg(${orders.total}), 0)`,
            totalDiscount: sql<number>`coalesce(sum(${orders.discount}), 0)`,
            totalDeliveryFee: sql<number>`coalesce(sum(${orders.deliveryFee}), 0)`,
            totalTax: sql<number>`coalesce(sum(${orders.tax}), 0)`,
        }).from(orders)
            .where(and(...conditions))
            .groupBy(orders.type)
            .orderBy(sql`sum(${orders.total}) desc`);

        const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue), 0);
        res.json(rows.map(r => ({
            ...r,
            orderCount: Number(r.orderCount),
            revenue: Number(Number(r.revenue).toFixed(2)),
            netRevenue: Number(Number(r.netRevenue).toFixed(2)),
            avgTicket: Number(Number(r.avgTicket).toFixed(2)),
            totalDiscount: Number(Number(r.totalDiscount).toFixed(2)),
            totalDeliveryFee: Number(Number(r.totalDeliveryFee).toFixed(2)),
            totalTax: Number(Number(r.totalTax).toFixed(2)),
            percentage: totalRevenue > 0 ? Number(((Number(r.revenue) / totalRevenue) * 100).toFixed(1)) : 0,
        })));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getSalesByItem = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);

        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const conditions: any[] = [businessDateFilter, revenueEligibleOrder(), notDeleted];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        // Cost prefers the per-line snapshot, falling back to the catalog cost
        // so legacy lines with cost=NULL no longer report margin=100%.
        const rows = await db.select({
            menuItemId: orderItems.menuItemId,
            itemName: orderItems.name,
            qtySold: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
            revenue: sql<number>`coalesce(sum(${orderItems.price} * ${orderItems.quantity}), 0)`,
            cost: sql<number>`coalesce(sum(coalesce(${orderItems.cost}, ${menuItems.cost}, 0) * ${orderItems.quantity}), 0)`,
        }).from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .leftJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
            .where(and(...conditions, liveLine))
            .groupBy(orderItems.menuItemId, orderItems.name, menuItems.cost)
            .orderBy(sql`sum(${orderItems.price} * ${orderItems.quantity}) desc`)
            .limit(100);

        // NOTE: gross item sales (modifiers/discounts/tax/fees excluded) —
        // ties to sales-by-category and food-cost-trend, NOT to order totals.
        res.json(rows.map(r => ({
            menuItemId: r.menuItemId,
            itemName: r.itemName,
            qtySold: Number(r.qtySold),
            revenue: Number(Number(r.revenue).toFixed(2)),
            cost: Number(Number(r.cost).toFixed(2)),
            profit: Number((Number(r.revenue) - Number(r.cost)).toFixed(2)),
            marginPercent: Number(r.revenue) > 0 ? Number(((Number(r.revenue) - Number(r.cost)) / Number(r.revenue) * 100).toFixed(1)) : 0,
        })));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getSalesByCategory = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);

        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const conditions: any[] = [businessDateFilter, revenueEligibleOrder(), notDeleted];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const rows = await db.select({
            categoryId: menuItems.categoryId,
            categoryName: menuCategories.name,
            qtySold: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
            revenue: sql<number>`coalesce(sum(${orderItems.price} * ${orderItems.quantity}), 0)`,
            cost: sql<number>`coalesce(sum(coalesce(${orderItems.cost}, ${menuItems.cost}, 0) * ${orderItems.quantity}), 0)`,
            itemCount: sql<number>`count(distinct ${orderItems.menuItemId})`,
        }).from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .leftJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
            .leftJoin(menuCategories, eq(menuItems.categoryId, menuCategories.id))
            .where(and(...conditions, liveLine))
            .groupBy(menuItems.categoryId, menuCategories.name)
            .orderBy(sql`sum(${orderItems.price} * ${orderItems.quantity}) desc`);

        const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue), 0);
        // NOTE: gross item sales basis (see getSalesByItem).
        res.json(rows.map(r => ({
            categoryId: r.categoryId,
            categoryName: r.categoryName || 'Uncategorized',
            qtySold: Number(r.qtySold),
            revenue: Number(Number(r.revenue).toFixed(2)),
            cost: Number(Number(r.cost).toFixed(2)),
            profit: Number((Number(r.revenue) - Number(r.cost)).toFixed(2)),
            itemCount: Number(r.itemCount),
            percentage: totalRevenue > 0 ? Number(((Number(r.revenue) / totalRevenue) * 100).toFixed(1)) : 0,
        })));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getDiscountAnalysis = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);

        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const conditions: any[] = [
            businessDateFilter,
            revenueEligibleOrder(),
            notDeleted,
            sql`${orders.discount} > 0`
        ];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        // By reason
        const byReason = await db.select({
            reason: sql<string>`coalesce(${orders.discountReason}, 'No Reason')`,
            orderCount: sql<number>`count(*)`,
            totalDiscount: sql<number>`coalesce(sum(${orders.discount}), 0)`,
            avgDiscount: sql<number>`coalesce(avg(${orders.discount}), 0)`,
        }).from(orders)
            .where(and(...conditions))
            .groupBy(orders.discountReason)
            .orderBy(sql`sum(${orders.discount}) desc`);

        // By type
        const byType = await db.select({
            discountType: sql<string>`coalesce(${orders.discountType}, 'unknown')`,
            orderCount: sql<number>`count(*)`,
            totalDiscount: sql<number>`coalesce(sum(${orders.discount}), 0)`,
        }).from(orders)
            .where(and(...conditions))
            .groupBy(orders.discountType);

        // Summary
        const [summary] = await db.select({
            totalOrders: sql<number>`count(*)`,
            totalDiscount: sql<number>`coalesce(sum(${orders.discount}), 0)`,
            avgDiscount: sql<number>`coalesce(avg(${orders.discount}), 0)`,
            maxDiscount: sql<number>`coalesce(max(${orders.discount}), 0)`,
        }).from(orders).where(and(...conditions));

        // Total orders to get discount rate
        const allConditions: any[] = [businessDateFilter, revenueEligibleOrder(), notDeleted];
        if (branchId && branchId !== 'undefined') allConditions.push(eq(orders.branchId, branchId as string));
        const [allOrders] = await db.select({
            totalOrders: sql<number>`count(*)`,
            totalSubtotal: sql<number>`coalesce(sum(${orders.subtotal}), 0)`,
        }).from(orders).where(and(...allConditions));

        // avgDiscount is per DISCOUNTED order; avgDiscountPerOrder + salesRate
        // describe the whole period (no more overstating).
        const totalOrders = Number(allOrders?.totalOrders || 0);
        const totalDiscount = Number(summary?.totalDiscount || 0);
        res.json({
            summary: {
                totalDiscountedOrders: Number(summary?.totalOrders || 0),
                totalOrders,
                discountRate: totalOrders > 0
                    ? Number(((Number(summary?.totalOrders || 0) / (totalOrders || 1)) * 100).toFixed(1))
                    : 0,
                totalDiscount: Number(totalDiscount.toFixed(2)),
                avgDiscount: Number(Number(summary?.avgDiscount || 0).toFixed(2)),
                avgDiscountPerOrder: totalOrders > 0 ? Number((totalDiscount / totalOrders).toFixed(2)) : 0,
                discountSalesRate: Number(allOrders?.totalSubtotal || 0) > 0
                    ? Number(((totalDiscount / Number(allOrders.totalSubtotal)) * 100).toFixed(2))
                    : 0,
                maxDiscount: Number(Number(summary?.maxDiscount || 0).toFixed(2)),
            },
            byReason: byReason.map(r => ({
                reason: r.reason,
                orderCount: Number(r.orderCount),
                totalDiscount: Number(Number(r.totalDiscount).toFixed(2)),
                avgDiscount: Number(Number(r.avgDiscount).toFixed(2)),
            })),
            byType: byType.map(r => ({
                discountType: r.discountType,
                orderCount: Number(r.orderCount),
                totalDiscount: Number(Number(r.totalDiscount).toFixed(2)),
            })),
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getCancelledOrders = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        // Loss numerator covers every dead end: CANCELLED + REFUNDED + VOID.
        const conditions: any[] = [
            businessDateFilter,
            inArray(orders.status, ['CANCELLED', 'REFUNDED', 'VOID']),
            notDeleted,
        ];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const rows = await db.select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            type: orders.type,
            total: orders.total,
            cancelReason: orders.cancelReason,
            cancelledAt: orders.cancelledAt,
            createdAt: orders.createdAt,
            customerName: orders.customerName,
        }).from(orders)
            .where(and(...conditions))
            .orderBy(desc(orders.cancelledAt))
            .limit(200);

        // Summary
        const [summary] = await db.select({
            cancelledCount: sql<number>`count(*)`,
            cancelledTotal: sql<number>`coalesce(sum(${orders.total}), 0)`,
        }).from(orders).where(and(...conditions));

        // Denominator: every live order in range (so cancelRate is dead/live-total).
        const allConditions: any[] = [businessDateFilter, notDeleted];
        if (branchId && branchId !== 'undefined') allConditions.push(eq(orders.branchId, branchId as string));
        const [allOrders] = await db.select({
            totalOrders: sql<number>`count(*)`,
        }).from(orders).where(and(...allConditions));

        // By reason
        const byReason = await db.select({
            reason: sql<string>`coalesce(${orders.cancelReason}, 'No Reason')`,
            count: sql<number>`count(*)`,
            total: sql<number>`coalesce(sum(${orders.total}), 0)`,
        }).from(orders)
            .where(and(...conditions))
            .groupBy(orders.cancelReason)
            .orderBy(sql`count(*) desc`);

        res.json({
            summary: {
                cancelledCount: Number(summary?.cancelledCount || 0),
                cancelledTotal: Number(Number(summary?.cancelledTotal || 0).toFixed(2)),
                totalOrders: Number(allOrders?.totalOrders || 0),
                cancelRate: Number(allOrders?.totalOrders || 0) > 0
                    ? Number(((Number(summary?.cancelledCount || 0) / Number(allOrders?.totalOrders || 1)) * 100).toFixed(1))
                    : 0,
            },
            byReason: byReason.map(r => ({
                reason: r.reason,
                count: Number(r.count),
                total: Number(Number(r.total).toFixed(2)),
            })),
            orders: rows.map(r => ({
                ...r,
                total: Number(Number(r.total).toFixed(2)),
            })),
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getDeliveryPerformance = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);

        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const conditions: any[] = [
            businessDateFilter,
            revenueEligibleOrder(),
            eq(orders.type, 'DELIVERY'),
            notDeleted,
        ];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const [summary] = await db.select({
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            avgTicket: sql<number>`coalesce(avg(${orders.total}), 0)`,
            totalDeliveryFees: sql<number>`coalesce(sum(${orders.deliveryFee}), 0)`,
            freeDeliveryCount: sql<number>`sum(case when ${orders.freeDelivery} = 1 then 1 else 0 end)`,
            avgDeliveryMinutes: sql<number>`coalesce(avg(datediff(second, ${orders.createdAt}, ${orders.actualDeliveryTime}) / 60.0), 0)`,
        }).from(orders).where(and(...conditions));

        // By driver
        const byDriver = await db.select({
            driverId: orders.driverId,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            avgDeliveryMinutes: sql<number>`coalesce(avg(datediff(second, ${orders.createdAt}, ${orders.actualDeliveryTime}) / 60.0), 0)`,
        }).from(orders)
            .where(and(...conditions, sql`${orders.driverId} is not null`))
            .groupBy(orders.driverId)
            .orderBy(sql`count(*) desc`);

        res.json({
            summary: {
                orderCount: Number(summary?.orderCount || 0),
                revenue: Number(Number(summary?.revenue || 0).toFixed(2)),
                avgTicket: Number(Number(summary?.avgTicket || 0).toFixed(2)),
                totalDeliveryFees: Number(Number(summary?.totalDeliveryFees || 0).toFixed(2)),
                freeDeliveryCount: Number(summary?.freeDeliveryCount || 0),
                avgDeliveryMinutes: Number(Number(summary?.avgDeliveryMinutes || 0).toFixed(1)),
            },
            byDriver: byDriver.map(d => ({
                driverId: d.driverId,
                orderCount: Number(d.orderCount),
                revenue: Number(Number(d.revenue).toFixed(2)),
                avgDeliveryMinutes: Number(Number(d.avgDeliveryMinutes).toFixed(1)),
            })),
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getSalesBySource = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);

        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const conditions: any[] = [businessDateFilter, revenueEligibleOrder(), notDeleted];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        // Canonical channel key (shared with channel-mix + day-close):
        // a non-restaurant delivery_source names the aggregator, else origin.
        const channelKey = sql<string>`case when ${orders.deliverySource} is not null and ${orders.deliverySource} <> 'restaurant' then ${orders.deliverySource} else coalesce(${orders.source}, 'pos') end`;
        const rows = await db.select({
            source: channelKey,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            avgTicket: sql<number>`coalesce(avg(${orders.total}), 0)`,
        }).from(orders)
            .where(and(...conditions))
            .groupBy(channelKey)
            .orderBy(sql`sum(${orders.total}) desc`);

        const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue), 0);
        res.json(rows.map(r => ({
            source: r.source,
            orderCount: Number(r.orderCount),
            revenue: Number(Number(r.revenue).toFixed(2)),
            avgTicket: Number(Number(r.avgTicket).toFixed(2)),
            percentage: totalRevenue > 0 ? Number(((Number(r.revenue) / totalRevenue) * 100).toFixed(1)) : 0,
        })));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getDineInTableAnalysis = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);

        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const tableConditions: any[] = [];
        const orderConditions: any[] = [
            businessDateFilter,
            revenueEligibleOrder(),
            eq(orders.type, 'DINE_IN'),
            sql`${orders.tableId} is not null`,
            notDeleted,
        ];
        if (branchId && branchId !== 'undefined') {
            tableConditions.push(eq(tables.branchId, branchId as string));
            orderConditions.push(eq(orders.branchId, branchId as string));
        }

        const tableRows = await db.select({
            tableId: tables.id,
            tableName: tables.name,
            zoneName: floorZones.name,
            seats: tables.seats,
            status: tables.status,
            configuredDiscountPercent: tables.discount,
            defaultCouponCode: tables.defaultCouponCode,
            minSpend: tables.minSpend,
            isVIP: tables.isVIP,
            notes: tables.notes,
        }).from(tables)
            // Zone branch scoped inside the JOIN so the LEFT JOIN keeps tables
            // whose zone is missing instead of dropping them.
            .leftJoin(floorZones, and(
                eq(tables.zoneId, floorZones.id),
                branchId && branchId !== 'undefined' ? eq(floorZones.branchId, branchId as string) : undefined,
            ))
            .where(tableConditions.length ? and(...tableConditions) : undefined);

        const metricRows = await db.select({
            tableId: orders.tableId,
            orderCount: sql<number>`count(*)`,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            avgTicket: sql<number>`coalesce(avg(${orders.total}), 0)`,
            avgDurationMinutes: sql<number>`coalesce(avg(datediff(second, ${orders.createdAt}, ${orders.completedAt}) / 60.0), 0)`,
            totalDiscount: sql<number>`coalesce(sum(${orders.discount}), 0)`,
            discountedOrderCount: sql<number>`coalesce(sum(case when ${orders.discount} > 0 then 1 else 0 end), 0)`,
            discountRate: sql<number>`case when coalesce(sum(${orders.subtotal}), 0) = 0 then 0 else coalesce(sum(${orders.discount}), 0) * 100.0 / sum(${orders.subtotal}) end`,
        }).from(orders)
            .where(and(...orderConditions))
            .groupBy(orders.tableId);

        const metricsByTableId = new Map(metricRows.map((row) => [row.tableId, row]));

        res.json(tableRows.map((table) => {
            const metrics = metricsByTableId.get(table.tableId);
            return {
                tableId: table.tableId,
                tableName: table.tableName || table.tableId,
                zoneName: table.zoneName || '',
                seats: Number(table.seats || 0),
                status: table.status || 'UNKNOWN',
                configuredDiscountPercent: Number(table.configuredDiscountPercent || 0),
                defaultCouponCode: table.defaultCouponCode || '',
                minSpend: Number(table.minSpend || 0),
                isVIP: Boolean(table.isVIP),
                notes: table.notes || '',
                orderCount: Number(metrics?.orderCount || 0),
                revenue: Number(Number(metrics?.revenue || 0).toFixed(2)),
                avgTicket: Number(Number(metrics?.avgTicket || 0).toFixed(2)),
                avgDurationMinutes: Number(Number(metrics?.avgDurationMinutes || 0).toFixed(1)),
                totalDiscount: Number(Number(metrics?.totalDiscount || 0).toFixed(2)),
                discountedOrderCount: Number(metrics?.discountedOrderCount || 0),
                discountRate: Number(Number(metrics?.discountRate || 0).toFixed(1)),
            };
        }).sort((left, right) => right.revenue - left.revenue || left.tableName.localeCompare(right.tableName)));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
