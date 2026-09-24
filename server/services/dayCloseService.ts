/**
 * Day Close Service - End of Day Processing
 * Handles day closing, report generation, and email dispatch
 */

import { db } from '../db';
import logger from '../utils/logger';
import {
    orders,
    payments,
    paymentSessions,
    branches,
    auditLogs,
    fiscalLogs,
    etaDeadLetters,
    financeExceptions,
    domainEvents,
    shifts,
    users,
    dayCloseReports,
    stockMovements,
    inventoryStock,
    inventoryItems,
    warehouses,
    refundRecords,
    settings,
    stockCounts,
    driverCashLedger,
    drivers,
    journalEntries,
    journalLines,
    chartOfAccounts,
    costCenters,
    tables,
    kdsTickets,
    orderStatusHistory,
} from '../../src/db/schema';
import { eq, and, gte, lte, desc, sql, like, or } from 'drizzle-orm';
import { createSignedAuditLog } from './auditService';
import { emailService } from './emailService';
import { generateDayClosePDF } from './pdfService';
import { sendWhatsAppText } from './whatsappService';
import { getBusinessDateBounds } from '../utils/businessDate';
import { revenueRecognizedOrder } from '../utils/orderRevenue';
import { reconcilePaymentRows } from './paymentReconciliation';
import { emitBranchEvent } from '../utils/socketEmit';

// Day close status
type DayCloseStatus = 'OPEN' | 'CLOSING' | 'CLOSED';

const toSqlDate = (date: string | Date) => {
    const datePart = date instanceof Date ? date.toISOString().split('T')[0] : String(date).split('T')[0];
    return new Date(`${datePart}T00:00:00.000Z`);
};

const releaseBranchTables = async (branchId: string) => {
    const branchTables = await db.select({ id: tables.id }).from(tables).where(eq(tables.branchId, branchId));
    const now = new Date();
    await db.update(tables)
        .set({ status: 'AVAILABLE', currentOrderId: null, lockedByUserId: null, updatedAt: now })
        .where(eq(tables.branchId, branchId));
    for (const table of branchTables) {
        emitBranchEvent(branchId, 'table:status', { id: table.id, status: 'AVAILABLE', currentOrderId: null, lockedByUserId: null });
    }
};

const ACTIVE_ORDER_STATUSES = ['PENDING', 'PREPARING', 'READY', 'SERVED', 'OUT_FOR_DELIVERY'];

/**
 * Clears kitchen + pickup screens at day close: every open KDS ticket is
 * delivered and every remaining operational order is finalized, so the next
 * business day starts with empty displays and no stale 409 handover conflicts.
 */
const autoFinalizeOperationalOrders = async (branchId: string, userId: string) => {
    const now = new Date();

    const openTicketRows = await db.select({ id: kdsTickets.id })
        .from(kdsTickets)
        .where(and(
            eq(kdsTickets.branchId, branchId),
            sql`${kdsTickets.status} NOT IN ('DELIVERED', 'CANCELLED')`,
        ));
    if (openTicketRows.length > 0) {
        await db.update(kdsTickets)
            .set({ status: 'DELIVERED', updatedAt: now })
            .where(and(
                eq(kdsTickets.branchId, branchId),
                sql`${kdsTickets.status} NOT IN ('DELIVERED', 'CANCELLED')`,
            ));
    }

    const activeOrderRows = await db.select({ id: orders.id, type: orders.type, tableId: orders.tableId })
        .from(orders)
        .where(and(eq(orders.branchId, branchId), sql`${orders.status} IN ('PENDING', 'PREPARING', 'READY', 'SERVED', 'OUT_FOR_DELIVERY')`));

    for (const order of activeOrderRows) {
        const nextStatus = String(order.type || '').toUpperCase() === 'DINE_IN' ? 'COMPLETED' : 'DELIVERED';
        await db.update(orders)
            .set({
                status: nextStatus,
                ...(nextStatus === 'DELIVERED' ? { actualDeliveryTime: now } : {}),
                ...(nextStatus === 'COMPLETED' ? { completedAt: now } : {}),
                updatedAt: now,
            })
            .where(eq(orders.id, order.id));
        await db.insert(orderStatusHistory).values({
            orderId: order.id,
            status: nextStatus,
            changedBy: userId,
            notes: 'Auto finalized on day close',
            createdAt: now,
        });
        if (nextStatus === 'COMPLETED' && order.tableId) {
            await db.update(tables)
                .set({ status: 'AVAILABLE', currentOrderId: null, lockedByUserId: null, updatedAt: now })
                .where(eq(tables.id, order.tableId));
        }
        emitBranchEvent(branchId, 'order:status', { id: order.id, status: nextStatus });
    }

    if (openTicketRows.length > 0 || activeOrderRows.length > 0) {
        emitBranchEvent(branchId, 'kds:update', { reason: 'DAY_CLOSE_FINALIZED' });
        await createSignedAuditLog({
            eventType: 'DAY_CLOSE_AUTO_FINALIZED_OPERATIONS',
            userId,
            branchId,
            payload: {
                clearedKdsTickets: openTicketRows.length,
                finalizedOrders: activeOrderRows.map(order => order.id),
            },
        });
    }
};

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
    openShifts?: Array<{ id: string; userId: string; userName: string; openingBalance: number; openingTime?: Date | string | null }>;
}

