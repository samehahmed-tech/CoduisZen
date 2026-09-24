import { Request, Response } from 'express';
import { eq, and, sql, gte, lte, inArray, desc, isNull } from 'drizzle-orm';
import { db } from '../../db';
import {
    orders, orderItems, shifts, users,
    inventoryItems, inventoryStock, stockMovements,
} from '../../../src/db/schema';
import { parseLocalDateRange, orderBusinessDateFilter } from './reportUtils';

const notDeleted = isNull(orders.deletedAt);
const liveLine = sql`coalesce(${orderItems.status}, '') not in ('VOID', 'VOIDED', 'CANCELLED')`;
const liveSaleStatuses = ['DELIVERED', 'COMPLETED'];
// Cashier attribution: the shift operator (fallback bucket when unset).
const cashierName = sql<string>`coalesce(${users.name}, 'No Shift')`;

/**
 * Discounts grouped by cashier (shift operator) — loss-prevention review:
 * who discounts, how much, and at what rate of their own sales.
 * GET /api/reports/discount-by-cashier?branchId=&startDate=&endDate=
 */
export const getDiscountByCashier = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const conditions: any[] = [businessDateFilter, inArray(orders.status, liveSaleStatuses), notDeleted];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const rows = await db.select({
            cashier: cashierName,
            orderCount: sql<number>`count(*)`,
            salesTotal: sql<number>`coalesce(sum(${orders.subtotal}), 0)`,
            discountTotal: sql<number>`coalesce(sum(${orders.discount}), 0)`,
            discountedOrders: sql<number>`sum(case when ${orders.discount} > 0 then 1 else 0 end)`,
            maxDiscount: sql<number>`coalesce(max(${orders.discount}), 0)`,
        }).from(orders)
            .leftJoin(shifts, eq(orders.shiftId, shifts.id))
            .leftJoin(users, eq(shifts.userId, users.id))
            .where(and(...conditions))
            .groupBy(sql`coalesce(${users.name}, 'No Shift')`)
            .orderBy(sql`sum(${orders.discount}) desc`);

        res.json(rows.map((r) => {
            const sales = Number(r.salesTotal || 0);
            const discount = Number(r.discountTotal || 0);
            const discountedCount = Number((r as any).discountedOrders || 0);
            return {
                cashier: r.cashier,
                orderCount: Number(r.orderCount || 0),
                salesTotal: Number(sales.toFixed(2)),
                discountTotal: Number(discount.toFixed(2)),
                discountedOrders: discountedCount,
                discountRate: sales > 0 ? Number(((discount / sales) * 100).toFixed(2)) : 0,
                // Average per DISCOUNTED order (matches the Discounts report basis).
                avgDiscount: discountedCount > 0 ? Number((discount / discountedCount).toFixed(2)) : 0,
                avgDiscountAllOrders: Number(r.orderCount || 0) > 0 ? Number((discount / Number(r.orderCount)).toFixed(2)) : 0,
                maxDiscount: Number(Number((r as any).maxDiscount || 0).toFixed(2)),
            };
        }));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

/**
 * Voids grouped by cashier (shift operator): dead orders AND voided lines
 * inside live orders, with reasons. Anything unattributed lands on No Shift.
 * GET /api/reports/voids-by-cashier?branchId=&startDate=&endDate=
 */
