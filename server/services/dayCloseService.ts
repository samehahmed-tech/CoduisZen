/**
 * Day Close Service - End of Day Processing
 * Handles day closing, report generation, and email dispatch
 */

import { db } from '../db';
import {
    orders,
    payments,
    branches,
    auditLogs,
    fiscalLogs,
    etaDeadLetters,
    financeExceptions,
    domainEvents,
    shifts,
    dayCloseReports,
    stockMovements,
    inventoryStock,
    inventoryItems,
    warehouses,
    refundRecords,
} from '../../src/db/schema';
import { eq, and, gte, lte, desc, sql, like } from 'drizzle-orm';
import { createSignedAuditLog } from './auditService';
import { emailService } from './emailService';
import { generateDayClosePDF } from './pdfService';

// Day close status
type DayCloseStatus = 'OPEN' | 'CLOSING' | 'CLOSED';

interface DayCloseReadinessCheck {
    code: string;
    passed: boolean;
    blocking: boolean;
    count: number;
    actionPath: string;
}

interface DayCloseReadiness {
    canClose: boolean;
    checks: DayCloseReadinessCheck[];
    blockedReasons: string[];
}

interface DayCloseReport {
    date: string;
    branchId: string;
    branchName?: string;
    dayCloseEmails?: string[];
    status: DayCloseStatus;
    closedBy?: string;
    closedAt?: Date;

    // Sales Summary
    salesSummary: {
        totalOrders: number;
        totalRevenue: number;
        totalTax: number;
        totalDiscount: number;
        netSales: number;
        averageOrderValue: number;
    };

    // Payment Breakdown
    paymentBreakdown: {
        method: string;
        count: number;
        total: number;
    }[];

    // Order Type Breakdown
    orderTypeBreakdown: {
        type: string;
        count: number;
        total: number;
    }[];

    // Audit Trail
    auditSummary: {
        totalEvents: number;
        voidCount: number;
        discountCount: number;
        refundCount: number;
    };

    // Fiscal health snapshot
    fiscalHealth?: {
        submitted: number;
        pending: number;
        failed: number;
        deadLettersPending: number;
    };

    // Finance exceptions snapshot (Sprint 3)
    financeHealth?: {
        pendingExceptions: number;
        resolvedExceptions: number;
    };

    // Side effect failures snapshot (Sprint 3)
    sideEffectHealth?: {
        failedFinance: number;
        failedFiscal: number;
        failedPrint: number;
        failedTotal: number;
    };

    readiness?: DayCloseReadiness;
}

interface EmailConfig {
    to: string[];
    cc?: string[];
    subject: string;
    includeReports: ('sales' | 'payments' | 'audit')[];
}