interface DayCloseReport {
    date: string;
    branchId: string;
    branchName?: string;
    dayCloseEmails?: string[];
    currency?: string;
    status: DayCloseStatus;
    closedBy?: string;
    closedAt?: Date;

    // Sales Summary
    salesSummary: {
        totalOrders: number;
        totalRevenue: number;
        /** Collected revenue incl. tax/service/delivery (codebase convention: grossSales = sum(total)). */
        grossSales: number;
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

    // Call-center + channel breakdown (orders carry source + isCallCenterOrder).
    // Day close stays per-branch (includes call-center), this split only
    // explains how much of the branch day came from the call center vs POS
    // vs each aggregator platform.
    channelBreakdown?: {
        source: string;
        count: number;
        total: number;
    }[];
    callCenterSummary?: {
        orders: number;
        revenue: number;
        platformOrders: number;
        platformRevenue: number;
    };

    // Cash physically in the drawer for orders excluded from revenue.
    cancelledPaidSummary?: {
        orders: number;
        total: number;
    };

    // Pilot pocket cash (COLLECT minus SETTLE) — not in any drawer yet.
    driverCashOutstanding?: Array<{
        driverId: string;
        driverName: string;
        outstanding: number;
    }>;

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

    financeSummary?: {
        expenses: number;
        pendingExpenses: number;
        netProfit: number;
        topExpenses: { name: string; total: number }[];
        expenseRows: { date: Date | string | null; name: string; description: string | null; reference: string | null; total: number }[];
    };

    // Side effect failures snapshot (Sprint 3)
    sideEffectHealth?: {
        failedFinance: number;
        failedFiscal: number;
        failedPrint: number;
        failedTotal: number;
    };

    readiness?: DayCloseReadiness;
    whatsappDelivery?: {
        queued: number;
        recipients: string[];
    };
}

const getSettingValue = async <T>(key: string, fallback: T): Promise<T> => {
    const [row] = await db.select({ value: settings.value }).top(1).from(settings).where(eq(settings.key, key));
    return (row?.value as T | undefined) ?? fallback;
};

const getDayCloseRequireStockCount = () => getSettingValue<boolean>('dayCloseRequireStockCount', true);
const getDayCloseWhatsappRecipients = () => getSettingValue<string[]>('dayCloseWhatsappRecipients', []);

const normalizeRecipients = (items?: string[]) => (items || [])
    .map((item) => String(item || '').trim())
    .filter((item) => /^\+?\d{10,15}$/.test(item.replace(/[\s()-]/g, '')));

const localDateKey = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const isValidDateKey = (date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};

const buildDayCloseWhatsAppText = (report: DayCloseReport) => {
    const sales = report.salesSummary;
    return [
        `Day Close ${report.date}`,
        `Branch: ${report.branchName || report.branchId}`,
        `Orders: ${sales.totalOrders}`,
        `Revenue: ${Number(sales.totalRevenue || 0).toLocaleString()} ${report.currency || 'EGP'}`,
        `Net Sales: ${Number(sales.netSales || 0).toLocaleString()} ${report.currency || 'EGP'}`,
        `Closed By: ${report.closedBy || 'system'}`,
    ].join('\n');
};

interface EmailConfig {
    to: string[];
    cc?: string[];
    subject: string;
    includeReports: ('sales' | 'payments' | 'audit')[];
}

export const dayCloseService = {
    getDayBounds(date: string, timeZone = 'Africa/Cairo') {
        return getBusinessDateBounds(date, timeZone);
    },

    async getBranchDayBounds(branchId: string, date: string) {
        const [branch] = await db.select({ timezone: branches.timezone })
            .from(branches)
            .where(eq(branches.id, branchId))
            .top(1);
        if (!branch) throw new Error('BRANCH_NOT_FOUND');
        return this.getDayBounds(date, branch.timezone || 'Africa/Cairo');
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
        const [[closed], [branch]] = await Promise.all([
            db.select()
                .from(dayCloseReports)
                .where(and(eq(dayCloseReports.branchId, branchId), eq(dayCloseReports.date, toSqlDate(date))))
                .top(1),
            db.select({ name: branches.name, currency: branches.currency })
                .from(branches)
                .where(eq(branches.id, branchId))
                .top(1),
        ]);

        if (!closed) return null;

        const salesSnapshot = (closed.salesSnapshot as any) || {};
        const ordersSnapshot = (closed.ordersSnapshot as any) || {};
        const paymentsSnapshot = (closed.paymentsSnapshot as any) || {};
        const auditSnapshot = (closed.auditSnapshot as any) || {};

        return {
            date,
            branchId,
            branchName: branch?.name,
            status: 'CLOSED' as DayCloseStatus,
            closedBy: closed.closedBy,
            closedAt: closed.createdAt,
            notes: closed.notes,
            currency: salesSnapshot.currency || branch?.currency || 'EGP',
            dayCloseReportId: closed.id,
            salesSummary: salesSnapshot.salesSummary || {
                totalOrders: Number(closed.totalOrders || 0),
                totalRevenue: Number(closed.totalRevenue || 0),
                grossSales: Number(closed.totalRevenue || 0),
                totalTax: 0,
                totalDiscount: Number(closed.totalDiscounts || 0),
                // Legacy rows predate the merchandise-gross column: the stored
                // total is already net of discount, so it must NOT be reduced
                // a second time here.
                netSales: Number(closed.totalRevenue || 0),
                averageOrderValue: Number(closed.totalOrders || 0) > 0 ? Number(closed.totalRevenue || 0) / Number(closed.totalOrders || 0) : 0,
            },
            paymentBreakdown: paymentsSnapshot.byMethod || [],
            orderTypeBreakdown: ordersSnapshot.byType || [],
            auditSummary: auditSnapshot.summary || {
                totalEvents: 0,
                voidCount: 0,
                discountCount: 0,
                refundCount: 0,
            },
            fiscalHealth: closed.fiscalSnapshot,
            financeHealth: closed.financeSnapshot,
            financeSummary: (closed.financeSnapshot as any)?.summary,
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
        const { startOfDay, endOfDay } = await this.getBranchDayBounds(branchId, date);

        // Get branch info
        const [branch] = await db.select().from(branches).where(eq(branches.id, branchId));

        const dateFilter = this.getOrderDateFilter(date, startOfDay, endOfDay);
        const revenueRecognized = revenueRecognizedOrder();

        // SQL aggregation: sales summary (Item 14 — no in-memory reduce).
        // NOTE: orders.total is stored NET of discount (see orderController:
        // total = subtotal - discount + tax + service + delivery), so netSales
        // must be derived from subtotal, never as totalRevenue - totalDiscount
        // (that would subtract the discount twice).
        const [salesAgg] = await db.select({
            totalOrders: sql<number>`count(*)`,
            totalRevenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            grossMerchandise: sql<number>`coalesce(sum(${orders.subtotal}), 0)`,
            totalTax: sql<number>`coalesce(sum(${orders.tax}), 0)`,
            totalDiscount: sql<number>`coalesce(sum(${orders.discount}), 0)`,
        }).from(orders).where(and(
            eq(orders.branchId, branchId),
            revenueRecognized,
            dateFilter,
        ));

        const totalOrders = Number(salesAgg?.totalOrders || 0);
        const totalRevenue = Number(salesAgg?.totalRevenue || 0);
        const grossMerchandise = Number(salesAgg?.grossMerchandise || 0);
        const totalTax = Number(salesAgg?.totalTax || 0);
        const totalDiscount = Number(salesAgg?.totalDiscount || 0);

        // SQL aggregation: payment breakdown.
        // NOTE: unlike the sales summary, this intentionally counts payments of
        // CANCELLED orders too (see cancelledRevenueFlow test): cancelling only
        // patches the order status while its COMPLETED payment rows stay — the
        // cash is physically in the drawer, so tender reconciliation must retain
        // it. Revenue and payments therefore differ by cancelled-paid amounts
        // by design; the audit/cancelled counts explain the gap.
        const legacyPaymentRows = await db.select({
            orderId: payments.orderId,
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
            .groupBy(payments.orderId, payments.method);
        let sessionPaymentRows: Array<{ orderId: string; method: string | null; count: number; total: number }> = [];
        try {
            sessionPaymentRows = await db.select({
                orderId: paymentSessions.orderId,
                method: paymentSessions.providerType,
                count: sql<number>`count(*)`,
                total: sql<number>`coalesce(sum(${paymentSessions.amount}), 0)`,
            }).from(paymentSessions)
                .innerJoin(orders, eq(paymentSessions.orderId, orders.id))
                .where(and(
                    eq(orders.branchId, branchId),
                    eq(paymentSessions.status, 'confirmed'),
                    dateFilter,
                ))
                .groupBy(paymentSessions.orderId, paymentSessions.providerType);
        } catch {
            // ponytail: legacy databases may not have payment_sessions yet.
        }
        const paymentRows = reconcilePaymentRows(
            legacyPaymentRows.map(row => ({ ...row, count: Number(row.count), total: Number(row.total) })),
            sessionPaymentRows.map(row => ({ ...row, count: Number(row.count), total: Number(row.total) })),
        );

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

        // SQL aggregation: channel/source breakdown (call-center vs POS vs
        // each aggregator platform). A non-restaurant delivery_source
        // (talabat, elmenus…) identifies the aggregator (POS convention);
        // otherwise the origin: call_center, pos, …
        const channelKey = sql<string>`case when ${orders.deliverySource} is not null and ${orders.deliverySource} <> 'restaurant' then ${orders.deliverySource} else coalesce(${orders.source}, 'UNKNOWN') end`;
        const channelRows = await db.select({
            source: channelKey,
            count: sql<number>`count(*)`,
            total: sql<number>`coalesce(sum(${orders.total}), 0)`,
        }).from(orders).where(and(
            eq(orders.branchId, branchId),
            revenueRecognized,
            dateFilter,
        )).groupBy(channelKey);

        const [callCenterAgg] = await db.select({
            orders: sql<number>`sum(case when ${orders.isCallCenterOrder} = 1 then 1 else 0 end)`,
            revenue: sql<number>`coalesce(sum(case when ${orders.isCallCenterOrder} = 1 then ${orders.total} else 0 end), 0)`,
            platformOrders: sql<number>`sum(case when ${orders.isCallCenterOrder} = 1 and ${orders.deliverySource} is not null and ${orders.deliverySource} <> 'restaurant' then 1 else 0 end)`,
            platformRevenue: sql<number>`coalesce(sum(case when ${orders.isCallCenterOrder} = 1 and ${orders.deliverySource} is not null and ${orders.deliverySource} <> 'restaurant' then ${orders.total} else 0 end), 0)`,
        }).from(orders).where(and(
            eq(orders.branchId, branchId),
            revenueRecognized,
            dateFilter,
        ));

        const expenseBranchFilter = branchId ? or(eq(costCenters.branchId, branchId), sql`${journalLines.costCenterId} is null`) : undefined;

        // journalEntries.date is written by the driver as a UTC instant (JS
        // Date), NOT local wall-time — so a FORMAT-to-local-day comparison
        // silently drops entries written near midnight (proven: entries at
        // 02:19 local read back as previous-day UTC). Compare as instants
        // against the branch-TZ day bounds, exactly like the dashboard and
        // finance reports do, so all three always agree.
        const entryInstantFilter = [gte(journalEntries.date, startOfDay), lte(journalEntries.date, endOfDay)];

        const [auditAgg, expenseAgg, pendingExpenseAgg, topExpenseRows, expenseRows] = await Promise.all([
            db.select({
            totalEvents: sql<number>`count(*)`,
                voidCount: sql<number>`sum(case when ${auditLogs.eventType} like '%VOID%' or ${auditLogs.eventType} like '%CANCEL%' then 1 else 0 end)`,
                discountCount: sql<number>`sum(case when ${auditLogs.eventType} like '%DISCOUNT%' then 1 else 0 end)`,
                refundCount: sql<number>`sum(case when ${auditLogs.eventType} like '%REFUND%' then 1 else 0 end)`,
            }).from(auditLogs).where(and(
                eq(auditLogs.branchId, branchId),
                gte(auditLogs.createdAt, startOfDay),
                lte(auditLogs.createdAt, endOfDay),
            )).then(rows => rows[0]),
            db.select({
                total: sql<number>`coalesce(sum(${journalLines.debit} - ${journalLines.credit}), 0)`,
            }).from(journalLines)
                .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
                .innerJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
                .leftJoin(costCenters, eq(journalLines.costCenterId, costCenters.id))
                .where(and(...entryInstantFilter, eq(journalEntries.status, 'POSTED'), eq(journalEntries.referenceType, 'EXPENSE'), eq(chartOfAccounts.type, 'EXPENSE'), expenseBranchFilter))
                .then(rows => rows[0]),
            db.select({
                total: sql<number>`coalesce(sum(${journalLines.debit} - ${journalLines.credit}), 0)`,
            }).from(journalLines)
                .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
                .innerJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
                .leftJoin(costCenters, eq(journalLines.costCenterId, costCenters.id))
                .where(and(...entryInstantFilter, eq(journalEntries.status, 'PENDING_APPROVAL'), eq(journalEntries.referenceType, 'EXPENSE'), eq(chartOfAccounts.type, 'EXPENSE'), expenseBranchFilter))
                .then(rows => rows[0]),
            db.select({
                name: chartOfAccounts.name,
                total: sql<number>`coalesce(sum(${journalLines.debit}) - sum(${journalLines.credit}), 0)`,
            }).from(journalLines)
                .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
                .innerJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
                .leftJoin(costCenters, eq(journalLines.costCenterId, costCenters.id))
                .where(and(...entryInstantFilter, eq(journalEntries.status, 'POSTED'), eq(journalEntries.referenceType, 'EXPENSE'), eq(chartOfAccounts.type, 'EXPENSE'), expenseBranchFilter))
                .groupBy(chartOfAccounts.name)
                .orderBy(sql`sum(${journalLines.debit}) - sum(${journalLines.credit}) desc`)
                .offset(0).fetch(10),
            db.select({
                date: journalEntries.date,
                reference: journalEntries.reference,
                description: journalEntries.description,
                name: chartOfAccounts.name,
                total: sql<number>`coalesce(${journalLines.debit} - ${journalLines.credit}, 0)`,
            }).from(journalLines)
                .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
                .innerJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
                .leftJoin(costCenters, eq(journalLines.costCenterId, costCenters.id))
                .where(and(...entryInstantFilter, eq(journalEntries.status, 'POSTED'), eq(journalEntries.referenceType, 'EXPENSE'), eq(chartOfAccounts.type, 'EXPENSE'), expenseBranchFilter))
                .orderBy(desc(journalEntries.date), desc(journalLines.id))
                .offset(0).fetch(50),
        ]);

        const expenses = Number(expenseAgg?.total || 0);
        const pendingExpenses = Number(pendingExpenseAgg?.total || 0);

        // Cancelled-but-paid money: revenue excludes CANCELLED orders while
        // tender reconciliation intentionally keeps their COMPLETED payments
        // (cash is physically in the drawer). Surface it as an explicit line
        // so drawer-vs-revenue never needs manual explanation.
        const [cancelledPaidAgg] = await db.select({
            orders: sql<number>`count(distinct ${orders.id})`,
            total: sql<number>`coalesce(sum(${payments.amount}), 0)`,
        }).from(payments)
            .innerJoin(orders, eq(payments.orderId, orders.id))
            .where(and(
                eq(orders.branchId, branchId),
                eq(payments.status, 'COMPLETED'),
                eq(orders.status, 'CANCELLED'),
                dateFilter,
            ));

        // Pilot cash in pockets: COLLECT minus SETTLE per driver for the day.
        // This money is NOT in any drawer yet — surfaced so close reconciles it.
        let driverCashRows: Array<{ driverId: string; driverName: string; outstanding: number }> = [];
        try {
            driverCashRows = await db.select({
                driverId: driverCashLedger.driverId,
                driverName: sql<string>`coalesce(max(${drivers.name}), max(${driverCashLedger.driverId}))`,
                outstanding: sql<number>`coalesce(sum(case when ${driverCashLedger.type} = 'COLLECT' then ${driverCashLedger.amount} else -${driverCashLedger.amount} end), 0)`,
            }).from(driverCashLedger)
                .leftJoin(drivers, eq(drivers.id, driverCashLedger.driverId))
                .where(and(
                    eq(driverCashLedger.branchId, branchId),
                    sql`cast(${driverCashLedger.createdAt} as date) = ${date}`,
                ))
                .groupBy(driverCashLedger.driverId);
        } catch {
            // Legacy databases may lack the ledger table.
        }
        const driverCashOutstanding = driverCashRows
            .map(r => ({ driverId: String(r.driverId), driverName: String(r.driverName || r.driverId), outstanding: Number(r.outstanding || 0) }))
            .filter(r => Math.abs(r.outstanding) > 0.005);

        return {
            date,
            branchId,
            branchName: branch?.name,
            currency: branch?.currency || 'EGP',
            dayCloseEmails: (branch?.dayCloseEmails as string[]) || [],
            status: 'OPEN',
            salesSummary: {
                totalOrders,
                totalRevenue,
                grossSales: totalRevenue,
                totalTax,
                totalDiscount,
                netSales: grossMerchandise - totalDiscount,
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
            channelBreakdown: channelRows.map(r => ({
                source: r.source || 'UNKNOWN',
                count: Number(r.count),
                total: Number(r.total),
            })),
            callCenterSummary: {
                orders: Number(callCenterAgg?.orders || 0),
                revenue: Number(callCenterAgg?.revenue || 0),
                platformOrders: Number(callCenterAgg?.platformOrders || 0),
                platformRevenue: Number(callCenterAgg?.platformRevenue || 0),
            },
            cancelledPaidSummary: {
                orders: Number(cancelledPaidAgg?.orders || 0),
                total: Number(cancelledPaidAgg?.total || 0),
            },
            driverCashOutstanding,
            auditSummary: {
                totalEvents: Number(auditAgg?.totalEvents || 0),
                voidCount: Number(auditAgg?.voidCount || 0),
                discountCount: Number(auditAgg?.discountCount || 0),
                refundCount: Number(auditAgg?.refundCount || 0),
            },
            financeSummary: {
                expenses,
                pendingExpenses,
                // totalRevenue is already net of discount — subtracting the
                // discount again would understate profit by that amount.
                netProfit: totalRevenue - expenses,
                topExpenses: topExpenseRows.map(row => ({ name: row.name || 'Expense', total: Number(row.total || 0) })),
                expenseRows: expenseRows.map(row => ({
                    date: row.date,
                    name: row.name || 'Expense',
                    description: row.description,
                    reference: row.reference,
                    total: Number(row.total || 0),
                })),
            },
        };
    },

    async getFiscalHealth(branchId: string, date: string) {
        const { startOfDay, endOfDay } = await this.getBranchDayBounds(branchId, date);

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
        const { startOfDay, endOfDay } = await this.getBranchDayBounds(branchId, date);

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
        const { startOfDay, endOfDay } = await this.getBranchDayBounds(branchId, date);

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
        const { startOfDay, endOfDay } = await this.getBranchDayBounds(branchId, date);

        const [requireStockCount, openShiftDetails, openShiftRows, postedStockCountRows, warehouseRows] = await Promise.all([
            getDayCloseRequireStockCount(),
            db.select({
                id: shifts.id,
                userId: shifts.userId,
                openingBalance: shifts.openingBalance,
                openingTime: shifts.openingTime,
                userName: users.name,
            })
                .from(shifts)
                .leftJoin(users, eq(shifts.userId, users.id))
                .where(and(
                    eq(shifts.branchId, branchId),
                    eq(shifts.status, 'OPEN'),
                )),
            db.select({ count: sql<number>`count(*)` })
                .from(shifts)
                .where(and(
                    eq(shifts.branchId, branchId),
                    eq(shifts.status, 'OPEN'),
                )),
            db.select({ count: sql<number>`count(*)` })
                .from(stockCounts)
                .where(and(
                    eq(stockCounts.branchId, branchId),
                    eq(stockCounts.countDate, toSqlDate(date)),
                    eq(stockCounts.status, 'POSTED'),
                )),
            // Branches without warehouses (e.g. the call-center branch, which
            // only distributes orders) hold no stock and need no count.
            db.select({ count: sql<number>`count(*)` })
                .from(warehouses)
                .where(eq(warehouses.branchId, branchId)),
        ]);

        const openShiftCount = Number(openShiftRows[0]?.count || 0);
        const postedStockCount = Number(postedStockCountRows[0]?.count || 0);
        const hasWarehouses = Number(warehouseRows[0]?.count || 0) > 0;

        const checks: (DayCloseReadinessCheck & { openShifts?: any[] })[] = [
            {
                code: 'OPEN_SHIFTS_EXIST_FOR_DAY_CLOSE',
                passed: openShiftCount === 0,
                blocking: true,
                count: openShiftCount,
                actionPath: '/finance',
                openShifts: openShiftDetails.map(s => ({
                    id: s.id,
                    userId: s.userId,
                    userName: s.userName || 'Unknown Operator',
                    openingBalance: Number(s.openingBalance || 0),
                    openingTime: s.openingTime,
                })),
            },
        ];

        if (requireStockCount && hasWarehouses) {
            checks.push({
                code: 'DAILY_STOCK_COUNT_REQUIRED_FOR_DAY_CLOSE',
                passed: postedStockCount > 0,
                blocking: true,
                count: postedStockCount > 0 ? 0 : 1,
                actionPath: '/inventory',
            });
        }

        // Fiscal visibility (warn-only, never blocks): failed/pending ETA
        // submissions and dead letters would otherwise go unnoticed, since
        // submission failures are swallowed upstream.
        try {
            const fiscal = await this.getFiscalHealth(branchId, date);
            const fiscalOpen = Number(fiscal?.pending || 0) + Number(fiscal?.failed || 0) + Number(fiscal?.deadLettersPending || 0);
            if (fiscalOpen > 0) {
                checks.push({
                    code: 'FISCAL_SUBMISSIONS_OPEN_FOR_DAY_CLOSE',
                    passed: true,
                    blocking: false,
                    count: fiscalOpen,
                    actionPath: '/fiscal',
                });
            }
        } catch {
            // Fiscal snapshot must never block readiness itself.
        }

        const blockedReasons = checks
            .filter(check => check.blocking && !check.passed)
            .map(check => check.code);

        return {
            canClose: blockedReasons.length === 0,
            checks,
            blockedReasons,
            openShifts: openShiftDetails.map(s => ({
                id: s.id,
                userId: s.userId,
                userName: s.userName || 'Unknown Operator',
                openingBalance: Number(s.openingBalance || 0),
                openingTime: s.openingTime,
            })),
        };
    },

    async generateOperationalSnapshot(branchId: string, date: string, report: DayCloseReport) {
        const { startOfDay, endOfDay } = await this.getBranchDayBounds(branchId, date);
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
                // Keep the snapshot consistent with readiness: any still-open
                // branch shift must remain visible, even if it started earlier.
                sql`(${shifts.status} = 'OPEN' OR (${shifts.openingTime} <= ${endOfDay} AND (${shifts.closingTime} IS NULL OR ${shifts.closingTime} >= ${startOfDay})))`,
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
                lowStockCount: sql<number>`sum(case when ${inventoryStock.quantity} <= coalesce(${inventoryItems.threshold}, 0) then 1 else 0 end)`,
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
    },    async autoCloseBranchShifts(branchId: string, userId: string) {
        const openShiftRows = await db.select()
            .from(shifts)
            .where(and(
                eq(shifts.branchId, branchId),
                eq(shifts.status, 'OPEN')
            ));

        for (const s of openShiftRows) {
            try {
                const paymentRows = await db.select({
                    orderId: payments.orderId,
                    method: payments.method,
                    total: sql<number>`coalesce(sum(${payments.amount}), 0)`,
                }).from(payments)
                    .innerJoin(orders, eq(payments.orderId, orders.id))
                    .where(and(
                        eq(orders.branchId, branchId),
                        eq(orders.shiftId, s.id),
                        eq(payments.status, 'COMPLETED'),
                        gte(payments.createdAt, s.openingTime)
                    ))
                    .groupBy(payments.orderId, payments.method);

                const cashTotal = paymentRows
                    .filter(row => row.method === 'CASH')
                    .reduce((sum, row) => sum + Number(row.total || 0), 0);

                // Terminal-confirmed cash (manual_cash sessions) is physical
                // cash too — ignoring it understates expected drawer balance.
                // Guarded against double count: orders that already carry a
                // legacy COMPLETED CASH row are skipped (same dedup rule as
                // reconcilePaymentRows).
                let sessionCashTotal = 0;
                try {
                    const [sessionCash] = await db.select({
                        total: sql<number>`coalesce(sum(case when not exists (select 1 from ${payments} p where p.order_id = ${paymentSessions.orderId} and p.method = 'CASH' and p.status = 'COMPLETED') then ${paymentSessions.amount} else 0 end), 0)`,
                    }).from(paymentSessions)
                        .innerJoin(orders, eq(paymentSessions.orderId, orders.id))
                        .where(and(
                            eq(orders.branchId, branchId),
                            eq(orders.shiftId, s.id),
                            eq(paymentSessions.status, 'confirmed'),
                            eq(paymentSessions.providerType, 'manual_cash'),
                            gte(paymentSessions.createdAt, s.openingTime),
                        ));
                    sessionCashTotal = Number(sessionCash?.total || 0);
                } catch {
                    // Legacy databases may not have payment_sessions yet.
                }

                const expectedBalance = Number(s.openingBalance || 0) + cashTotal + sessionCashTotal;

                await db.update(shifts)
                    .set({
                        status: 'CLOSED',
                        closingTime: new Date(),
                        expectedBalance,
                        actualBalance: expectedBalance,
                        notes: [s.notes, `Auto-closed during Day Close by ${userId}`].filter(Boolean).join(' | '),
                        updatedAt: new Date(),
                    })
                    .where(eq(shifts.id, s.id));

                await createSignedAuditLog({
                    eventType: 'SHIFT_AUTO_CLOSED_ON_DAY_CLOSE',
                    userId,
                    branchId,
                    payload: {
                        shiftId: s.id,
                        expectedBalance,
                        openingTime: s.openingTime,
                    },
                });
            } catch (err) {
                await db.update(shifts)
                    .set({
                        status: 'CLOSED',
                        closingTime: new Date(),
                        expectedBalance: Number(s.openingBalance || 0),
                        actualBalance: Number(s.openingBalance || 0),
                        notes: [s.notes, `Auto-closed fallback during Day Close`].filter(Boolean).join(' | '),
                        updatedAt: new Date(),
                    })
                    .where(eq(shifts.id, s.id));
            }
        }
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
            enforceShiftsClosed?: boolean;
            autoCloseOpenShifts?: boolean;
            overrideReason?: string; // Item 22: override with written reason
        }
    ) {
        const existingClose = await this.getClosedReport(branchId, date);
        if (existingClose) {
            // Idempotent re-close: heal leftover operational data AND make sure
            // the business date actually advanced. A partial first attempt
            // (crash between report insert and date advance) used to leave the
            // branch permanently stuck on the closed day.
            try {
                await autoFinalizeOperationalOrders(branchId, userId);
            } catch (finalizeError) {
                logger.warn({ err: finalizeError, branchId, date }, 'DAY_CLOSE_FINALIZE_HEAL_FAILED');
            }
            await this.ensureBusinessDateAdvanced(branchId, date);
            return existingClose;
        }

        const [branch] = await db.select({
            businessDate: branches.businessDate,
            timezone: branches.timezone,
        })
            .from(branches)
            .where(eq(branches.id, branchId))
            .top(1);
        if (!branch) throw new Error('BRANCH_NOT_FOUND');
        const activeBusinessDate = branch.businessDate || localDateKey();
        if (date !== activeBusinessDate) {
            const error = new Error('BUSINESS_DATE_MISMATCH');
            (error as any).businessDate = activeBusinessDate;
            throw error;
        }

        if (options?.autoCloseOpenShifts || options?.overrideReason) {
            await this.autoCloseBranchShifts(branchId, userId);
        }

        const report = await this.generateReport(branchId, date);
        const fiscalHealth = await this.getFiscalHealth(branchId, date);
        const financeHealth = await this.getFinanceHealth(branchId, date);
        const sideEffectHealth = await this.getSideEffectHealth(branchId, date);
        const { startOfDay, endOfDay } = this.getDayBounds(date, branch.timezone || 'Africa/Cairo');

        // Collect all blocked reasons instead of throwing on first failure
        const blockedReasons: string[] = [];

        // Finance, fiscal, and unpaid order checks stay visible in reports, but day close only blocks
        // on open shifts and the optional daily posted stock count.

        // === GATE 3: Open shifts ===
        // This is mandatory: a business day cannot close while any branch
        // shift is open, regardless of which client initiated the request.
        const openShifts = await db.select({ count: sql<number>`count(*)` })
            .from(shifts)
            .where(and(
                eq(shifts.branchId, branchId),
                eq(shifts.status, 'OPEN'),
            ));
        if (Number(openShifts[0]?.count || 0) > 0) {
            if (options?.autoCloseOpenShifts) {
                await this.autoCloseBranchShifts(branchId, userId);
            } else {
                blockedReasons.push('OPEN_SHIFTS_EXIST_FOR_DAY_CLOSE');
            }
        }

        if (await getDayCloseRequireStockCount()) {
            // Warehouseless branches (call center) hold no stock: no count needed.
            const warehouseCount = await db.select({ count: sql<number>`count(*)` })
                .from(warehouses)
                .where(eq(warehouses.branchId, branchId));
            if (Number(warehouseCount[0]?.count || 0) > 0) {
                const postedStockCount = await db.select({ count: sql<number>`count(*)` })
                    .from(stockCounts)
                    .where(and(
                        eq(stockCounts.branchId, branchId),
                        eq(stockCounts.countDate, toSqlDate(date)),
                        eq(stockCounts.status, 'POSTED'),
                    ));
                if (Number(postedStockCount[0]?.count || 0) === 0) {
                    blockedReasons.push('DAILY_STOCK_COUNT_REQUIRED_FOR_DAY_CLOSE');
                }
            }
        }

        if (blockedReasons.length > 0) {
            if (!options?.overrideReason) {
                const error = new Error('DAY_CLOSE_BLOCKED');
                (error as any).blockedReasons = blockedReasons;
                throw error;
            }

            await createSignedAuditLog({
                eventType: 'DAY_CLOSE_OVERRIDE',
                userId,
                branchId,
                payload: {
                    blockedReasons,
                    overrideReason: options.overrideReason,
                },
            });
        }

        // Final safety: ensure all open shifts in the branch are closed before saving the day close snapshot
        await this.autoCloseBranchShifts(branchId, userId);

        // Mark as closed
        report.status = 'CLOSED';
        report.closedBy = userId;
        report.closedAt = new Date();
        report.fiscalHealth = fiscalHealth;
        report.financeHealth = financeHealth;
        report.sideEffectHealth = sideEffectHealth;

        const snapshot = await this.generateOperationalSnapshot(branchId, date, report);
        const dayCloseReportId = `dayclose_${branchId}_${date}`;
        const closeDate = toSqlDate(date);

        try {
            await db.insert(dayCloseReports).values({
                id: dayCloseReportId,
                branchId,
                businessDate: closeDate,
                closedBy: userId,
                date: closeDate,
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
                financeSnapshot: { ...financeHealth, summary: report.financeSummary },
                sideEffectSnapshot: sideEffectHealth,
                auditSnapshot: { summary: report.auditSummary },
                operationalSnapshot: snapshot.operationalSnapshot,
                status: 'CLOSED',
                notes: options?.notes,
            });
        } catch (error: any) {
            const errorNumber = Number(error?.number ?? error?.originalError?.info?.number);
            if (error?.code === '23505' || errorNumber === 2601 || errorNumber === 2627) {
                const concurrentClose = await this.getClosedReport(branchId, date);
                if (concurrentClose) return concurrentClose;
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

        // Clear kitchen + pickup screens so the next business day starts empty.
        // Cleanup is best-effort: it must never fail an already-saved close.
        try {
            await autoFinalizeOperationalOrders(branchId, userId);
        } catch (finalizeError) {
            logger.warn({ err: finalizeError, branchId, date }, 'DAY_CLOSE_FINALIZE_FAILED');
        }

        // Send email if configured
        if (options?.emailConfig) {
            await this.sendDayCloseEmail(report, options.emailConfig);
        }

        const whatsappRecipients = normalizeRecipients(await getDayCloseWhatsappRecipients());
        if (whatsappRecipients.length > 0) {
            const text = buildDayCloseWhatsAppText(report);
            const deliveryResults = await Promise.allSettled(whatsappRecipients.map((to) => sendWhatsAppText({
                to,
                text,
                branchId,
                sessionRole: 'DAY_CLOSE',
            })));
            const queuedRecipients = whatsappRecipients.filter((_, index) => deliveryResults[index]?.status === 'fulfilled');
            report.whatsappDelivery = {
                queued: queuedRecipients.length,
                recipients: queuedRecipients,
            };
        }

        // Advance to next business date automatically
        await this.ensureBusinessDateAdvanced(branchId, date);

        return report;
    },

    /**
     * Guarantees the branch business date is strictly AFTER the closed day.
     * Called from both the fresh-close path and the idempotent re-close path
     * so a partial close can never leave the branch stuck on a past date.
     */
    async ensureBusinessDateAdvanced(branchId: string, closedDate: string) {
        const nextDate = toSqlDate(closedDate);
        nextDate.setUTCDate(nextDate.getUTCDate() + 1);
        const nextBusinessDate = nextDate.toISOString().split('T')[0];

        const [branch] = await db.select({ businessDate: branches.businessDate })
            .from(branches)
            .where(eq(branches.id, branchId))
            .top(1);
        const current = branch?.businessDate || '';
        if (current >= nextBusinessDate) return nextBusinessDate; // already ahead

        await db.update(branches)
            .set({ businessDate: nextBusinessDate })
            .where(eq(branches.id, branchId));
        logger.info({ branchId, from: current, to: nextBusinessDate }, 'BUSINESS_DATE_ADVANCED');
        return nextBusinessDate;
    },

    async getShiftCashSummary(branchId: string, date: string) {
        const { startOfDay, endOfDay } = await this.getBranchDayBounds(branchId, date);
        const [row] = await db.select({
            shiftCount: sql<number>`count(*)`,
            expectedCash: sql<number>`coalesce(sum(${shifts.expectedBalance}), 0)`,
            actualCash: sql<number>`coalesce(sum(${shifts.actualBalance}), 0)`,
        }).from(shifts).where(and(
            eq(shifts.branchId, branchId),
            sql`(${shifts.openingTime} <= ${endOfDay} AND (${shifts.closingTime} IS NULL OR ${shifts.closingTime} >= ${startOfDay}))`,
        ));
        const expectedCash = Number(row?.expectedCash || 0);
        const actualCash = Number(row?.actualCash || 0);
        return {
            shiftCount: Number(row?.shiftCount || 0),
            expectedCash,
            actualCash,
            variance: actualCash - expectedCash,
        };
    },

    async setBusinessDate(branchId: string, businessDate: string, userId: string) {
        if (!isValidDateKey(businessDate)) throw new Error('INVALID_BUSINESS_DATE');
        if (businessDate > localDateKey()) throw new Error('FUTURE_BUSINESS_DATE_NOT_ALLOWED');

        const [branch] = await db.select({ businessDate: branches.businessDate })
            .from(branches)
            .where(eq(branches.id, branchId))
            .top(1);
        if (!branch) throw new Error('BRANCH_NOT_FOUND');
        if (branch.businessDate === businessDate) return { businessDate };

        const [[openShift], closedReport] = await Promise.all([
            db.select({ count: sql<number>`count(*)` })
                .from(shifts)
                .where(and(eq(shifts.branchId, branchId), eq(shifts.status, 'OPEN'))),
            this.getClosedReport(branchId, businessDate),
        ]);
        if (Number(openShift?.count || 0) > 0) throw new Error('OPEN_SHIFTS_EXIST_FOR_BUSINESS_DATE_CHANGE');
        if (closedReport) throw new Error('BUSINESS_DATE_ALREADY_CLOSED');

        await db.update(branches)
            .set({ businessDate, updatedAt: new Date() })
            .where(eq(branches.id, branchId));
        await createSignedAuditLog({
            eventType: 'BUSINESS_DATE_CHANGED',
            userId,
            branchId,
            payload: { from: branch.businessDate, to: businessDate },
        });

        await releaseBranchTables(branchId);
        return { businessDate };
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
            .offset(0).fetch(limit);

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
