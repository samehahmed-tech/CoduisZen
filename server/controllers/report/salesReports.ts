import { Request, Response } from 'express';
import { eq, and, sql, gte, lte, inArray, desc, isNull } from 'drizzle-orm';
import { db } from '../../db';
import {
    inventoryItems,
    menuItems,
    orderItems,
    orders,
    payments,
    recipeIngredients,
    recipes,
} from '../../../src/db/schema';
import { orderBusinessDateFilter, orderBusinessDayExpression, parseLocalDateRange } from './reportUtils';
import { revenueEligibleOrder } from '../../utils/orderRevenue';

export const getVatReport = async (req: Request, res: Response) => {
    try {
        const { branchId, startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }

        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const report = await db.select({
            count: sql<number>`count(*)`,
            netTotal: sql<number>`sum(subtotal - discount)`,
            taxTotal: sql<number>`sum(tax)`,
            serviceChargeTotal: sql<number>`sum(service_charge)`,
            deliveryFeeTotal: sql<number>`coalesce(sum(${orders.deliveryFee}), 0)`,
            discountTotal: sql<number>`coalesce(sum(${orders.discount}), 0)`,
            grandTotal: sql<number>`sum(total)`,
        }).from(orders)
            .where(
                and(
                    branchId ? eq(orders.branchId, branchId as string) : undefined,
                    businessDateFilter,
                    inArray(orders.status, ['DELIVERED', 'COMPLETED']),
                    isNull(orders.deletedAt),
                ),
            );

        const s: any = report[0] || {};
        res.json({
            period: { start, end },
            branchId: branchId || 'ALL',
            // grandTotal = sum(total) is the books truth (net + tax + service + delivery).
            summary: {
                count: Number(s.count || 0),
                netTotal: Number(s.netTotal || 0),
                taxTotal: Number(s.taxTotal || 0),
                serviceChargeTotal: Number(s.serviceChargeTotal || 0),
                deliveryFeeTotal: Number(s.deliveryFeeTotal || 0),
                discountTotal: Number(s.discountTotal || 0),
                grandTotal: Number(s.grandTotal || 0),
            },
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getPaymentMethodSummary = async (req: Request, res: Response) => {
    try {
        const { branchId, startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }

        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const summary = await db.select({
            method: payments.method,
            total: sql<number>`sum(amount)`,
            count: sql<number>`count(*)`,
        }).from(payments)
            .innerJoin(orders, eq(payments.orderId, orders.id))
            .where(
                and(
                    branchId ? eq(orders.branchId, branchId as string) : undefined,
                    businessDateFilter,
                    eq(payments.status, 'COMPLETED'),
                    // Only takings on live sale orders — payments on
                    // CANCELLED/REFUNDED/VOID or soft-deleted orders must not
                    // inflate the collected totals.
                    inArray(orders.status, ['DELIVERED', 'COMPLETED']),
                    isNull(orders.deletedAt),
                ),
            )
            .groupBy(payments.method);

        res.json(summary);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getFiscalSummary = async (req: Request, res: Response) => {
    try {
        const { branchId, startDate, endDate } = req.query;
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const branchScope = branchId ? eq(orders.branchId, branchId as string) : undefined;

        const summary = await db.select({
            totalSales: sql<number>`sum(total)`,
            netSales: sql<number>`sum(subtotal - discount)`,
            vatAmount: sql<number>`sum(tax)`,
            orderCount: sql<number>`count(*)`,
        }).from(orders)
            .where(
                and(
                    branchScope,
                    businessDateFilter,
                    inArray(orders.status, ['DELIVERED', 'COMPLETED']),
                    isNull(orders.deletedAt),
                ),
            );

        const [latestOrder] = await db.select({ id: orders.id }).from(orders)
            .where(
                and(
                    branchScope,
                    isNull(orders.deletedAt),
                ),
            )
            .orderBy(desc(orders.createdAt)).limit(1);

        res.json({
            taxPeriod: `${start.getFullYear()}-${start.getMonth() + 1}`,
            data: {
                ...(summary[0] || { totalSales: 0, netSales: 0, vatAmount: 0, orderCount: 0 }),
                latestOrderId: latestOrder?.id,
            },
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getDailySales = async (req: Request, res: Response) => {
    try {
        const { branchId, startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }

        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const businessDay = orderBusinessDayExpression();

        const rows = await db.select({
            day: businessDay,
            revenue: sql<number>`sum(${orders.total})`,
            net: sql<number>`sum(${orders.subtotal} - ${orders.discount})`,
            tax: sql<number>`sum(${orders.tax})`,
            orderCount: sql<number>`count(*)`,
        }).from(orders)
            .where(
                and(
                    branchId ? eq(orders.branchId, branchId as string) : undefined,
                    businessDateFilter,
                    revenueEligibleOrder(),
                    isNull(orders.deletedAt),
                ),
            )
            .groupBy(businessDay)
            .orderBy(businessDay);

        res.json(rows);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getHourlySales = async (req: Request, res: Response) => {
    try {
        const { branchId, startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }

        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);

        // Bucket by HOUR (0-23), not by minute — format 'HH:mm' produced ~1440
        // groups per day. Wall-clock hour of creation; the range itself is
        // business-day filtered (see orderBusinessDateFilter).
        const hourBucket = sql<number>`datepart(hour, ${orders.createdAt})`;
        const rows = await db.select({
            hour: hourBucket,
            revenue: sql<number>`sum(${orders.total})`,
            orderCount: sql<number>`count(*)`,
        }).from(orders)
            .where(
                and(
                    branchId ? eq(orders.branchId, branchId as string) : undefined,
                    businessDateFilter,
                    revenueEligibleOrder(),
                    isNull(orders.deletedAt),
                ),
            )
            .groupBy(hourBucket)
            .orderBy(hourBucket);

        res.json(rows);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getCashierSummary = async (req: Request, res: Response) => {
    try {
        const { branchId, startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }

        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const summary = await db.select({
            cashier: sql<string>`coalesce(${payments.processedBy}, 'System/Online')`,
            method: payments.method,
            totalCollected: sql<number>`sum(${payments.amount})`,
            transactionCount: sql<number>`count(*)`,
        }).from(payments)
            .innerJoin(orders, eq(payments.orderId, orders.id))
            .where(
                and(
                    branchId ? eq(orders.branchId, branchId as string) : undefined,
                    businessDateFilter,
                    eq(payments.status, 'COMPLETED'),
                    inArray(orders.status, ['DELIVERED', 'COMPLETED']),
                    isNull(orders.deletedAt),
                ),
            )
            .groupBy(sql`coalesce(${payments.processedBy}, 'System/Online')`, payments.method)
            .orderBy(sql`coalesce(${payments.processedBy}, 'System/Online') desc`);

        res.json(summary);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getRefundsReport = async (req: Request, res: Response) => {
    try {
        const { branchId, startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }

        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const refunds = await db.select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            orderType: orders.type,
            businessDate: orders.businessDate,
            createdAt: orders.createdAt,
            customerName: orders.customerName,
            customerPhone: orders.customerPhone,
            total: orders.total,
            cancelReason: orders.cancelReason,
            cancelledAt: orders.cancelledAt,
            status: orders.status,
        }).from(orders)
            .where(
                and(
                    branchId ? eq(orders.branchId, branchId as string) : undefined,
                    businessDateFilter,
                    inArray(orders.status, ['CANCELLED', 'REFUNDED', 'VOID']),
                    isNull(orders.deletedAt),
                ),
            )
            // cancelledAt is NULL on REFUNDED rows — coalesce keeps ordering deterministic.
            .orderBy(desc(sql`coalesce(${orders.cancelledAt}, ${orders.updatedAt}, ${orders.createdAt})`));

        res.json(refunds);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getOverview = async (req: Request, res: Response) => {
    try {
        const { branchId, startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }

        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);

        const [summary] = await db.select({
            orderCount: sql<number>`count(*)`,
            grossSales: sql<number>`coalesce(sum(${orders.total}), 0)`,
            netSales: sql<number>`coalesce(sum(${orders.subtotal} - ${orders.discount}), 0)`,
            taxTotal: sql<number>`coalesce(sum(${orders.tax}), 0)`,
            discountTotal: sql<number>`coalesce(sum(${orders.discount}), 0)`,
            serviceChargeTotal: sql<number>`coalesce(sum(${orders.serviceCharge}), 0)`,
        }).from(orders).where(
            and(
                branchId ? eq(orders.branchId, branchId as string) : undefined,
                businessDateFilter,
                revenueEligibleOrder(),
                isNull(orders.deletedAt),
            ),
        );

        res.json(summary || {
            orderCount: 0,
            grossSales: 0,
            netSales: 0,
            taxTotal: 0,
            discountTotal: 0,
            serviceChargeTotal: 0,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getProfitSummary = async (req: Request, res: Response) => {
    try {
        const { branchId, startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }

        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);

        const [sales] = await db.select({
            grossSales: sql<number>`coalesce(sum(${orders.total}), 0)`,
            netSales: sql<number>`coalesce(sum(${orders.subtotal} - ${orders.discount}), 0)`,
            taxTotal: sql<number>`coalesce(sum(${orders.tax}), 0)`,
            orderCount: sql<number>`count(*)`,
        }).from(orders).where(
            and(
                branchId ? eq(orders.branchId, branchId as string) : undefined,
                businessDateFilter,
                revenueEligibleOrder(),
                isNull(orders.deletedAt),
            ),
        );

        // COGS prefers the per-line cost snapshot taken at sale time
        // (orderItems.cost) and falls back to the live catalog cost only for
        // lines sold before snapshots existed — so price/cost edits never
        // rewrite history. Voided lines are excluded.
        const cogsRows = await db.select({
            cogs: sql<number>`coalesce(sum(${orderItems.quantity} * coalesce(${orderItems.cost}, ${menuItems.cost}, 0)), 0)`,
        }).from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .leftJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
            .where(
                and(
                    branchId ? eq(orders.branchId, branchId as string) : undefined,
                    businessDateFilter,
                    revenueEligibleOrder(),
                    isNull(orders.deletedAt),
                    sql`coalesce(${orderItems.status}, '') not in ('VOID', 'VOIDED', 'CANCELLED')`,
                ),
            );

        const grossSales = Number(sales?.grossSales || 0);
        const netSales = Number(sales?.netSales || 0);
        const cogs = Number(cogsRows[0]?.cogs || 0);
        const grossProfit = netSales - cogs;
        const foodCostPercent = netSales > 0 ? (cogs / netSales) * 100 : 0;

        res.json({
            grossSales,
            netSales,
            taxTotal: Number(sales?.taxTotal || 0),
            orderCount: Number(sales?.orderCount || 0),
            cogs,
            grossProfit,
            foodCostPercent,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getProfitDaily = async (req: Request, res: Response) => {
    try {
        const { branchId, startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }

        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const businessDay = orderBusinessDayExpression();

        const salesRows = await db.select({
            day: businessDay,
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            net: sql<number>`coalesce(sum(${orders.subtotal} - ${orders.discount}), 0)`,
            tax: sql<number>`coalesce(sum(${orders.tax}), 0)`,
            orderCount: sql<number>`count(*)`,
        }).from(orders)
            .where(
                and(
                    branchId ? eq(orders.branchId, branchId as string) : undefined,
                    businessDateFilter,
                    revenueEligibleOrder(),
                    isNull(orders.deletedAt),
                ),
            )
            .groupBy(businessDay)
            .orderBy(businessDay);

        const cogsBusinessDay = orderBusinessDayExpression();
        const cogsRows = await db.select({
            day: cogsBusinessDay,
            cogs: sql<number>`coalesce(sum(${orderItems.quantity} * coalesce(${orderItems.cost}, ${menuItems.cost}, 0)), 0)`,
        }).from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .leftJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
            .where(
                and(
                    branchId ? eq(orders.branchId, branchId as string) : undefined,
                    businessDateFilter,
                    revenueEligibleOrder(),
                    isNull(orders.deletedAt),
                    sql`coalesce(${orderItems.status}, '') not in ('VOID', 'VOIDED', 'CANCELLED')`,
                ),
            )
            .groupBy(cogsBusinessDay)
            .orderBy(cogsBusinessDay);

        const cogsMap = new Map(cogsRows.map((r) => [r.day, Number(r.cogs || 0)]));
        const rows = salesRows.map((r) => {
            const cogs = Number(cogsMap.get(r.day) || 0);
            const net = Number(r.net || 0);
            return {
                day: r.day,
                revenue: Number(r.revenue || 0),
                net,
                tax: Number(r.tax || 0),
                orderCount: Number(r.orderCount || 0),
                cogs,
                grossProfit: net - cogs,
            };
        });

        res.json(rows);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getFoodCostReport = async (req: Request, res: Response) => {
    try {
        const { branchId, startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }

        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);

        const [menu, recs, recIngredients, inv, soldRows] = await Promise.all([
            db.select().from(menuItems),
            db.select({
                id: recipes.id,
                menuItemId: recipes.menuItemId,
            }).from(recipes),
            db.select({
                recipeId: recipeIngredients.recipeId,
                inventoryItemId: recipeIngredients.inventoryItemId,
                quantity: recipeIngredients.quantity,
            }).from(recipeIngredients),
            db.select({
                id: inventoryItems.id,
                costPrice: inventoryItems.costPrice,
                purchasePrice: inventoryItems.purchasePrice,
            }).from(inventoryItems),
            db.select({
                menuItemId: orderItems.menuItemId,
                soldQty: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
                soldRevenue: sql<number>`coalesce(sum(${orderItems.quantity} * ${orderItems.price}), 0)`,
            }).from(orderItems)
                .innerJoin(orders, eq(orderItems.orderId, orders.id))
                .where(
                    and(
                        branchId ? eq(orders.branchId, branchId as string) : undefined,
                        businessDateFilter,
                        revenueEligibleOrder(),
                        isNull(orders.deletedAt),
                        sql`coalesce(${orderItems.status}, '') not in ('VOID', 'VOIDED', 'CANCELLED')`,
                    ),
                )
                .groupBy(orderItems.menuItemId),
        ]);

        const recipeByMenuItem = new Map(recs.map((r) => [r.menuItemId, r]));
        const ingredientsByRecipe = new Map<string, any[]>();
        for (const ri of recIngredients) {
            const list = ingredientsByRecipe.get(ri.recipeId) || [];
            list.push(ri);
            ingredientsByRecipe.set(ri.recipeId, list);
        }
        const invCostById = new Map(inv.map((i) => [i.id, Number(i.costPrice || i.purchasePrice || 0)]));
        const soldByMenuItem = new Map(soldRows.map((r) => [r.menuItemId, { qty: Number(r.soldQty || 0), revenue: Number(r.soldRevenue || 0) }]));

        const items = menu.map((item) => {
            const recipe = recipeByMenuItem.get(item.id);
            const recipeItems = recipe ? (ingredientsByRecipe.get(recipe.id) || []) : [];
            const recipeCost = recipeItems.reduce((sum, ri) => sum + Number(ri.quantity || 0) * Number(invCostById.get(ri.inventoryItemId) || 0), 0);
            const baseCost = recipeCost > 0 ? recipeCost : Number(item.cost || 0);
            const price = Number(item.price || 0);
            const margin = price - baseCost;
            const marginPercent = price > 0 ? (margin / price) * 100 : 0;
            const sold = soldByMenuItem.get(item.id);
            return {
                id: item.id,
                name: item.name,
                price,
                cost: baseCost,
                margin,
                marginPercent,
                soldQty: Number(sold?.qty || 0),
                soldRevenue: Number(sold?.revenue || 0),
            };
        }).sort((a, b) => b.marginPercent - a.marginPercent);

        res.json(items);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