export const dayCloseService = {
    getDayBounds(date: string) {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        return { startOfDay, endOfDay };
    },

    getOrderDateFilter(date: string, startOfDay: Date, endOfDay: Date) {
        return sql`(${orders.businessDate} = ${date} OR (${orders.businessDate} IS NULL AND ${orders.createdAt} >= ${startOfDay} AND ${orders.createdAt} <= ${endOfDay}))`;
    },

    getOrderLinkedDateFilter(
        branchId: string,
        date: string,
        startOfDay: Date,
        endOfDay: Date,
        referenceColumn: any,
        createdAtColumn: any,
    ) {
        return sql`(
            exists (
                select 1 from ${orders} o
                where o.id = ${referenceColumn}
                  and o.branch_id = ${branchId}
                  and (
                    o.business_date = ${date}
                    or (o.business_date is null and ${createdAtColumn} >= ${startOfDay} and ${createdAtColumn} <= ${endOfDay})
                  )
            )
            or (
                not exists (select 1 from ${orders} o where o.id = ${referenceColumn})
                and ${createdAtColumn} >= ${startOfDay}
                and ${createdAtColumn} <= ${endOfDay}
            )
        )`;
    },

    async getClosedReport(branchId: string, date: string) {
        const [closed] = await db.select()
            .from(dayCloseReports)
            .where(and(eq(dayCloseReports.branchId, branchId), eq(dayCloseReports.date, date)))
            .limit(1);

        if (!closed) return null;

        const salesSnapshot = (closed.salesSnapshot as any) || {};
        const ordersSnapshot = (closed.ordersSnapshot as any) || {};
        const paymentsSnapshot = (closed.paymentsSnapshot as any) || {};
        const auditSnapshot = (closed.auditSnapshot as any) || {};

        return {
            date,
            branchId,
            status: 'CLOSED' as DayCloseStatus,
            closedBy: closed.closedBy,
            closedAt: closed.createdAt,
            notes: closed.notes,
            dayCloseReportId: closed.id,
            salesSummary: salesSnapshot.salesSummary || {
                totalOrders: Number(closed.totalOrders || 0),
                totalRevenue: Number(closed.totalRevenue || 0),
                totalTax: 0,
                totalDiscount: Number(closed.totalDiscounts || 0),
                netSales: Number(closed.totalRevenue || 0) - Number(closed.totalDiscounts || 0),
                averageOrderValue: Number(closed.totalOrders || 0) > 0 ? Number(closed.totalRevenue || 0) / Number(closed.totalOrders || 0) : 0,
            },
            paymentBreakdown: closed.paymentBreakdown || paymentsSnapshot.byMethod || [],
            orderTypeBreakdown: ordersSnapshot.byType || [],
            auditSummary: auditSnapshot.summary || {
                totalEvents: 0,
                voidCount: 0,
                discountCount: 0,
                refundCount: 0,
            },
            fiscalHealth: closed.fiscalSnapshot,
            financeHealth: closed.financeSnapshot,
            sideEffectHealth: closed.sideEffectSnapshot,
            readiness: {
                canClose: false,
                blockedReasons: ['DAY_ALREADY_CLOSED'],
                checks: [{
                    code: 'DAY_ALREADY_CLOSED',
                    passed: false,
                    blocking: true,
                    count: 1,
                    actionPath: '/day-close',
                }],
            },
            closedSnapshot: {
                sales: closed.salesSnapshot,
                orders: closed.ordersSnapshot,
                payments: closed.paymentsSnapshot,
                inventory: closed.inventorySnapshot,
                shifts: closed.shiftsSnapshot,
                fiscal: closed.fiscalSnapshot,
                finance: closed.financeSnapshot,
                sideEffects: closed.sideEffectSnapshot,
                audit: closed.auditSnapshot,
                operations: closed.operationalSnapshot,
            },
        };
    },

    /**
     * Generate day close report for a branch
     */
    async generateReport(branchId: string, date: string): Promise<DayCloseReport> {
        const { startOfDay, endOfDay } = this.getDayBounds(date);

        // Get branch info
        const [branch] = await db.select().from(branches).where(eq(branches.id, branchId));

        const dateFilter = this.getOrderDateFilter(date, startOfDay, endOfDay);
        const revenueRecognized = sql`(${orders.status} IN ('COMPLETED', 'DELIVERED') OR exists (select 1 from ${payments} p where p.order_id = ${orders.id} and p.status = 'COMPLETED'))`;

        // SQL aggregation: sales summary (Item 14 — no in-memory reduce)
        const [salesAgg] = await db.select({
            totalOrders: sql<number>`count(*)`,
            totalRevenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            totalTax: sql<number>`coalesce(sum(${orders.tax}), 0)`,
            totalDiscount: sql<number>`coalesce(sum(${orders.discount}), 0)`,
        }).from(orders).where(and(
            eq(orders.branchId, branchId),
            revenueRecognized,
            dateFilter,
        ));

        const totalOrders = Number(salesAgg?.totalOrders || 0);
        const totalRevenue = Number(salesAgg?.totalRevenue || 0);
        const totalTax = Number(salesAgg?.totalTax || 0);
        const totalDiscount = Number(salesAgg?.totalDiscount || 0);

        // SQL aggregation: payment breakdown
        const paymentRows = await db.select({
            method: payments.method,
            count: sql<number>`count(*)`,
            total: sql<number>`coalesce(sum(${payments.amount}), 0)`,
        }).from(payments)
            .innerJoin(orders, eq(payments.orderId, orders.id))
            .where(and(
                eq(orders.branchId, branchId),
                eq(payments.status, 'COMPLETED'),
                dateFilter,
            ))
            .groupBy(payments.method);

        // SQL aggregation: order type breakdown
        const orderTypeRows = await db.select({
            type: orders.type,
            count: sql<number>`count(*)`,
            total: sql<number>`coalesce(sum(${orders.total}), 0)`,
        }).from(orders).where(and(
            eq(orders.branchId, branchId),
            revenueRecognized,
            dateFilter,
        )).groupBy(orders.type);

        // SQL aggregation: audit counts
        const [auditAgg] = await db.select({
            totalEvents: sql<number>`count(*)`,
            voidCount: sql<number>`count(*) filter (where ${auditLogs.eventType} like '%VOID%' or ${auditLogs.eventType} like '%CANCEL%')`,
            discountCount: sql<number>`count(*) filter (where ${auditLogs.eventType} like '%DISCOUNT%')`,
            refundCount: sql<number>`count(*) filter (where ${auditLogs.eventType} like '%REFUND%')`,
        }).from(auditLogs).where(and(
            eq(auditLogs.branchId, branchId),
            gte(auditLogs.createdAt, startOfDay),
            lte(auditLogs.createdAt, endOfDay),
        ));

        return {
            date,
            branchId,
            branchName: branch?.name,
            dayCloseEmails: (branch?.dayCloseEmails as string[]) || [],
            status: 'OPEN',
            salesSummary: {
                totalOrders,
                totalRevenue,
                totalTax,
                totalDiscount,
                netSales: totalRevenue - totalDiscount,
                averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
            },
            paymentBreakdown: paymentRows.map(r => ({
                method: r.method || 'UNKNOWN',
                count: Number(r.count),
                total: Number(r.total),
            })),
            orderTypeBreakdown: orderTypeRows.map(r => ({
                type: r.type || 'UNKNOWN',
                count: Number(r.count),
                total: Number(r.total),
            })),
            auditSummary: {
                totalEvents: Number(auditAgg?.totalEvents || 0),
                voidCount: Number(auditAgg?.voidCount || 0),
                discountCount: Number(auditAgg?.discountCount || 0),
                refundCount: Number(auditAgg?.refundCount || 0),
            },
        };
    },

    async getFiscalHealth(branchId: string, date: string) {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        const [submittedRows, pendingRows, failedRows, deadLettersRows] = await Promise.all([
            db.select().from(fiscalLogs).where(and(
                eq(fiscalLogs.branchId, branchId),
                eq(fiscalLogs.status, 'SUBMITTED'),
                this.getOrderLinkedDateFilter(branchId, date, startOfDay, endOfDay, fiscalLogs.orderId, fiscalLogs.createdAt),
            )),
            db.select().from(fiscalLogs).where(and(
                eq(fiscalLogs.branchId, branchId),
                eq(fiscalLogs.status, 'PENDING'),
                this.getOrderLinkedDateFilter(branchId, date, startOfDay, endOfDay, fiscalLogs.orderId, fiscalLogs.createdAt),
            )),
            db.select().from(fiscalLogs).where(and(
                eq(fiscalLogs.branchId, branchId),
                eq(fiscalLogs.status, 'FAILED'),
                this.getOrderLinkedDateFilter(branchId, date, startOfDay, endOfDay, fiscalLogs.orderId, fiscalLogs.createdAt),
            )),
            db.select().from(etaDeadLetters).where(and(
                eq(etaDeadLetters.branchId, branchId),
                eq(etaDeadLetters.status, 'PENDING'),
                this.getOrderLinkedDateFilter(branchId, date, startOfDay, endOfDay, etaDeadLetters.orderId, etaDeadLetters.createdAt),
            )),
        ]);

        return {
            submitted: submittedRows.length,
            pending: pendingRows.length,
            failed: failedRows.length,
            deadLettersPending: deadLettersRows.length,
        };
    },

    /**
     * Sprint 3: Get finance exceptions health for a branch on a given date
     */
    async getFinanceHealth(branchId: string, date: string) {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        const [pendingRows, resolvedRows] = await Promise.all([
            db.select({ count: sql<number>`count(*)` }).from(financeExceptions).where(and(
                eq(financeExceptions.status, 'PENDING'),
                gte(financeExceptions.createdAt, startOfDay),
                lte(financeExceptions.createdAt, endOfDay),
            )),
            db.select({ count: sql<number>`count(*)` }).from(financeExceptions).where(and(
                eq(financeExceptions.status, 'RESOLVED'),
                gte(financeExceptions.createdAt, startOfDay),
                lte(financeExceptions.createdAt, endOfDay),
            )),
        ]);

        return {
            pendingExceptions: Number(pendingRows[0]?.count || 0),
            resolvedExceptions: Number(resolvedRows[0]?.count || 0),
        };
    },

    /**
     * Sprint 3: Get side effect failure count from domain_events for a date
     */
    async getSideEffectHealth(branchId: string, date: string) {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        const failedEvents = await db.select({
            type: domainEvents.type,
            count: sql<number>`count(*)`,
        }).from(domainEvents).where(and(
            like(domainEvents.type, 'side_effect.%.failed'),
            branchId ? eq(domainEvents.branchId, branchId) : undefined,
            gte(domainEvents.createdAt, startOfDay),
            lte(domainEvents.createdAt, endOfDay),
        )).groupBy(domainEvents.type);

        const failedFinance = Number(failedEvents.find(e => e.type === 'side_effect.finance.failed')?.count || 0);
        const failedFiscal = Number(failedEvents.find(e => e.type === 'side_effect.fiscal.failed')?.count || 0);
        const failedPrint = Number(failedEvents.find(e => e.type === 'side_effect.print.failed')?.count || 0);

        return {
            failedFinance,
            failedFiscal,
            failedPrint,
            failedTotal: failedFinance + failedFiscal + failedPrint,
        };
    },

    async getCloseReadiness(branchId: string, date: string): Promise<DayCloseReadiness> {
        const { startOfDay, endOfDay } = this.getDayBounds(date);

        const [fiscalHealth, financeHealth, openShiftRows, unpaidOrderRows] = await Promise.all([
            this.getFiscalHealth(branchId, date),
            this.getFinanceHealth(branchId, date),
            db.select({ count: sql<number>`count(*)` })
                .from(shifts)
                .where(and(
                    eq(shifts.branchId, branchId),
                    eq(shifts.status, 'OPEN'),
                    sql`${shifts.openingTime} <= ${endOfDay}`,
                    sql`(${shifts.closingTime} IS NULL OR ${shifts.closingTime} >= ${startOfDay})`,
                )),
            db.select({ count: sql<number>`count(*)` })
                .from(orders)
                .where(and(
                    eq(orders.branchId, branchId),
                    sql`${orders.status} IN ('COMPLETED', 'DELIVERED')`,
                    eq(orders.isPaid, false),
                    sql`(${orders.businessDate} = ${date} OR (${orders.businessDate} IS NULL AND ${orders.createdAt} >= ${startOfDay} AND ${orders.createdAt} <= ${endOfDay}))`,
                )),
        ]);

        const fiscalIssueCount = fiscalHealth.pending + fiscalHealth.failed + fiscalHealth.deadLettersPending;
        const openShiftCount = Number(openShiftRows[0]?.count || 0);
        const unpaidOrderCount = Number(unpaidOrderRows[0]?.count || 0);

        const checks: DayCloseReadinessCheck[] = [
            {
                code: 'FISCAL_NOT_CLEAN_FOR_DAY_CLOSE',
                passed: fiscalIssueCount === 0,
                blocking: true,
                count: fiscalIssueCount,
                actionPath: '/fiscal',
            },
            {
                code: 'FINANCE_EXCEPTIONS_PENDING_FOR_DAY_CLOSE',
                passed: financeHealth.pendingExceptions === 0,
                blocking: false,
                count: financeHealth.pendingExceptions,
                actionPath: '/finance',
            },
            {
                code: 'OPEN_SHIFTS_EXIST_FOR_DAY_CLOSE',
                passed: openShiftCount === 0,
                blocking: true,
                count: openShiftCount,
                actionPath: '/attendance',
            },
            {
                code: 'UNPAID_ORDERS_EXIST_FOR_DAY_CLOSE',
                passed: unpaidOrderCount === 0,
                blocking: true,
                count: unpaidOrderCount,
                actionPath: '/orders',
            },
        ];

        const blockedReasons = checks
            .filter(check => check.blocking && !check.passed)
            .map(check => check.code);

        return {
            canClose: blockedReasons.length === 0,
            checks,
            blockedReasons,
        };
    },

    async generateOperationalSnapshot(branchId: string, date: string, report: DayCloseReport) {
        const { startOfDay, endOfDay } = this.getDayBounds(date);
        const dateFilter = this.getOrderDateFilter(date, startOfDay, endOfDay);

        const [
            orderStatusRows,
            paymentStatusRows,
            refundAggRows,
            shiftRows,
            movementRows,
            stockRows,
        ] = await Promise.all([
            db.select({
                status: orders.status,
                count: sql<number>`count(*)`,
                total: sql<number>`coalesce(sum(${orders.total}), 0)`,
            }).from(orders).where(and(
                eq(orders.branchId, branchId),
                dateFilter,
            )).groupBy(orders.status),

            db.select({
                status: payments.status,
                count: sql<number>`count(*)`,
                total: sql<number>`coalesce(sum(${payments.amount}), 0)`,
            }).from(payments)
                .innerJoin(orders, eq(payments.orderId, orders.id))
                .where(and(eq(orders.branchId, branchId), dateFilter))
                .groupBy(payments.status),

            db.select({
                count: sql<number>`count(*)`,
                total: sql<number>`coalesce(sum(${refundRecords.amount}), 0)`,
            }).from(refundRecords).where(and(
                eq(refundRecords.branchId, branchId),
                gte(refundRecords.createdAt, startOfDay),
                lte(refundRecords.createdAt, endOfDay),
            )),

            db.select({
                status: shifts.status,
                count: sql<number>`count(*)`,
                expectedCash: sql<number>`coalesce(sum(${shifts.expectedBalance}), 0)`,
                actualCash: sql<number>`coalesce(sum(${shifts.actualBalance}), 0)`,
                variance: sql<number>`coalesce(sum(${shifts.actualBalance} - ${shifts.expectedBalance}), 0)`,
            }).from(shifts).where(and(
                eq(shifts.branchId, branchId),
                sql`(${shifts.openingTime} <= ${endOfDay} AND (${shifts.closingTime} IS NULL OR ${shifts.closingTime} >= ${startOfDay}))`,
            )).groupBy(shifts.status),

            db.select({
                type: stockMovements.type,
                count: sql<number>`count(*)`,
                quantity: sql<number>`coalesce(sum(abs(${stockMovements.quantity})), 0)`,
                totalCost: sql<number>`coalesce(sum(${stockMovements.totalCost}), 0)`,
            }).from(stockMovements)
                .where(and(
                    sql`exists (
                        select 1 from ${warehouses} w
                        where w.branch_id = ${branchId}
                        and (w.id = ${stockMovements.fromWarehouseId} or w.id = ${stockMovements.toWarehouseId})
                    )`,
                    this.getOrderLinkedDateFilter(branchId, date, startOfDay, endOfDay, stockMovements.referenceId, stockMovements.createdAt),
                ))
                .groupBy(stockMovements.type),

            db.select({
                itemCount: sql<number>`count(distinct ${inventoryStock.itemId})`,
                totalQuantity: sql<number>`coalesce(sum(${inventoryStock.quantity}), 0)`,
                totalValue: sql<number>`coalesce(sum(${inventoryStock.quantity} * coalesce(${inventoryItems.costPrice}, 0)), 0)`,
                lowStockCount: sql<number>`count(*) filter (where ${inventoryStock.quantity} <= coalesce(${inventoryItems.threshold}, 0))`,
            }).from(inventoryStock)
                .innerJoin(warehouses, eq(inventoryStock.warehouseId, warehouses.id))
                .innerJoin(inventoryItems, eq(inventoryStock.itemId, inventoryItems.id))
                .where(eq(warehouses.branchId, branchId)),
        ]);

        const totalRefunds = Number(refundAggRows[0]?.total || 0);
        const shiftExpectedCash = shiftRows.reduce((sum, row) => sum + Number(row.expectedCash || 0), 0);
        const shiftActualCash = shiftRows.reduce((sum, row) => sum + Number(row.actualCash || 0), 0);

        return {
            salesSnapshot: {
                salesSummary: report.salesSummary,
                orderTypeBreakdown: report.orderTypeBreakdown,
                refunds: {
                    count: Number(refundAggRows[0]?.count || 0),
                    total: totalRefunds,
                },
            },
            ordersSnapshot: {
                total: orderStatusRows.reduce((sum, row) => sum + Number(row.count || 0), 0),
                byStatus: orderStatusRows.map(row => ({
                    status: row.status || 'UNKNOWN',
                    count: Number(row.count || 0),
                    total: Number(row.total || 0),
                })),
                byType: report.orderTypeBreakdown,
            },
            paymentsSnapshot: {
                byMethod: report.paymentBreakdown,
                byStatus: paymentStatusRows.map(row => ({
                    status: row.status || 'UNKNOWN',
                    count: Number(row.count || 0),
                    total: Number(row.total || 0),
                })),
            },
            inventorySnapshot: {
                currentStock: {
                    itemCount: Number(stockRows[0]?.itemCount || 0),
                    totalQuantity: Number(stockRows[0]?.totalQuantity || 0),
                    totalValue: Number(stockRows[0]?.totalValue || 0),
                    lowStockCount: Number(stockRows[0]?.lowStockCount || 0),
                },
                movements: movementRows.map(row => ({
                    type: row.type || 'UNKNOWN',
                    count: Number(row.count || 0),
                    quantity: Number(row.quantity || 0),
                    totalCost: Number(row.totalCost || 0),
                })),
            },
            shiftsSnapshot: {
                byStatus: shiftRows.map(row => ({
                    status: row.status || 'UNKNOWN',
                    count: Number(row.count || 0),
                    expectedCash: Number(row.expectedCash || 0),
                    actualCash: Number(row.actualCash || 0),
                    variance: Number(row.variance || 0),
                })),
                expectedCash: shiftExpectedCash,
                actualCash: shiftActualCash,
                variance: shiftActualCash - shiftExpectedCash,
            },
            operationalSnapshot: {
                businessDate: date,
                branchId,
                generatedAt: new Date().toISOString(),
                totals: {
                    orders: report.salesSummary.totalOrders,
                    revenue: report.salesSummary.totalRevenue,
                    netSales: report.salesSummary.netSales,
                    refunds: totalRefunds,
                    stockMovementTypes: movementRows.length,
                    activeStockItems: Number(stockRows[0]?.itemCount || 0),
                },
            },
        };
    },

    /**
     * Close the day for a branch
     * Sprint 3: Added hard gates for finance exceptions and fiscal health
     */
    async closeDay(
        branchId: string,
        date: string,
        userId: string,
        options?: {
            emailConfig?: EmailConfig;
            notes?: string;
            enforceFiscalClean?: boolean;
            enforceFinanceClean?: boolean;
            enforceShiftsClosed?: boolean;
            enforceAllPaid?: boolean;
            overrideReason?: string; // Item 22: override with written reason
        }
    ) {
        const existingClose = await this.getClosedReport(branchId, date);
        if (existingClose) {
            const err = new Error('DAY_ALREADY_CLOSED');
            (err as any).closedReport = existingClose;
            throw err;
        }

        const report = await this.generateReport(branchId, date);
        const fiscalHealth = await this.getFiscalHealth(branchId, date);
        const financeHealth = await this.getFinanceHealth(branchId, date);
        const sideEffectHealth = await this.getSideEffectHealth(branchId, date);
        const { startOfDay, endOfDay } = this.getDayBounds(date);

        // Collect all blocked reasons instead of throwing on first failure
        const blockedReasons: string[] = [];

        // === GATE 1: Fiscal health ===
        if (options?.enforceFiscalClean && (fiscalHealth.failed > 0 || fiscalHealth.pending > 0 || fiscalHealth.deadLettersPending > 0)) {
            blockedReasons.push('FISCAL_NOT_CLEAN_FOR_DAY_CLOSE');
        }

        // Finance exceptions are accounting follow-up, not an operations day-close blocker.

        // === GATE 3: Open shifts ===
        if (options?.enforceShiftsClosed) {
            const openShifts = await db.select({ count: sql<number>`count(*)` })
                .from(shifts)
                .where(and(
                    eq(shifts.branchId, branchId),
                    eq(shifts.status, 'OPEN'),
                    sql`${shifts.openingTime} <= ${endOfDay}`,
                    sql`(${shifts.closingTime} IS NULL OR ${shifts.closingTime} >= ${startOfDay})`,
                ));
            if (Number(openShifts[0]?.count || 0) > 0) {
                blockedReasons.push('OPEN_SHIFTS_EXIST_FOR_DAY_CLOSE');
            }
        }

        // === GATE 4: Unpaid completed orders ===
        if (options?.enforceAllPaid) {
            const unpaidOrders = await db.select({ count: sql<number>`count(*)` })
                .from(orders)
                .where(and(
                    eq(orders.branchId, branchId),
                    sql`${orders.status} IN ('COMPLETED', 'DELIVERED')`,
                    eq(orders.isPaid, false),
                    sql`(${orders.businessDate} = ${date} OR (${orders.businessDate} IS NULL AND ${orders.createdAt} >= ${startOfDay} AND ${orders.createdAt} <= ${endOfDay}))`,
                ));
            if (Number(unpaidOrders[0]?.count || 0) > 0) {
                blockedReasons.push('UNPAID_ORDERS_EXIST_FOR_DAY_CLOSE');
            }
        }

        // If there are blocked reasons, handle override or reject
        if (blockedReasons.length > 0) {
            if (!options?.overrideReason) {
                const err = new Error('DAY_CLOSE_BLOCKED');
                (err as any).blockedReasons = blockedReasons;
                throw err;
            }

            // Override allowed: log the override in audit trail
            await createSignedAuditLog({
                eventType: 'DAY_CLOSE_OVERRIDE',
                userId,
                branchId,
                payload: {
                    date,
                    blockedReasons,
                    overrideReason: options.overrideReason,
                },
            });
        }

        // Mark as closed
        report.status = 'CLOSED';
        report.closedBy = userId;
        report.closedAt = new Date();
        report.fiscalHealth = fiscalHealth;
        report.financeHealth = financeHealth;
        report.sideEffectHealth = sideEffectHealth;

        const snapshot = await this.generateOperationalSnapshot(branchId, date, report);
        const dayCloseReportId = `dayclose_${branchId}_${date}`;

        try {
            await db.insert(dayCloseReports).values({
                id: dayCloseReportId,
                branchId,
                closedBy: userId,
                date,
                expectedCash: snapshot.shiftsSnapshot.expectedCash,
                actualCash: snapshot.shiftsSnapshot.actualCash,
                variance: snapshot.shiftsSnapshot.variance,
                paymentBreakdown: report.paymentBreakdown.map(row => ({
                    method: row.method,
                    expected: row.total,
                    actual: row.total,
                })),
                totalOrders: report.salesSummary.totalOrders,
                totalRevenue: report.salesSummary.totalRevenue,
                totalRefunds: snapshot.salesSnapshot.refunds.total,
                totalDiscounts: report.salesSummary.totalDiscount,
                salesSnapshot: snapshot.salesSnapshot,
                ordersSnapshot: snapshot.ordersSnapshot,
                paymentsSnapshot: snapshot.paymentsSnapshot,
                inventorySnapshot: snapshot.inventorySnapshot,
                shiftsSnapshot: snapshot.shiftsSnapshot,
                fiscalSnapshot: fiscalHealth,
                financeSnapshot: financeHealth,
                sideEffectSnapshot: sideEffectHealth,
                auditSnapshot: { summary: report.auditSummary },
                operationalSnapshot: snapshot.operationalSnapshot,
                status: 'CLOSED',
                notes: options?.notes,
            });
        } catch (error: any) {
            if (error?.code === '23505') {
                const err = new Error('DAY_ALREADY_CLOSED');
                (err as any).closedReport = await this.getClosedReport(branchId, date);
                throw err;
            }
            throw error;
        }

        // Log the day close event only after the immutable report snapshot is saved.
        await createSignedAuditLog({
            eventType: 'DAY_CLOSED',
            userId,
            branchId,
            payload: {
                date,
                report: {
                    totalOrders: report.salesSummary.totalOrders,
                    totalRevenue: report.salesSummary.totalRevenue,
                    netSales: report.salesSummary.netSales,
                },
                fiscalHealth,
                financeHealth,
                sideEffectHealth,
                notes: options?.notes,
                overrideReason: options?.overrideReason,
                blockedReasons: blockedReasons.length > 0 ? blockedReasons : undefined,
            },
        });

        // Send email if configured
        if (options?.emailConfig) {
            await this.sendDayCloseEmail(report, options.emailConfig);
        }

        // Advance to next business date automatically
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        const nextBusinessDate = nextDate.toISOString().split('T')[0];
        
        await db.update(branches)
            .set({ businessDate: nextBusinessDate })
            .where(eq(branches.id, branchId));

        return report;
    },

    /**
     * Send day close email report
     */
    async sendDayCloseEmail(report: DayCloseReport, config: EmailConfig) {
        
        // Resolve Target Emails - If empty, fallback to Branch's default list
        let targetEmails = config.to && config.to.length > 0 ? config.to : (report.dayCloseEmails || []);
        if (targetEmails.length === 0) {
            return { sent: false, error: 'NO_RECIPIENTS_CONFIGURED' };
        }

        // We'll also keep a short text summary but attach the beautiful PDF
        const emailBody = `
# Day Close Complete
Date: ${report.date}
Branch: ${report.branchName || report.branchId}
Closed At: ${report.closedAt ? report.closedAt.toLocaleString() : new Date().toLocaleString()}

Please find the detailed End Of Day Report attached as a PDF document.
        `;

        try {
            // Generate PDF Buffer
            const pdfBuffer = await generateDayClosePDF(report);

            const filename = `Coduis Zen_EOD_${(report.branchName || report.branchId).replace(/[^a-z0-9]/gi, '_')}_${report.date}.pdf`;

            const result = await emailService.sendTextMail({
                to: targetEmails,
                cc: config.cc,
                subject: config.subject || `EOD Report - ${report.branchName} - ${report.date}`,
                text: emailBody,
                attachments: [
                    {
                        filename,
                        content: pdfBuffer
                    }
                ]
            });

            return { sent: true, recipients: targetEmails, messageId: result.messageId };
        } catch (error: any) {
            return { sent: false, error: error.message };
        }
    },

    /**
     * Get day close history for a branch
     */
    async getCloseHistory(branchId: string, limit = 30) {
        const closeRows = await db.select()
            .from(dayCloseReports)
            .where(eq(dayCloseReports.branchId, branchId))
            .orderBy(desc(dayCloseReports.createdAt))
            .limit(limit);

        return closeRows.map(row => ({
            id: row.id,
            date: row.date,
            closedBy: row.closedBy,
            closedAt: row.createdAt,
            status: row.status,
            summary: {
                totalOrders: row.totalOrders || 0,
                totalRevenue: row.totalRevenue || 0,
                netSales: ((row.salesSnapshot as any)?.salesSummary?.netSales) || 0,
                totalRefunds: row.totalRefunds || 0,
                totalDiscounts: row.totalDiscounts || 0,
            },
            fiscalHealth: row.fiscalSnapshot,
            inventory: (row.inventorySnapshot as any)?.currentStock,
            shifts: row.shiftsSnapshot,
        }));
    },
};

export default dayCloseService;
