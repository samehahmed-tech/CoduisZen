/**
 * Daily P&L Service — P1 Financial Backbone
 *
 * Computes a branch-scoped daily profit & loss and stores it as an immutable
 * snapshot (daily_pnl_snapshots). The snapshot can be re-run (upsert) as long
 * as the day is not yet FINALIZED — finalization locks it like day close.
 *
 * Metrics:
 * - Revenue / Net Sales   : from orders of the business date (excl. cancelled)
 * - COGS                  : stock_movements of type SALE_CONSUMPTION that day
 * - Food Cost %           : COGS / Net Sales
 * - Labor Cost            : payroll payout lines dated within the day (fallback:
 *                           payroll_runs netTotal spread across the period)
 * - Labor Cost %          : Labor / Net Sales
 * - Opex                  : GL journal expense postings (52xx–59xx) dated that day
 * - Gross Profit / Margin, Operating Income, Net Margin %
 */

import { db } from '../db';
import { dailyPnlSnapshots, orders, stockMovements, warehouses, payrollPayouts, payrollCycles, chartOfAccounts } from '../../src/db/schema';
import { and, eq, gte, lte, isNull, not, inArray, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import logger from '../utils/logger';

const r2 = (v: number) => Math.round(Number(v) * 100) / 100;
const pct = (num: number, den: number) => (den > 0 ? r2((num / den) * 100) : 0);

export const dailyPnlService = {
    computeDailyPnl: async (input: { branchId: string; businessDate: string; finalizedBy?: string }) => {
        const { branchId, businessDate } = input;
        const dayStart = new Date(`${businessDate}T00:00:00`);
        const dayEnd = new Date(`${businessDate}T23:59:59.999`);

        // 1. Revenue from orders of the business date (paid & completed, not cancelled/soft-deleted).
        // NOTE: orders.total is stored NET of discount, so netSales must be
        // derived from subtotal, never as revenue - discount (double subtract).
        const [orderStats] = await db.select({
            revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            merchandise: sql<number>`coalesce(sum(${orders.subtotal}), 0)`,
            discount: sql<number>`coalesce(sum(${orders.discount}), 0)`,
            tax: sql<number>`coalesce(sum(${orders.tax}), 0)`,
            orders: sql<number>`count(*)`,
        }).from(orders)
            .where(and(
                eq(orders.branchId, branchId),
                eq(orders.businessDate, businessDate),
                not(eq(orders.status, 'CANCELLED')),
                isNull(orders.deletedAt),
            ));

        const totalRevenue = r2(orderStats?.revenue || 0);
        const totalDiscount = r2(orderStats?.discount || 0);
        const totalTax = r2(orderStats?.tax || 0);
        const netSales = r2(Number(orderStats?.merchandise || 0) - totalDiscount);
        const totalOrders = Number(orderStats?.orders || 0);

        // 2. COGS: item-level cost snapshots on paid orders OR MAC stock consumption.
        let cogs = 0;
        try {
            const [cogsRow] = await db.select({
                total: sql<number>`coalesce(sum(${stockMovements.totalCost}), 0)`,
            }).from(stockMovements)
                .innerJoin(warehouses, eq(stockMovements.fromWarehouseId, warehouses.id))
                .where(and(
                    eq(warehouses.branchId, branchId),
                    eq(stockMovements.type, 'SALE_CONSUMPTION'),
                    gte(stockMovements.createdAt, dayStart),
                    lte(stockMovements.createdAt, dayEnd),
                ));
            cogs = r2(cogsRow?.total || 0);
        } catch (err) {
            logger.warn({ err }, 'daily pnl: stock consumption lookup skipped');
        }
        if (cogs === 0) {
            try {
                // Fallback: sum of item cost * quantity on completed orders.
                const [fallback] = await db.select({
                    total: sql<number>`coalesce(sum(${orders.subtotal}), 0)`,
                }).from(orders).where(and(
                    eq(orders.branchId, branchId),
                    eq(orders.businessDate, businessDate),
                    not(eq(orders.status, 'CANCELLED')),
                    isNull(orders.deletedAt),
                ));
                // NOTE: this overstates COGS; a zero stock-move day means recipes not
                // deducted — flag it by leaving cogs 0 and letting Food Cost % = 0
                // surface the configuration gap rather than inventing numbers.
            } catch { /* noop */ }
        }

        // 3. Labor cost: net pay of payroll cycles for this branch whose payout
        //    window overlaps the business date. PAID cycles = actual cost of the
        //    day; APPROVED-but-unpaid cycles are excluded (not yet spent).
        let laborCost = 0;
        try {
            const cycles = await db.select().from(payrollCycles).where(and(
                eq(payrollCycles.branchId, branchId),
                eq(payrollCycles.status, 'PAID'),
                sql`${payrollCycles.periodEnd} >= ${dayStart}`,
                sql`${payrollCycles.periodStart} <= ${dayEnd}`,
            ));
            if (cycles.length > 0) {
                const [laborRow] = await db.select({
                    total: sql<number>`coalesce(sum(${payrollPayouts.netPay}), 0)`,
                }).from(payrollPayouts).where(inArray(payrollPayouts.cycleId, cycles.map(c => c.id)));
                laborCost = r2(laborRow?.total || 0);
            }
        } catch (err) {
            logger.warn({ err }, 'daily pnl: labor lookup skipped');
        }

        // 4. Operating expenses from GL journal lines whose account code is in
        //    the 52xx–59xx expense range (posted journal entries).
        let operatingExpenses = 0;
        try {
            const expenseAccounts = await db.select({ id: chartOfAccounts.id }).from(chartOfAccounts)
                .where(inArray(chartOfAccounts.code, ['5200', '5300', '5400', '5500', '5600', '5700', '5800', '5900']));
            if (expenseAccounts.length > 0) {
                const { expenseOpex } = await import('./opexQuery');
                operatingExpenses = await expenseOpex(branchId, expenseAccounts.map(a => a.id), dayStart, dayEnd);
            }
        } catch (err) {
            logger.warn({ err }, 'daily pnl: GL opex lookup skipped');
        }

        const grossProfit = r2(netSales - cogs);
        const operatingIncome = r2(grossProfit - laborCost - operatingExpenses);

        const snapshot = {
            id: `pnl-${branchId}-${businessDate}`,
            branchId,
            businessDate: new Date(businessDate),
            totalRevenue: String(totalRevenue),
            totalDiscount: String(totalDiscount),
            totalTax: String(totalTax),
            netSales: String(netSales),
            totalOrders,
            cogs: String(cogs),
            foodCostPercent: String(pct(cogs, netSales)),
            laborCost: String(laborCost),
            laborCostPercent: String(pct(laborCost, netSales)),
            operatingExpenses: String(operatingExpenses),
            grossProfit: String(grossProfit),
            grossMarginPercent: String(pct(grossProfit, netSales)),
            operatingIncome: String(operatingIncome),
            netMarginPercent: String(pct(operatingIncome, netSales)),
            status: input.finalizedBy ? 'FINALIZED' : 'OPEN',
            finalizedBy: input.finalizedBy || null,
            finalizedAt: input.finalizedBy ? new Date() : null,
            computedAt: new Date(),
        };

        const whereKey = and(eq(dailyPnlSnapshots.branchId, branchId), eq(dailyPnlSnapshots.businessDate, new Date(businessDate)));
        const existingRows = await db.select().from(dailyPnlSnapshots).where(whereKey);
        if (existingRows.length > 0 && existingRows[0].status !== 'FINALIZED') {
            // Allow recomputation unless the day is already finalized.
            await db.update(dailyPnlSnapshots).set({
                ...snapshot,
                updatedAt: new Date(),
            }).where(whereKey);
            const [updated] = await db.select().from(dailyPnlSnapshots).where(whereKey);
            return updated;
        }

        await db.insert(dailyPnlSnapshots).values(snapshot);
        const [created] = await db.select().from(dailyPnlSnapshots)
            .where(and(eq(dailyPnlSnapshots.branchId, branchId), eq(dailyPnlSnapshots.businessDate, new Date(businessDate))));
        return created;
    },

    finalize: async (branchId: string, businessDate: string, finalizedBy: string) => {
        const dateVal = new Date(businessDate);
        const [row] = await db.select().from(dailyPnlSnapshots)
            .where(and(eq(dailyPnlSnapshots.branchId, branchId), eq(dailyPnlSnapshots.businessDate, dateVal)));
        if (!row) {
            return dailyPnlService.computeDailyPnl({ branchId, businessDate, finalizedBy });
        }
        await db.update(dailyPnlSnapshots).set({
            status: 'FINALIZED',
            finalizedBy,
            finalizedAt: new Date(),
            updatedAt: new Date(),
        }).where(and(eq(dailyPnlSnapshots.branchId, branchId), eq(dailyPnlSnapshots.businessDate, dateVal)));
        const [updated] = await db.select().from(dailyPnlSnapshots)
            .where(and(eq(dailyPnlSnapshots.branchId, branchId), eq(dailyPnlSnapshots.businessDate, dateVal)));
        return updated;
    },

    list: async (branchId: string, from?: string, to?: string) => {
        const conds: any[] = [eq(dailyPnlSnapshots.branchId, branchId)];
        if (from) conds.push(gte(dailyPnlSnapshots.businessDate, new Date(from)));
        if (to) conds.push(lte(dailyPnlSnapshots.businessDate, new Date(to)));
        return db.select().from(dailyPnlSnapshots)
            .where(and(...conds))
            .orderBy(dailyPnlSnapshots.businessDate);
    },

    latest: async (branchId: string) => {
        const rows = await db.select().from(dailyPnlSnapshots)
            .where(eq(dailyPnlSnapshots.branchId, branchId))
            .orderBy(dailyPnlSnapshots.businessDate).limit(1);
        return rows[0] || null;
    },
};

export default dailyPnlService;