export const getVoidsByCashier = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const businessDateFilter = orderBusinessDateFilter(startDate as string, endDate as string, start, end);
        const conditions: any[] = [businessDateFilter, notDeleted];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        // Dead orders (cancelled/refunded/void) by cashier.
        const deadOrders = await db.select({
            cashier: cashierName,
            voidOrderCount: sql<number>`count(*)`,
            voidOrderValue: sql<number>`coalesce(sum(${orders.total}), 0)`,
        }).from(orders)
            .leftJoin(shifts, eq(orders.shiftId, shifts.id))
            .leftJoin(users, eq(shifts.userId, users.id))
            .where(and(...conditions, inArray(orders.status, ['CANCELLED', 'REFUNDED', 'VOID'])))
            .groupBy(sql`coalesce(${users.name}, 'No Shift')`);

        // Voided lines inside otherwise-live orders, by cashier.
        const voidLines = await db.select({
            cashier: cashierName,
            voidLineCount: sql<number>`count(*)`,
            voidLineValue: sql<number>`coalesce(sum(${orderItems.price} * ${orderItems.quantity}), 0)`,
        }).from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .leftJoin(shifts, eq(orders.shiftId, shifts.id))
            .leftJoin(users, eq(shifts.userId, users.id))
            .where(and(
                ...conditions,
                inArray(orders.status, liveSaleStatuses),
                sql`coalesce(${orderItems.status}, '') in ('VOID', 'VOIDED', 'CANCELLED')`,
            ))
            .groupBy(sql`coalesce(${users.name}, 'No Shift')`);

        const merged = new Map<string, { voidOrderCount: number; voidOrderValue: number; voidLineCount: number; voidLineValue: number }>();
        for (const r of deadOrders) {
            merged.set(r.cashier, {
                voidOrderCount: Number(r.voidOrderCount || 0),
                voidOrderValue: Number(r.voidOrderValue || 0),
                voidLineCount: 0, voidLineValue: 0,
            });
        }
        for (const r of voidLines) {
            const prev = merged.get(r.cashier) || { voidOrderCount: 0, voidOrderValue: 0, voidLineCount: 0, voidLineValue: 0 };
            prev.voidLineCount = Number(r.voidLineCount || 0);
            prev.voidLineValue = Number(r.voidLineValue || 0);
            merged.set(r.cashier, prev);
        }
        const byCashier = Array.from(merged.entries()).map(([cashier, v]) => ({
            cashier,
            ...v,
            voidOrderValue: Number(v.voidOrderValue.toFixed(2)),
            voidLineValue: Number(v.voidLineValue.toFixed(2)),
            totalLoss: Number((v.voidOrderValue + v.voidLineValue).toFixed(2)),
        })).sort((a, b) => b.totalLoss - a.totalLoss);

        res.json({
            byCashier,
            summary: {
                voidOrderCount: byCashier.reduce((s, r) => s + r.voidOrderCount, 0),
                voidOrderValue: Number(byCashier.reduce((s, r) => s + r.voidOrderValue, 0).toFixed(2)),
                voidLineCount: byCashier.reduce((s, r) => s + r.voidLineCount, 0),
                voidLineValue: Number(byCashier.reduce((s, r) => s + r.voidLineValue, 0).toFixed(2)),
            },
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

/**
 * Dead stock: on-hand items with no consumption in the last X days
 * (default 60), ranked by locked value. Never-consumed items included.
 * GET /api/reports/dead-stock?branchId=&days=
 */
export const getDeadStock = async (req: Request, res: Response) => {
    try {
        const { branchId, days } = req.query;
        const lookbackDays = Math.min(365, Math.max(1, Number(days) || 60));

        const stockScope = branchId && branchId !== 'undefined'
            ? sql`AND ${inventoryStock.warehouseId} IN (SELECT id FROM warehouses WHERE branch_id = ${String(branchId)})`
            : sql``;
        const moveScope = branchId && branchId !== 'undefined'
            ? sql`AND (${stockMovements.fromWarehouseId} IN (SELECT id FROM warehouses WHERE branch_id = ${String(branchId)}) OR ${stockMovements.toWarehouseId} IN (SELECT id FROM warehouses WHERE branch_id = ${String(branchId)}))`
            : sql``;

        const rows: any = await db.execute(sql`
            SELECT i.id AS itemId, i.name AS itemName, i.unit AS unit,
                   COALESCE(SUM(s.quantity), 0) AS onHand,
                   COALESCE(i.cost_price, i.purchase_price, 0) AS unitCost,
                   MAX(CASE WHEN m.type IN ('SALE_CONSUMPTION', 'PRODUCTION_CONSUMPTION') THEN m.created_at END) AS lastConsumption
            FROM inventory_items i
            LEFT JOIN inventory_stock s ON s.item_id = i.id ${stockScope}
            LEFT JOIN stock_movements m ON m.item_id = i.id
                AND m.type IN ('SALE_CONSUMPTION', 'PRODUCTION_CONSUMPTION') ${moveScope}
            WHERE i.is_active = 1 AND i.deleted_at IS NULL
            GROUP BY i.id, i.name, i.unit, i.cost_price, i.purchase_price
            HAVING COALESCE(SUM(s.quantity), 0) > 0
               AND (MAX(CASE WHEN m.type IN ('SALE_CONSUMPTION', 'PRODUCTION_CONSUMPTION') THEN m.created_at END) IS NULL
                    OR MAX(CASE WHEN m.type IN ('SALE_CONSUMPTION', 'PRODUCTION_CONSUMPTION') THEN m.created_at END) < dateadd(day, -${lookbackDays}, getdate()))
            ORDER BY COALESCE(SUM(s.quantity), 0) * COALESCE(i.cost_price, i.purchase_price, 0) DESC
        `);
        const list: any[] = Array.isArray(rows) ? rows : (rows?.recordset ?? rows?.rows ?? []);
        res.json({
            days: lookbackDays,
            scope: (branchId as string) || 'ALL',
            items: list.map((r: any) => {
                const onHand = Number(r.onHand || 0);
                const unitCost = Number(r.unitCost || 0);
                return {
                    itemId: r.itemId, itemName: r.itemName, unit: r.unit,
                    onHand: Number(onHand.toFixed(3)),
                    unitCost: Number(unitCost.toFixed(2)),
                    lockedValue: Number((onHand * unitCost).toFixed(2)),
                    lastConsumption: r.lastConsumption || null,
                    neverConsumed: !r.lastConsumption,
                };
            }),
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

/**
 * Negative stock: items whose summed on-hand is below zero (oversold —
 * sales/receipts out of balance). Data-quality alarm, not valuation.
 * GET /api/reports/negative-stock?branchId=
 */
export const getNegativeStock = async (req: Request, res: Response) => {
    try {
        const { branchId } = req.query;
        const stockJoin = branchId && branchId !== 'undefined'
            ? sql`${inventoryItems.id} = ${inventoryStock.itemId} AND ${inventoryStock.warehouseId} IN (SELECT id FROM warehouses WHERE branch_id = ${String(branchId)})`
            : eq(inventoryItems.id, inventoryStock.itemId);
        const rows = await db.select({
            itemId: inventoryItems.id,
            itemName: inventoryItems.name,
            unit: inventoryItems.unit,
            threshold: inventoryItems.threshold,
            onHand: sql<number>`coalesce(sum(${inventoryStock.quantity}), 0)`,
        }).from(inventoryItems)
            .leftJoin(inventoryStock, stockJoin)
            .where(and(eq(inventoryItems.isActive, true), isNull(inventoryItems.deletedAt)))
            .groupBy(inventoryItems.id, inventoryItems.name, inventoryItems.unit, inventoryItems.threshold)
            .having(sql`coalesce(sum(${inventoryStock.quantity}), 0) < 0`)
            .orderBy(sql`coalesce(sum(${inventoryStock.quantity}), 0) asc`);

        res.json(rows.map((r) => ({
            ...r,
            onHand: Number(Number(r.onHand || 0).toFixed(3)),
            scope: (branchId as string) || 'ALL',
        })));
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

/**
 * Unpaid open orders: live, non-dead orders with balance due.
 * GET /api/reports/unpaid-orders?branchId=
 */
export const getUnpaidOrders = async (req: Request, res: Response) => {
    try {
        const { branchId } = req.query;
        const conditions: any[] = [
            notDeleted,
            sql`coalesce(${orders.isPaid}, 0) = 0`,
            sql`${orders.status} not in ('CANCELLED', 'REFUNDED', 'VOID', 'DELIVERED', 'COMPLETED')`,
        ];
        if (branchId && branchId !== 'undefined') conditions.push(eq(orders.branchId, branchId as string));

        const rows = await db.select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            type: orders.type,
            status: orders.status,
            customerName: orders.customerName,
            customerPhone: orders.customerPhone,
            total: orders.total,
            paidAmount: orders.paidAmount,
            createdAt: orders.createdAt,
            businessDate: orders.businessDate,
        }).from(orders)
            .where(and(...conditions))
            .orderBy(desc(orders.createdAt))
            .limit(200);

        const items = rows.map((r) => {
            const total = Number(r.total || 0);
            const paid = Number((r as any).paidAmount || 0);
            return { ...r, total, paid, balance: Number((total - paid).toFixed(2)) };
        });
        res.json({
            count: items.length,
            totalBalance: Number(items.reduce((s, r) => s + r.balance, 0).toFixed(2)),
            orders: items,
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
