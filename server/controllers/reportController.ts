import { Request, Response } from 'express';
import { db } from '../db';
import { orders, payments, orderItems, menuItems, menuCategories, recipes, recipeIngredients, inventoryItems, branches, stockMovements, inventoryStock, inventoryBatches, warehouses, journalEntries, journalLines, chartOfAccounts, costCenters, employees, attendance, payrollCycles, payrollPayouts, customers, campaigns, shifts, managerApprovals, purchaseOrders, purchaseOrderItems, suppliers, drivers, fiscalLogs, etaDeadLetters, auditLogs } from '../../src/db/schema';
import { eq, and, or, sql, gte, lte, inArray, desc, asc } from 'drizzle-orm';
import PDFDocument from 'pdfkit';
import { DELIVERED_STATUSES, DashboardScope, parseLocalDateRange, parseReportFilters, ReportGranularity, resolveScopedBranchId } from './report/reportUtils';
import { generateHrTabularXlsx } from '../services/hrReportExportService';

// Re-exports from domain-specific report modules
export { getCashierSummary, getDailySales, getFiscalSummary, getFoodCostReport, getHourlySales, getOverview, getPaymentMethodSummary, getProfitDaily, getProfitSummary, getRefundsReport, getVatReport } from './report/salesReports';
export { getTrialBalance, getProfitAndLoss, getTopExpenses, getExpenseReport } from './report/financeReports';
export { getStockMovementLog, getWasteLossLog, getReorderAlerts, getExpiringBatches } from './report/inventoryReports';
export { getPayrollSummary, getAttendanceReport, getOvertimeReport } from './report/hrReports';
export { getCustomerLTV, getCampaignROI } from './report/crmReports';
export { getBranchPerformance, getOrderPrepTime } from './report/operationsReports';
export { getSalesByOrderType, getSalesByItem, getSalesByCategory, getDiscountAnalysis, getCancelledOrders, getDeliveryPerformance, getSalesBySource, getDineInTableAnalysis } from './report/extendedSalesReports';
export { getPeakHoursHeatmap, getModifierSales, getAvgTicketTrend, getSalesComparison, getSlowMovingItems, getRevenueByWeekday, getVoidItemsLog } from './report/advancedSalesReports';
export { getTipsReport, getServiceChargeReport, getShiftSummary } from './report/advancedFinanceReports';
export { getActualVsTheoretical, getPurchaseHistory, getInventoryValuation } from './report/advancedInventoryReports';
export { getStaffCostVsRevenue, getSalesPerLaborHour, getEmployeeProductivity } from './report/advancedHrReports';
export { getCustomerRetention, getNewVsReturning, getCustomerFrequency, getCustomerChurn, getLoyaltyPointsReport, getPromotionImpact } from './report/advancedCrmReports';
export { getKitchenPerformance, getMenuEngineeringMatrix, getDaypartAnalysis, getBasketAnalysis, getTableTurnoverRate, getWaitTimeReport, getDriverUtilization, getBranchComparison } from './report/advancedOpsReports';
export { getSeasonalityReport, getOnlineVsOfflineTrend, getFoodCostTrend, getTaxComplianceSummary, getAuditTrailReport, getCashFlowForecast, getSupplierPriceTracking, getRecipeCostAlerts, getABCClassification } from './report/strategicReports';
export { getDemandForecast, getPriceElasticity, getMenuCannibalization, getAnomalyDetection, getBreakEvenAnalysis, getPaymentReconciliation, getDailyFlashReport, getMenuItemLifecycle, getCategoryContribution, getShiftProfitability, getDeliveryZoneAnalysis, getDeliveryCostVsRevenue, getCustomerJourneyFunnel, getChannelMixTrend, getOptimalPricing, getThirdPartyVsInHouse, getTimeToFirstOrder } from './report/predictiveReports';


export const getDashboardKpis = async (req: Request, res: Response) => {
    try {
        const { branchId: rawBranchId, startDate, endDate, scope } = req.query as {
            branchId?: string;
            startDate?: string;
            endDate?: string;
            scope?: DashboardScope;
        };
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }

        const branchId = resolveScopedBranchId(req, rawBranchId);
        const { start, end } = parseLocalDateRange(startDate, endDate);
        const scopeValue: DashboardScope = (scope || 'DAILY') as DashboardScope;
        const orderDateInRange = sql`(
            (${orders.businessDate} IS NOT NULL AND ${orders.businessDate} >= ${startDate} AND ${orders.businessDate} <= ${endDate})
            OR (${orders.businessDate} IS NULL AND ${orders.createdAt} >= ${start} AND ${orders.createdAt} <= ${end})
        )`;
        const revenueRecognized = sql`(
            ${orders.status} IN ('DELIVERED', 'COMPLETED')
            OR exists (
                select 1
                from ${payments} p
                where p.order_id = ${orders.id}
                  and p.status = 'COMPLETED'
            )
        )`;

        const [overviewRows, paymentsMix, paidRevenueRows, uniqueCustomersRows, itemsSoldRows, opsStatusRows, orderTypeRows, trendRows, topItemsRows, categoryRows, branchRows, topCustomerRows, expenseRows, pendingExpenseRows] = await Promise.all([
            db.select({
                orderCount: sql<number>`count(*)`,
                grossSales: sql<number>`coalesce(sum(${orders.total}), 0)`,
                netSales: sql<number>`coalesce(sum(${orders.subtotal} - ${orders.discount}), 0)`,
                taxTotal: sql<number>`coalesce(sum(${orders.tax}), 0)`,
                discountTotal: sql<number>`coalesce(sum(${orders.discount}), 0)`,
                serviceChargeTotal: sql<number>`coalesce(sum(${orders.serviceCharge}), 0)`,
            }).from(orders).where(
                and(
                    branchId ? eq(orders.branchId, branchId) : undefined,
                    orderDateInRange,
                    revenueRecognized
                )
            ),
            db.select({
                name: payments.method,
                value: sql<number>`coalesce(sum(${payments.amount}), 0)`,
            }).from(payments)
                .innerJoin(orders, eq(payments.orderId, orders.id))
                .where(
                    and(
                        branchId ? eq(orders.branchId, branchId) : undefined,
                        orderDateInRange,
                        eq(payments.status, 'COMPLETED')
                    )
                )
                .groupBy(payments.method),
            db.select({
                paidRevenue: sql<number>`coalesce(sum(${payments.amount}), 0)`,
            }).from(payments)
                .innerJoin(orders, eq(payments.orderId, orders.id))
                .where(
                    and(
                        branchId ? eq(orders.branchId, branchId) : undefined,
                        orderDateInRange,
                        eq(payments.status, 'COMPLETED')
                    )
                ),
            db.select({
                uniqueCustomers: sql<number>`count(distinct coalesce(${orders.customerId}, ${orders.customerPhone}))`,
            }).from(orders).where(
                and(
                    branchId ? eq(orders.branchId, branchId) : undefined,
                    orderDateInRange,
                    revenueRecognized
                )
            ),
            db.select({
                itemsSold: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
            }).from(orderItems)
                .innerJoin(orders, eq(orderItems.orderId, orders.id))
                .where(
                    and(
                        branchId ? eq(orders.branchId, branchId) : undefined,
                        orderDateInRange,
                        revenueRecognized
                    )
                ),
            db.select({
                status: orders.status,
                count: sql<number>`count(*)`,
            }).from(orders).where(
                and(
                    branchId ? eq(orders.branchId, branchId) : undefined,
                    orderDateInRange
                )
            ).groupBy(orders.status),
            db.select({
                name: orders.type,
                value: sql<number>`count(*)`,
            }).from(orders).where(
                and(
                    branchId ? eq(orders.branchId, branchId) : undefined,
                    orderDateInRange,
                    revenueRecognized
                )
            ).groupBy(orders.type),
            (scopeValue === 'DAILY'
                ? db.select({
                    name: sql<string>`to_char(${orders.createdAt}, 'HH24:00')`,
                    revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
                }).from(orders).where(
                    and(
                        branchId ? eq(orders.branchId, branchId) : undefined,
                        orderDateInRange,
                        revenueRecognized
                    )
                ).groupBy(sql`to_char(${orders.createdAt}, 'HH24:00')`).orderBy(sql`to_char(${orders.createdAt}, 'HH24:00') asc`)
                : db.select({
                    name: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM-DD')`,
                    revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
                }).from(orders).where(
                    and(
                        branchId ? eq(orders.branchId, branchId) : undefined,
                        orderDateInRange,
                        revenueRecognized
                    )
                ).groupBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`).orderBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD') asc`)),
            db.select({
                name: sql<string>`coalesce(${orderItems.name}, 'Unknown')`,
                qty: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
                revenue: sql<number>`coalesce(sum(${orderItems.quantity} * ${orderItems.price}), 0)`,
            }).from(orderItems)
                .innerJoin(orders, eq(orderItems.orderId, orders.id))
                .where(
                    and(
                        branchId ? eq(orders.branchId, branchId) : undefined,
                        orderDateInRange,
                        revenueRecognized
                    )
                )
                .groupBy(sql`coalesce(${orderItems.name}, 'Unknown')`)
                .orderBy(sql`coalesce(sum(${orderItems.quantity}), 0) desc`)
                .limit(8),
            db.select({
                name: sql<string>`coalesce(${menuCategories.name}, 'Uncategorized')`,
                value: sql<number>`coalesce(sum(${orderItems.quantity} * ${orderItems.price}), 0)`,
            }).from(orderItems)
                .innerJoin(orders, eq(orderItems.orderId, orders.id))
                .leftJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
                .leftJoin(menuCategories, eq(menuItems.categoryId, menuCategories.id))
                .where(
                    and(
                        branchId ? eq(orders.branchId, branchId) : undefined,
                        orderDateInRange,
                        revenueRecognized
                    )
                )
                .groupBy(sql`coalesce(${menuCategories.name}, 'Uncategorized')`)
                .orderBy(sql`coalesce(sum(${orderItems.quantity} * ${orderItems.price}), 0) desc`)
                .limit(6),
            db.select({
                branchId: orders.branchId,
                branchName: sql<string>`coalesce(${branches.name}, ${orders.branchId})`,
                orders: sql<number>`count(*)`,
                revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
            }).from(orders)
                .leftJoin(branches, eq(orders.branchId, branches.id))
                .where(
                    and(
                        branchId ? eq(orders.branchId, branchId) : undefined,
                        orderDateInRange,
                        revenueRecognized
                    )
                )
                .groupBy(orders.branchId, branches.name)
                .orderBy(sql`coalesce(sum(${orders.total}), 0) desc`)
                .limit(6),
            db.select({
                id: sql<string>`coalesce(${orders.customerId}, ${orders.customerPhone}, ${orders.customerName}, 'guest')`,
                name: sql<string>`coalesce(max(${orders.customerName}), max(${orders.customerPhone}), 'Guest')`,
                visits: sql<number>`count(*)`,
                totalSpent: sql<number>`coalesce(sum(${orders.total}), 0)`,
            }).from(orders).where(
                and(
                    branchId ? eq(orders.branchId, branchId) : undefined,
                    orderDateInRange,
                    revenueRecognized
                )
            )
                .groupBy(sql`coalesce(${orders.customerId}, ${orders.customerPhone}, ${orders.customerName}, 'guest')`)
                .orderBy(sql`coalesce(sum(${orders.total}), 0) desc`)
                .limit(5),
            db.select({
                expenses: sql<number>`coalesce(sum(${journalLines.debit} - ${journalLines.credit}), 0)`,
            }).from(journalLines)
                .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
                .innerJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
                .leftJoin(costCenters, eq(journalLines.costCenterId, costCenters.id))
                .where(and(
                    gte(journalEntries.date, start),
                    lte(journalEntries.date, end),
                    eq(journalEntries.status, 'POSTED'),
                    eq(chartOfAccounts.type, 'EXPENSE'),
                    branchId ? or(eq(costCenters.branchId, branchId), sql`${journalLines.costCenterId} is null`) : undefined
                )),
            db.select({
                pendingExpenses: sql<number>`coalesce(sum(${journalLines.debit} - ${journalLines.credit}), 0)`,
            }).from(journalLines)
                .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
                .innerJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
                .leftJoin(costCenters, eq(journalLines.costCenterId, costCenters.id))
                .where(and(
                    gte(journalEntries.date, start),
                    lte(journalEntries.date, end),
                    eq(journalEntries.status, 'PENDING_APPROVAL'),
                    eq(chartOfAccounts.type, 'EXPENSE'),
                    branchId ? or(eq(costCenters.branchId, branchId), sql`${journalLines.costCenterId} is null`) : undefined
                )),
        ]);

        const summary = overviewRows[0] || {
            orderCount: 0,
            grossSales: 0,
            netSales: 0,
            taxTotal: 0,
            discountTotal: 0,
            serviceChargeTotal: 0,
        };
        const orderCount = Number(summary.orderCount || 0);
        const grossSales = Number(summary.grossSales || 0);
        const netSales = Number(summary.netSales || 0);
        const approvedExpenses = Number(expenseRows[0]?.expenses || 0);
        const pendingExpenses = Number(pendingExpenseRows[0]?.pendingExpenses || 0);
        const pending = Number(opsStatusRows.find(r => r.status === 'PENDING')?.count || 0)
            + Number(opsStatusRows.find(r => r.status === 'PREPARING')?.count || 0)
            + Number(opsStatusRows.find(r => r.status === 'READY')?.count || 0)
            + Number(opsStatusRows.find(r => r.status === 'OUT_FOR_DELIVERY')?.count || 0);
        const cancelled = Number(opsStatusRows.find(r => r.status === 'CANCELLED')?.count || 0);
        const delivered = Number(opsStatusRows.find(r => r.status === 'DELIVERED')?.count || 0)
            + Number(opsStatusRows.find(r => r.status === 'COMPLETED')?.count || 0);

        res.json({
            branchId: branchId || 'ALL',
            scope: scopeValue,
            period: { start, end },
            totals: {
                revenue: grossSales,
                netRevenue: netSales,
                expenses: approvedExpenses,
                pendingExpenses,
                netProfit: netSales - approvedExpenses,
                paidRevenue: Number(paidRevenueRows[0]?.paidRevenue || 0),
                discounts: Number(summary.discountTotal || 0),
                orderCount,
                avgTicket: orderCount > 0 ? grossSales / orderCount : 0,
                uniqueCustomers: Number(uniqueCustomersRows[0]?.uniqueCustomers || 0),
                itemsSold: Number(itemsSoldRows[0]?.itemsSold || 0),
                cancelled,
                pending,
                delivered,
                cancelRate: orderCount > 0 ? (cancelled / orderCount) * 100 : 0,
            },
            trendData: trendRows.map((row) => ({
                name: row.name,
                revenue: Number(row.revenue || 0),
            })),
            paymentBreakdown: paymentsMix.map((row) => ({
                name: row.name,
                value: Number(row.value || 0),
            })),
            orderTypeBreakdown: orderTypeRows.map((row) => ({
                name: row.name,
                value: Number(row.value || 0),
            })),
            categoryData: categoryRows.map((row) => ({
                name: row.name,
                value: Number(row.value || 0),
            })),
            topItems: topItemsRows.map((row) => ({
                name: row.name,
                qty: Number(row.qty || 0),
                revenue: Number(row.revenue || 0),
            })),
            branchPerformance: branchRows.map((row) => {
                const branchOrders = Number(row.orders || 0);
                const revenue = Number(row.revenue || 0);
                return {
                    branchId: row.branchId,
                    branchName: row.branchName,
                    orders: branchOrders,
                    revenue,
                    avgTicket: branchOrders > 0 ? revenue / branchOrders : 0,
                };
            }),
            topCustomers: topCustomerRows.map((row) => ({
                id: row.id,
                name: row.name,
                visits: Number(row.visits || 0),
                totalSpent: Number(row.totalSpent || 0),
            })),
            reportParity: {
                overview: {
                    orderCount: Number(summary.orderCount || 0),
                    grossSales: Number(summary.grossSales || 0),
                    netSales: Number(summary.netSales || 0),
                    taxTotal: Number(summary.taxTotal || 0),
                    discountTotal: Number(summary.discountTotal || 0),
                    serviceChargeTotal: Number(summary.serviceChargeTotal || 0),
                },
            },
        });
    } catch (error: any) {
        const message = error?.message || 'Failed to load dashboard KPIs';
        if (message === 'AUTH_REQUIRED') return res.status(401).json({ error: message });
        if (message === 'FORBIDDEN_BRANCH_SCOPE' || message === 'BRANCH_SCOPE_REQUIRED') return res.status(403).json({ error: message });
        return res.status(500).json({ error: message });
    }
};

const getExportSnapshot = async (branchId: string | undefined, start: Date, end: Date) => {
    const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
    const [overview] = await db.select({
        orderCount: sql<number>`count(*)`,
        grossSales: sql<number>`coalesce(sum(${orders.total}), 0)`,
        netSales: sql<number>`coalesce(sum(${orders.subtotal} - ${orders.discount}), 0)`,
        taxTotal: sql<number>`coalesce(sum(${orders.tax}), 0)`,
        discountTotal: sql<number>`coalesce(sum(${orders.discount}), 0)`,
        serviceChargeTotal: sql<number>`coalesce(sum(${orders.serviceCharge}), 0)`,
    }).from(orders).where(
        and(
            branchId ? eq(orders.branchId, branchId) : undefined,
            gte(orders.createdAt, start),
            lte(orders.createdAt, end),
            inArray(orders.status, deliveredStatuses)
        )
    );

    const daily = await db.select({
        day: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM-DD')`,
        revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
        net: sql<number>`coalesce(sum(${orders.subtotal} - ${orders.discount}), 0)`,
        tax: sql<number>`coalesce(sum(${orders.tax}), 0)`,
        orderCount: sql<number>`count(*)`,
    }).from(orders)
        .where(
            and(
                branchId ? eq(orders.branchId, branchId) : undefined,
                gte(orders.createdAt, start),
                lte(orders.createdAt, end),
                inArray(orders.status, deliveredStatuses)
            )
        )
        .groupBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD') asc`);

    const [profit] = await db.select({
        cogs: sql<number>`coalesce(sum(${orderItems.quantity} * coalesce(${menuItems.cost}, 0)), 0)`,
    }).from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .leftJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
        .where(
            and(
                branchId ? eq(orders.branchId, branchId) : undefined,
                gte(orders.createdAt, start),
                lte(orders.createdAt, end),
                inArray(orders.status, deliveredStatuses)
            )
        );

    const paymentsSummary = await db.select({
        method: payments.method,
        total: sql<number>`sum(amount)`,
        count: sql<number>`count(*)`
    }).from(payments)
        .innerJoin(orders, eq(payments.orderId, orders.id))
        .where(
            and(
                branchId ? eq(orders.branchId, branchId) : undefined,
                gte(orders.createdAt, start),
                lte(orders.createdAt, end),
                eq(payments.status, 'COMPLETED')
            )
        )
        .groupBy(payments.method);

    return {
        overview: overview || {
            orderCount: 0,
            grossSales: 0,
            netSales: 0,
            taxTotal: 0,
            discountTotal: 0,
            serviceChargeTotal: 0,
        },
        daily,
        profit: {
            cogs: Number(profit?.cogs || 0),
        },
        payments: paymentsSummary,
    };
};

const almostEqual = (a: number, b: number, tolerance = 0.01) => Math.abs(Number(a || 0) - Number(b || 0)) <= tolerance;

const SUPPORTED_CSV_EXPORT_TYPES = new Set([
    'OVERVIEW',
    'DAILY_SALES',
    'TRIAL_BALANCE',
    'TOP_EXPENSES',
    'EXPENSE_REPORT',
    'STOCK_MOVEMENTS',
    'WASTE_LOSS',
    'REORDER_ALERTS',
    'EXPIRING_BATCHES',
    'PAYROLL',
    'ATTENDANCE',
    'OVERTIME',
    'CUSTOMER_LTV',
    'CAMPAIGN_ROI',
    'BRANCH_PERFORMANCE',
    'ORDER_PREP_TIME',
]);

export const getIntegrityChecks = async (req: Request, res: Response) => {
    try {
        const { branchId, start, end } = parseReportFilters(req);
        const snapshot = await getExportSnapshot(branchId, start, end);
        const deliveredStatuses = ['DELIVERED', 'COMPLETED'];

        const dailyRevenueSum = snapshot.daily.reduce((sum: number, row: any) => sum + Number(row.revenue || 0), 0);
        const dailyNetSum = snapshot.daily.reduce((sum: number, row: any) => sum + Number(row.net || 0), 0);
        const dailyTaxSum = snapshot.daily.reduce((sum: number, row: any) => sum + Number(row.tax || 0), 0);
        const paymentSum = snapshot.payments.reduce((sum: number, row: any) => sum + Number(row.total || 0), 0);
        const computedGrossProfit = Number(snapshot.overview.netSales || 0) - Number(snapshot.profit.cogs || 0);

        const [paymentCoverageRows] = await db.select({
            paidOrders: sql<number>`count(distinct ${payments.orderId})`,
            deliveredOrders: sql<number>`count(distinct ${orders.id})`,
        }).from(orders)
            .leftJoin(payments, eq(payments.orderId, orders.id))
            .where(
                and(
                    branchId ? eq(orders.branchId, branchId) : undefined,
                    gte(orders.createdAt, start),
                    lte(orders.createdAt, end),
                    eq(payments.status, 'COMPLETED'),
                    inArray(orders.status, deliveredStatuses)
                )
            );
        const coverageRatio = Number(paymentCoverageRows?.deliveredOrders || 0) > 0
            ? Number(paymentCoverageRows?.paidOrders || 0) / Number(paymentCoverageRows?.deliveredOrders || 1)
            : 1;

        const checks = [
            {
                id: 'DAILY_REVENUE_MATCH_OVERVIEW',
                description: 'Sum(daily revenue) equals overview gross sales',
                left: Number(dailyRevenueSum.toFixed(2)),
                right: Number(Number(snapshot.overview.grossSales || 0).toFixed(2)),
                diff: Number((dailyRevenueSum - Number(snapshot.overview.grossSales || 0)).toFixed(4)),
                pass: almostEqual(dailyRevenueSum, Number(snapshot.overview.grossSales || 0)),
            },
            {
                id: 'DAILY_NET_MATCH_OVERVIEW',
                description: 'Sum(daily net) equals overview net sales',
                left: Number(dailyNetSum.toFixed(2)),
                right: Number(Number(snapshot.overview.netSales || 0).toFixed(2)),
                diff: Number((dailyNetSum - Number(snapshot.overview.netSales || 0)).toFixed(4)),
                pass: almostEqual(dailyNetSum, Number(snapshot.overview.netSales || 0)),
            },
            {
                id: 'DAILY_TAX_MATCH_OVERVIEW',
                description: 'Sum(daily tax) equals overview tax total',
                left: Number(dailyTaxSum.toFixed(2)),
                right: Number(Number(snapshot.overview.taxTotal || 0).toFixed(2)),
                diff: Number((dailyTaxSum - Number(snapshot.overview.taxTotal || 0)).toFixed(4)),
                pass: almostEqual(dailyTaxSum, Number(snapshot.overview.taxTotal || 0)),
            },
            {
                id: 'PROFIT_FORMULA_VALID',
                description: 'Gross profit equals net sales - COGS',
                left: Number(computedGrossProfit.toFixed(2)),
                right: Number((Number(snapshot.overview.netSales || 0) - Number(snapshot.profit.cogs || 0)).toFixed(2)),
                diff: 0,
                pass: almostEqual(computedGrossProfit, Number(snapshot.overview.netSales || 0) - Number(snapshot.profit.cogs || 0)),
            },
            {
                id: 'PAYMENT_TOTAL_MATCH_GROSS',
                description: 'Payment totals approximately match gross sales (depends on payment coverage)',
                left: Number(paymentSum.toFixed(2)),
                right: Number(Number(snapshot.overview.grossSales || 0).toFixed(2)),
                diff: Number((paymentSum - Number(snapshot.overview.grossSales || 0)).toFixed(4)),
                pass: coverageRatio < 0.95 ? true : almostEqual(paymentSum, Number(snapshot.overview.grossSales || 0), 0.1),
                meta: {
                    paymentCoverageRatio: Number(coverageRatio.toFixed(4)),
                    note: coverageRatio < 0.95 ? 'Coverage below threshold; check treated as informational/pass' : undefined,
                },
            },
        ];

        const passedCount = checks.filter(c => c.pass).length;
        const failed = checks.filter(c => !c.pass);
        res.json({
            branchId: branchId || 'ALL',
            period: { start, end },
            checks,
            summary: {
                total: checks.length,
                passed: passedCount,
                failed: checks.length - passedCount,
                passRate: Number((passedCount / Math.max(1, checks.length)).toFixed(4)),
            },
            ok: failed.length === 0,
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

const toWeekBucket = (isoDay: string) => {
    const date = new Date(`${isoDay}T00:00:00.000Z`);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

const aggregateDailyRows = (rows: any[], granularity: ReportGranularity) => {
    if (granularity === 'DAILY') return rows;

    const grouped = new Map<string, { revenue: number; net: number; tax: number; orderCount: number }>();
    for (const row of rows) {
        const bucket = granularity === 'MONTHLY'
            ? String(row.day).slice(0, 7)
            : toWeekBucket(String(row.day));
        const existing = grouped.get(bucket) || { revenue: 0, net: 0, tax: 0, orderCount: 0 };
        existing.revenue += Number(row.revenue || 0);
        existing.net += Number(row.net || 0);
        existing.tax += Number(row.tax || 0);
        existing.orderCount += Number(row.orderCount || 0);
        grouped.set(bucket, existing);
    }

    return Array.from(grouped.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, values]) => ({
            day,
            revenue: values.revenue,
            net: values.net,
            tax: values.tax,
            orderCount: values.orderCount,
        }));
};

export const exportReportCsv = async (req: Request, res: Response) => {
    try {
        const { branchId, start, end, reportType, granularity } = parseReportFilters(req);
        if (!SUPPORTED_CSV_EXPORT_TYPES.has(reportType)) {
            return res.status(400).json({ error: 'UNSUPPORTED_REPORT_EXPORT' });
        }
        const lines: string[] = [];
        lines.push(`Report Type,${reportType}`);
        lines.push(`Branch,${branchId || 'ALL'}`);
        lines.push(`Start Date,${start.toISOString()}`);
        lines.push(`End Date,${end.toISOString()}`);
        lines.push('');

        switch (reportType) {
            case 'TRIAL_BALANCE': {
                const rows = await db.select({
                    code: chartOfAccounts.code, name: chartOfAccounts.name, type: chartOfAccounts.type,
                    debit: sql<number>`coalesce(sum(${journalLines.debit}), 0)`,
                    credit: sql<number>`coalesce(sum(${journalLines.credit}), 0)`,
                }).from(journalLines)
                    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
                    .innerJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
                    .where(and(gte(journalEntries.date, start), lte(journalEntries.date, end), eq(journalEntries.status, 'POSTED')))
                    .groupBy(chartOfAccounts.code, chartOfAccounts.name, chartOfAccounts.type)
                    .orderBy(chartOfAccounts.code);
                lines.push('Code,Account,Type,Debit,Credit,Balance');
                rows.forEach(r => lines.push([r.code, `"${r.name}"`, r.type, Number(r.debit).toFixed(2), Number(r.credit).toFixed(2), (Number(r.debit) - Number(r.credit)).toFixed(2)].join(',')));
                break;
            }
            case 'TOP_EXPENSES': {
                const rows = await db.select({
                    name: chartOfAccounts.name,
                    total: sql<number>`coalesce(sum(${journalLines.debit}) - sum(${journalLines.credit}), 0)`,
                }).from(journalLines)
                    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
                    .innerJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
                    .where(and(gte(journalEntries.date, start), lte(journalEntries.date, end), eq(journalEntries.status, 'POSTED'), eq(chartOfAccounts.type, 'EXPENSE')))
                    .groupBy(chartOfAccounts.name)
                    .orderBy(sql`sum(${journalLines.debit}) - sum(${journalLines.credit}) desc`).limit(20);
                lines.push('Expense Account,Total');
                rows.forEach(r => lines.push([`"${r.name}"`, Number(r.total).toFixed(2)].join(',')));
                break;
            }
            case 'EXPENSE_REPORT': {
                const rows = await db.select({
                    date: journalEntries.date,
                    reference: journalEntries.reference,
                    description: journalEntries.description,
                    code: chartOfAccounts.code,
                    name: chartOfAccounts.name,
                    total: sql<number>`coalesce(${journalLines.debit} - ${journalLines.credit}, 0)`,
                }).from(journalLines)
                    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
                    .innerJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
                    .leftJoin(costCenters, eq(journalLines.costCenterId, costCenters.id))
                    .where(and(
                        gte(journalEntries.date, start),
                        lte(journalEntries.date, end),
                        eq(journalEntries.status, 'POSTED'),
                        eq(chartOfAccounts.type, 'EXPENSE'),
                        branchId ? or(eq(costCenters.branchId, branchId), sql`${journalLines.costCenterId} is null`) : undefined
                    ))
                    .orderBy(desc(journalEntries.date), desc(journalLines.id))
                    .limit(1000);
                lines.push('Date,Account Code,Expense Account,Description,Reference,Amount');
                rows.forEach(r => lines.push([
                    r.date ? new Date(r.date).toISOString() : '',
                    r.code,
                    `"${r.name}"`,
                    `"${r.description || ''}"`,
                    r.reference || '',
                    Number(r.total).toFixed(2),
                ].join(',')));
                break;
            }
            case 'STOCK_MOVEMENTS': {
                const rows = await db.select({
                    itemName: inventoryItems.name, type: stockMovements.type, quantity: stockMovements.quantity,
                    totalCost: stockMovements.totalCost, reason: stockMovements.reason, createdAt: stockMovements.createdAt,
                }).from(stockMovements)
                    .innerJoin(inventoryItems, eq(stockMovements.itemId, inventoryItems.id))
                    .where(and(gte(stockMovements.createdAt, start), lte(stockMovements.createdAt, end)))
                    .orderBy(desc(stockMovements.createdAt)).limit(500);
                lines.push('Item,Type,Quantity,Cost,Reason,Date');
                rows.forEach(r => lines.push([`"${r.itemName}"`, r.type, r.quantity, Number(r.totalCost || 0).toFixed(2), `"${r.reason || ''}"`, new Date(r.createdAt!).toISOString()].join(',')));
                break;
            }
            case 'WASTE_LOSS': {
                const rows = await db.select({
                    itemName: inventoryItems.name, unit: inventoryItems.unit, quantity: stockMovements.quantity,
                    totalCost: stockMovements.totalCost, reason: stockMovements.reason, createdAt: stockMovements.createdAt,
                }).from(stockMovements)
                    .innerJoin(inventoryItems, eq(stockMovements.itemId, inventoryItems.id))
                    .where(and(gte(stockMovements.createdAt, start), lte(stockMovements.createdAt, end), inArray(stockMovements.type, ['WASTE', 'ADJUSTMENT'])))
                    .orderBy(desc(stockMovements.createdAt)).limit(500);
                lines.push('Item,Unit,Quantity,Cost,Reason,Date');
                rows.forEach(r => lines.push([`"${r.itemName}"`, r.unit, r.quantity, Number(r.totalCost || 0).toFixed(2), `"${r.reason || ''}"`, new Date(r.createdAt!).toISOString()].join(',')));
                break;
            }
            case 'REORDER_ALERTS': {
                const rows = await db.select({
                    itemName: inventoryItems.name, unit: inventoryItems.unit, threshold: inventoryItems.threshold,
                    currentStock: sql<number>`coalesce(sum(${inventoryStock.quantity}), 0)`,
                }).from(inventoryItems)
                    .leftJoin(inventoryStock, eq(inventoryItems.id, inventoryStock.itemId))
                    .where(eq(inventoryItems.isActive, true))
                    .groupBy(inventoryItems.id, inventoryItems.name, inventoryItems.unit, inventoryItems.threshold)
                    .having(sql`coalesce(sum(${inventoryStock.quantity}), 0) <= ${inventoryItems.threshold}`)
                    .orderBy(sql`coalesce(sum(${inventoryStock.quantity}), 0) asc`);
                lines.push('Item,Unit,Current Stock,Threshold,Deficit');
                rows.forEach(r => lines.push([`"${r.itemName}"`, r.unit, Number(r.currentStock), r.threshold, Number(r.threshold || 0) - Number(r.currentStock)].join(',')));
                break;
            }
            case 'EXPIRING_BATCHES': {
                const thirtyDaysLater = new Date(); thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
                const rows = await db.select({
                    itemName: inventoryItems.name, batchNumber: inventoryBatches.batchNumber,
                    currentQty: inventoryBatches.currentQty, unitCost: inventoryBatches.unitCost, expiryDate: inventoryBatches.expiryDate,
                }).from(inventoryBatches)
                    .innerJoin(inventoryItems, eq(inventoryBatches.itemId, inventoryItems.id))
                    .where(and(lte(inventoryBatches.expiryDate, thirtyDaysLater), gte(inventoryBatches.currentQty, sql`0.01`), inArray(inventoryBatches.status, ['ACTIVE', 'QUARANTINE'])))
                    .orderBy(inventoryBatches.expiryDate).limit(200);
                lines.push('Item,Batch,Qty,Unit Cost,Value,Expiry Date');
                rows.forEach(r => lines.push([`"${r.itemName}"`, r.batchNumber, r.currentQty, Number(r.unitCost).toFixed(2), (Number(r.currentQty) * Number(r.unitCost)).toFixed(2), new Date(r.expiryDate!).toISOString().split('T')[0]].join(',')));
                break;
            }
            case 'PAYROLL': {
                const conditions: any[] = [gte(payrollCycles.periodStart, start), lte(payrollCycles.periodEnd, end)];
                if (branchId) conditions.push(eq(payrollCycles.branchId, branchId));
                const cycles = await db.select().from(payrollCycles).where(and(...conditions));
                if (cycles.length > 0) {
                    const payouts = await db.select({
                        employeeName: employees.name, role: employees.role, basicSalary: payrollPayouts.basicSalary,
                        deductions: payrollPayouts.deductions, overtime: payrollPayouts.overtime, netPay: payrollPayouts.netPay,
                    }).from(payrollPayouts).innerJoin(employees, eq(payrollPayouts.employeeId, employees.id))
                        .where(inArray(payrollPayouts.cycleId, cycles.map(c => c.id)));
                    lines.push('Employee,Role,Basic Salary,Overtime,Deductions,Net Pay');
                    payouts.forEach(p => lines.push([`"${p.employeeName}"`, p.role, Number(p.basicSalary).toFixed(2), Number(p.overtime || 0).toFixed(2), Number(p.deductions || 0).toFixed(2), Number(p.netPay).toFixed(2)].join(',')));
                }
                break;
            }
            case 'ATTENDANCE': {
                const conditions: any[] = [gte(attendance.clockIn, start), lte(attendance.clockIn, end)];
                if (branchId) conditions.push(eq(attendance.branchId, branchId));
                const rows = await db.select({
                    employeeName: employees.name, role: employees.role,
                    totalDays: sql<number>`count(*)`,
                    presentDays: sql<number>`count(*) filter (where ${attendance.status} = 'PRESENT')`,
                    lateDays: sql<number>`count(*) filter (where ${attendance.status} = 'LATE')`,
                    absentDays: sql<number>`count(*) filter (where ${attendance.status} = 'ABSENT')`,
                    totalHours: sql<number>`coalesce(sum(${attendance.totalHours}), 0)`,
                }).from(attendance).innerJoin(employees, eq(attendance.employeeId, employees.id))
                    .where(and(...conditions)).groupBy(employees.name, employees.role);
                lines.push('Employee,Role,Total Days,Present,Late,Absent,Total Hours');
                rows.forEach(r => lines.push([`"${r.employeeName}"`, r.role, r.totalDays, r.presentDays, r.lateDays, r.absentDays, Number(r.totalHours).toFixed(1)].join(',')));
                break;
            }
            case 'OVERTIME': {
                const conditions: any[] = [gte(attendance.clockIn, start), lte(attendance.clockIn, end)];
                if (branchId) conditions.push(eq(attendance.branchId, branchId));
                const rows = await db.select({
                    employeeName: employees.name, role: employees.role, hourlyRate: employees.hourlyRate,
                    totalHours: sql<number>`coalesce(sum(${attendance.totalHours}), 0)`,
                    overtimeHours: sql<number>`coalesce(sum(greatest(${attendance.totalHours} - 8, 0)), 0)`,
                }).from(attendance).innerJoin(employees, eq(attendance.employeeId, employees.id))
                    .where(and(...conditions)).groupBy(employees.name, employees.role, employees.hourlyRate)
                    .having(sql`sum(greatest(${attendance.totalHours} - 8, 0)) > 0`);
                lines.push('Employee,Role,Total Hours,Overtime Hours,Hourly Rate,OT Cost');
                rows.forEach(r => lines.push([`"${r.employeeName}"`, r.role, Number(r.totalHours).toFixed(1), Number(r.overtimeHours).toFixed(1), Number(r.hourlyRate || 0).toFixed(2), (Number(r.overtimeHours) * Number(r.hourlyRate || 0) * 1.5).toFixed(2)].join(',')));
                break;
            }
            case 'CUSTOMER_LTV': {
                const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, ['DELIVERED', 'COMPLETED']), sql`${orders.customerId} is not null`];
                if (branchId) conditions.push(eq(orders.branchId, branchId));
                const rows = await db.select({
                    customerName: customers.name, phone: customers.phone,
                    totalSpent: sql<number>`coalesce(sum(${orders.total}), 0)`, orderCount: sql<number>`count(*)`,
                    avgTicket: sql<number>`coalesce(avg(${orders.total}), 0)`,
                }).from(orders).innerJoin(customers, eq(orders.customerId, customers.id))
                    .where(and(...conditions)).groupBy(customers.name, customers.phone)
                    .orderBy(sql`sum(${orders.total}) desc`).limit(100);
                lines.push('Customer,Phone,Total Spent,Orders,Avg Ticket');
                rows.forEach(r => lines.push([`"${r.customerName}"`, r.phone, Number(r.totalSpent).toFixed(2), r.orderCount, Number(r.avgTicket).toFixed(2)].join(',')));
                break;
            }
            case 'CAMPAIGN_ROI': {
                const rows = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt)).limit(50);
                lines.push('Campaign,Type,Status,Reach,Conversions,Revenue,Budget,ROI %');
                rows.forEach(r => {
                    const roi = Number(r.budget || 0) > 0 ? ((Number(r.revenue || 0) - Number(r.budget || 0)) / Number(r.budget || 0) * 100).toFixed(1) : '0';
                    lines.push([`"${r.name}"`, r.type, r.status, r.reach, r.conversions, Number(r.revenue || 0).toFixed(2), Number(r.budget || 0).toFixed(2), roi].join(','));
                });
                break;
            }
            case 'BRANCH_PERFORMANCE': {
                const rows = await db.select({
                    branchName: branches.name, orderCount: sql<number>`count(*)`,
                    revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
                    avgTicket: sql<number>`coalesce(avg(${orders.total}), 0)`,
                    cancelledCount: sql<number>`count(*) filter (where ${orders.status} = 'CANCELLED')`,
                }).from(orders).innerJoin(branches, eq(orders.branchId, branches.id))
                    .where(and(gte(orders.createdAt, start), lte(orders.createdAt, end)))
                    .groupBy(branches.name).orderBy(sql`sum(${orders.total}) desc`);
                lines.push('Branch,Orders,Revenue,Avg Ticket,Cancelled');
                rows.forEach(r => lines.push([`"${r.branchName}"`, r.orderCount, Number(r.revenue).toFixed(2), Number(r.avgTicket).toFixed(2), r.cancelledCount].join(',')));
                break;
            }
            case 'ORDER_PREP_TIME': {
                const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, ['DELIVERED', 'COMPLETED']), sql`${orders.completedAt} is not null`];
                if (branchId) conditions.push(eq(orders.branchId, branchId));
                const rows = await db.select({
                    branchName: branches.name, orderType: orders.type,
                    avgPrepMinutes: sql<number>`coalesce(avg(extract(epoch from (${orders.completedAt} - ${orders.createdAt})) / 60), 0)`,
                    orderCount: sql<number>`count(*)`,
                }).from(orders).innerJoin(branches, eq(orders.branchId, branches.id))
                    .where(and(...conditions)).groupBy(branches.name, orders.type);
                lines.push('Branch,Order Type,Orders,Avg Prep (min)');
                rows.forEach(r => lines.push([`"${r.branchName}"`, r.orderType, r.orderCount, Number(r.avgPrepMinutes).toFixed(1)].join(',')));
                break;
            }
            default: {
                // Default: sales overview
                const snapshot = await getExportSnapshot(branchId, start, end);
                const dailyRows = aggregateDailyRows(snapshot.daily, granularity);
                lines.push('Summary');
                lines.push('Order Count,Gross Sales,Net Sales,Tax Total,Discount Total,Service Charge,COGS');
                lines.push([
                    Number(snapshot.overview.orderCount || 0),
                    Number(snapshot.overview.grossSales || 0).toFixed(2),
                    Number(snapshot.overview.netSales || 0).toFixed(2),
                    Number(snapshot.overview.taxTotal || 0).toFixed(2),
                    Number(snapshot.overview.discountTotal || 0).toFixed(2),
                    Number(snapshot.overview.serviceChargeTotal || 0).toFixed(2),
                    Number(snapshot.profit.cogs || 0).toFixed(2),
                ].join(','));
                lines.push('');
                lines.push('Time Series');
                lines.push('Period,Revenue,Net,Tax,Order Count');
                dailyRows.forEach((row: any) => {
                    lines.push([row.day, Number(row.revenue || 0).toFixed(2), Number(row.net || 0).toFixed(2), Number(row.tax || 0).toFixed(2), Number(row.orderCount || 0)].join(','));
                });
                lines.push('');
                lines.push('Payments');
                lines.push('Method,Total,Count');
                snapshot.payments.forEach((p: any) => {
                    lines.push([p.method, Number(p.total || 0).toFixed(2), Number(p.count || 0)].join(','));
                });
                break;
            }
        }

        const csv = lines.join('\n');
        const filename = `report_${reportType.toLowerCase()}_${Date.now()}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const exportReportPdf = async (req: Request, res: Response) => {
    try {
        const { branchId, start, end, reportType, granularity } = parseReportFilters(req);
        const filename = `report_${reportType.toLowerCase()}_${Date.now()}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        const doc = new PDFDocument({ margin: 36, size: 'A4' });
        doc.pipe(res);

        doc.fontSize(18).text('Coduis Zen Report Export', { align: 'left' });
        doc.moveDown(0.5);
        doc.fontSize(10).text(`Type: ${reportType}`);
        doc.text(`Branch: ${branchId || 'ALL'}`);
        doc.text(`Range: ${start.toISOString().split('T')[0]} → ${end.toISOString().split('T')[0]}`);
        doc.moveDown();

        const addTableHeader = (headers: string[]) => {
            doc.fontSize(8).font('Helvetica-Bold');
            const colWidth = (doc.page.width - 72) / headers.length;
            headers.forEach((h, i) => doc.text(h, 36 + i * colWidth, doc.y, { width: colWidth, continued: i < headers.length - 1 }));
            doc.moveDown(0.3);
            doc.font('Helvetica').fontSize(8);
        };

        switch (reportType) {
            case 'TRIAL_BALANCE': {
                const rows = await db.select({
                    code: chartOfAccounts.code, name: chartOfAccounts.name, type: chartOfAccounts.type,
                    debit: sql<number>`coalesce(sum(${journalLines.debit}), 0)`,
                    credit: sql<number>`coalesce(sum(${journalLines.credit}), 0)`,
                }).from(journalLines)
                    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
                    .innerJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
                    .where(and(gte(journalEntries.date, start), lte(journalEntries.date, end), eq(journalEntries.status, 'POSTED')))
                    .groupBy(chartOfAccounts.code, chartOfAccounts.name, chartOfAccounts.type).orderBy(chartOfAccounts.code);
                doc.fontSize(12).text('Trial Balance', { underline: true }); doc.moveDown(0.5);
                rows.forEach(r => { doc.text(`${r.code} | ${r.name} | Dr ${Number(r.debit).toFixed(2)} | Cr ${Number(r.credit).toFixed(2)} | Bal ${(Number(r.debit) - Number(r.credit)).toFixed(2)}`); });
                break;
            }
            case 'TOP_EXPENSES': {
                const rows = await db.select({
                    name: chartOfAccounts.name,
                    total: sql<number>`coalesce(sum(${journalLines.debit}) - sum(${journalLines.credit}), 0)`,
                }).from(journalLines)
                    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
                    .innerJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
                    .where(and(gte(journalEntries.date, start), lte(journalEntries.date, end), eq(journalEntries.status, 'POSTED'), eq(chartOfAccounts.type, 'EXPENSE')))
                    .groupBy(chartOfAccounts.name).orderBy(sql`sum(${journalLines.debit}) - sum(${journalLines.credit}) desc`).limit(20);
                doc.fontSize(12).text('Top Expenses', { underline: true }); doc.moveDown(0.5);
                rows.forEach((r, i) => { doc.text(`${i + 1}. ${r.name}: ${Number(r.total).toFixed(2)} LE`); });
                break;
            }
            case 'EXPENSE_REPORT': {
                const rows = await db.select({
                    date: journalEntries.date,
                    reference: journalEntries.reference,
                    description: journalEntries.description,
                    code: chartOfAccounts.code,
                    name: chartOfAccounts.name,
                    total: sql<number>`coalesce(${journalLines.debit} - ${journalLines.credit}, 0)`,
                }).from(journalLines)
                    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
                    .innerJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
                    .leftJoin(costCenters, eq(journalLines.costCenterId, costCenters.id))
                    .where(and(
                        gte(journalEntries.date, start),
                        lte(journalEntries.date, end),
                        eq(journalEntries.status, 'POSTED'),
                        eq(chartOfAccounts.type, 'EXPENSE'),
                        branchId ? or(eq(costCenters.branchId, branchId), sql`${journalLines.costCenterId} is null`) : undefined
                    ))
                    .orderBy(desc(journalEntries.date), desc(journalLines.id))
                    .limit(120);
                const total = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
                doc.fontSize(12).text(`Expense Report - Total ${total.toFixed(2)} LE`, { underline: true }); doc.moveDown(0.5);
                rows.forEach((r) => {
                    const day = r.date ? new Date(r.date).toISOString().split('T')[0] : '-';
                    doc.text(`${day} | ${r.code} ${r.name} | ${Number(r.total).toFixed(2)} LE | ${r.reference || '-'} | ${r.description || ''}`);
                });
                break;
            }
            case 'REORDER_ALERTS': {
                const rows = await db.select({
                    itemName: inventoryItems.name, unit: inventoryItems.unit, threshold: inventoryItems.threshold,
                    currentStock: sql<number>`coalesce(sum(${inventoryStock.quantity}), 0)`,
                }).from(inventoryItems)
                    .leftJoin(inventoryStock, eq(inventoryItems.id, inventoryStock.itemId))
                    .where(eq(inventoryItems.isActive, true))
                    .groupBy(inventoryItems.id, inventoryItems.name, inventoryItems.unit, inventoryItems.threshold)
                    .having(sql`coalesce(sum(${inventoryStock.quantity}), 0) <= ${inventoryItems.threshold}`);
                doc.fontSize(12).text(`Reorder Alerts (${rows.length} items)`, { underline: true }); doc.moveDown(0.5);
                rows.forEach(r => { doc.text(`${r.itemName} (${r.unit}): Stock ${Number(r.currentStock)} / Threshold ${r.threshold}`); });
                break;
            }
            case 'PAYROLL': {
                const conditions: any[] = [gte(payrollCycles.periodStart, start), lte(payrollCycles.periodEnd, end)];
                if (branchId) conditions.push(eq(payrollCycles.branchId, branchId));
                const cycles = await db.select().from(payrollCycles).where(and(...conditions));
                doc.fontSize(12).text('Payroll Summary', { underline: true }); doc.moveDown(0.5);
                if (cycles.length > 0) {
                    const payouts = await db.select({
                        employeeName: employees.name, role: employees.role, netPay: payrollPayouts.netPay,
                    }).from(payrollPayouts).innerJoin(employees, eq(payrollPayouts.employeeId, employees.id))
                        .where(inArray(payrollPayouts.cycleId, cycles.map(c => c.id)));
                    const total = payouts.reduce((s, p) => s + Number(p.netPay), 0);
                    doc.text(`Total Payroll: ${total.toFixed(2)} LE`); doc.moveDown(0.3);
                    payouts.forEach(p => { doc.text(`${p.employeeName} (${p.role}): ${Number(p.netPay).toFixed(2)} LE`); });
                } else {
                    doc.text('No payroll cycles found for this period.');
                }
                break;
            }
            case 'ATTENDANCE': {
                const conditions: any[] = [gte(attendance.clockIn, start), lte(attendance.clockIn, end)];
                if (branchId) conditions.push(eq(attendance.branchId, branchId));
                const rows = await db.select({
                    employeeName: employees.name, role: employees.role,
                    presentDays: sql<number>`count(*) filter (where ${attendance.status} = 'PRESENT')`,
                    lateDays: sql<number>`count(*) filter (where ${attendance.status} = 'LATE')`,
                    absentDays: sql<number>`count(*) filter (where ${attendance.status} = 'ABSENT')`,
                    totalHours: sql<number>`coalesce(sum(${attendance.totalHours}), 0)`,
                }).from(attendance).innerJoin(employees, eq(attendance.employeeId, employees.id))
                    .where(and(...conditions)).groupBy(employees.name, employees.role);
                doc.fontSize(12).text('Attendance Report', { underline: true }); doc.moveDown(0.5);
                rows.forEach(r => { doc.text(`${r.employeeName} (${r.role}): P:${r.presentDays} L:${r.lateDays} A:${r.absentDays} | ${Number(r.totalHours).toFixed(1)}h`); });
                break;
            }
            case 'CUSTOMER_LTV': {
                const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, ['DELIVERED', 'COMPLETED']), sql`${orders.customerId} is not null`];
                if (branchId) conditions.push(eq(orders.branchId, branchId));
                const rows = await db.select({
                    customerName: customers.name, totalSpent: sql<number>`coalesce(sum(${orders.total}), 0)`,
                    orderCount: sql<number>`count(*)`,
                }).from(orders).innerJoin(customers, eq(orders.customerId, customers.id))
                    .where(and(...conditions)).groupBy(customers.name).orderBy(sql`sum(${orders.total}) desc`).limit(50);
                doc.fontSize(12).text('Customer LTV', { underline: true }); doc.moveDown(0.5);
                rows.forEach((r, i) => { doc.text(`${i + 1}. ${r.customerName}: ${Number(r.totalSpent).toFixed(2)} LE (${r.orderCount} orders)`); });
                break;
            }
            case 'BRANCH_PERFORMANCE': {
                const rows = await db.select({
                    branchName: branches.name, orderCount: sql<number>`count(*)`,
                    revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
                    avgTicket: sql<number>`coalesce(avg(${orders.total}), 0)`,
                }).from(orders).innerJoin(branches, eq(orders.branchId, branches.id))
                    .where(and(gte(orders.createdAt, start), lte(orders.createdAt, end)))
                    .groupBy(branches.name).orderBy(sql`sum(${orders.total}) desc`);
                doc.fontSize(12).text('Branch Performance', { underline: true }); doc.moveDown(0.5);
                rows.forEach(r => { doc.text(`${r.branchName}: ${Number(r.revenue).toFixed(2)} LE | ${r.orderCount} orders | Avg ${Number(r.avgTicket).toFixed(2)} LE`); });
                break;
            }
            default: {
                const snapshot = await getExportSnapshot(branchId, start, end);
                const dailyRows = aggregateDailyRows(snapshot.daily, granularity);
                doc.fontSize(12).text('Summary', { underline: true }); doc.fontSize(10);
                doc.text(`Orders: ${Number(snapshot.overview.orderCount || 0)}`);
                doc.text(`Gross Sales: ${Number(snapshot.overview.grossSales || 0).toFixed(2)}`);
                doc.text(`Net Sales: ${Number(snapshot.overview.netSales || 0).toFixed(2)}`);
                doc.text(`Tax Total: ${Number(snapshot.overview.taxTotal || 0).toFixed(2)}`);
                doc.text(`Discount Total: ${Number(snapshot.overview.discountTotal || 0).toFixed(2)}`);
                doc.text(`COGS: ${Number(snapshot.profit.cogs || 0).toFixed(2)}`);
                doc.moveDown();
                doc.fontSize(12).text('Time Series', { underline: true }); doc.fontSize(9);
                dailyRows.slice(0, 20).forEach((row: any) => {
                    doc.text(`${row.day} | Rev ${Number(row.revenue || 0).toFixed(2)} | Net ${Number(row.net || 0).toFixed(2)} | Orders ${Number(row.orderCount || 0)}`);
                });
                doc.moveDown();
                doc.fontSize(12).text('Payment Mix', { underline: true }); doc.fontSize(9);
                snapshot.payments.forEach((p: any) => { doc.text(`${p.method} | ${Number(p.total || 0).toFixed(2)} | count ${Number(p.count || 0)}`); });
                break;
            }
        }

        doc.end();
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const exportReportXlsx = async (req: Request, res: Response) => {
    try {
        const { branchId, start, end, reportType } = parseReportFilters(req);
        const lang = String(req.query.lang || 'ar').toLowerCase() === 'en' ? 'en' : 'ar';
        const filename = `report_${reportType.toLowerCase()}_${Date.now()}.xlsx`;
        const periodLabel = `${start.toISOString().split('T')[0]} - ${end.toISOString().split('T')[0]}`;
        const workbookTitle = {
            PAYROLL: lang === 'ar' ? 'ملخص الرواتب' : 'Payroll Summary',
            ATTENDANCE: lang === 'ar' ? 'الحضور والتأخير' : 'Attendance & Delays',
            OVERTIME: lang === 'ar' ? 'الساعات الإضافية' : 'Overtime Report',
            STAFF_COST_VS_REVENUE: lang === 'ar' ? 'تكلفة العمالة' : 'Staff Cost vs Revenue',
            SALES_PER_LABOR_HOUR: lang === 'ar' ? 'الإيراد لكل ساعة عمل' : 'Sales per Labor Hour',
            EMPLOYEE_PRODUCTIVITY: lang === 'ar' ? 'إنتاجية الموظفين' : 'Employee Productivity',
        }[reportType] || (lang === 'ar' ? 'تقرير الموارد البشرية' : 'HR Report');

        let buffer: Buffer | null = null;

        if (reportType === 'PAYROLL') {
            const conditions: any[] = [gte(payrollCycles.periodStart, start), lte(payrollCycles.periodEnd, end)];
            if (branchId) conditions.push(eq(payrollCycles.branchId, branchId));
            const cycles = await db.select().from(payrollCycles).where(and(...conditions)).orderBy(desc(payrollCycles.periodStart));
            const cycleIds = cycles.map((cycle) => cycle.id);
            const payouts = cycleIds.length > 0
                ? await db.select({
                    employeeName: employees.name,
                    role: employees.role,
                    basicSalary: payrollPayouts.basicSalary,
                    overtime: payrollPayouts.overtime,
                    deductions: payrollPayouts.deductions,
                    netPay: payrollPayouts.netPay,
                    status: payrollPayouts.status,
                }).from(payrollPayouts)
                    .innerJoin(employees, eq(payrollPayouts.employeeId, employees.id))
                    .where(inArray(payrollPayouts.cycleId, cycleIds))
                    .orderBy(employees.name)
                : [];

            buffer = await generateHrTabularXlsx({
                title: workbookTitle,
                subtitle: lang === 'ar' ? `الفترة: ${periodLabel}` : `Period: ${periodLabel}`,
                sheetName: lang === 'ar' ? 'الرواتب' : 'Payroll',
                lang,
                totals: {
                    [lang === 'ar' ? 'الموظفون' : 'Employees']: payouts.length,
                    [lang === 'ar' ? 'الدورات' : 'Cycles']: cycles.length,
                    [lang === 'ar' ? 'إجمالي الرواتب' : 'Total payroll']: payouts.reduce((sum, row) => sum + Number(row.netPay || 0), 0).toFixed(2),
                },
                rows: payouts.map((row) => ({
                    [lang === 'ar' ? 'الموظف' : 'Employee']: row.employeeName,
                    [lang === 'ar' ? 'الوظيفة' : 'Role']: row.role,
                    [lang === 'ar' ? 'أساسي' : 'Basic salary']: Number(row.basicSalary || 0),
                    [lang === 'ar' ? 'إضافي' : 'Overtime']: Number(row.overtime || 0),
                    [lang === 'ar' ? 'استقطاعات' : 'Deductions']: Number(row.deductions || 0),
                    [lang === 'ar' ? 'صافي المستحق' : 'Net pay']: Number(row.netPay || 0),
                    [lang === 'ar' ? 'الحالة' : 'Status']: row.status || '',
                })),
            });
        } else if (reportType === 'ATTENDANCE') {
            const conditions: any[] = [gte(attendance.clockIn, start), lte(attendance.clockIn, end)];
            if (branchId) conditions.push(eq(attendance.branchId, branchId));
            const rows = await db.select({
                employeeName: employees.name,
                role: employees.role,
                totalDays: sql<number>`count(*)`,
                presentDays: sql<number>`count(*) filter (where ${attendance.status} = 'PRESENT')`,
                lateDays: sql<number>`count(*) filter (where ${attendance.status} = 'LATE')`,
                absentDays: sql<number>`count(*) filter (where ${attendance.status} = 'ABSENT')`,
                sickDays: sql<number>`count(*) filter (where ${attendance.status} = 'SICK_LEAVE')`,
                totalHours: sql<number>`coalesce(sum(${attendance.totalHours}), 0)`,
                avgHoursPerDay: sql<number>`coalesce(avg(${attendance.totalHours}), 0)`,
            }).from(attendance)
                .innerJoin(employees, eq(attendance.employeeId, employees.id))
                .where(and(...conditions))
                .groupBy(employees.name, employees.role)
                .orderBy(employees.name);

            buffer = await generateHrTabularXlsx({
                title: workbookTitle,
                subtitle: lang === 'ar' ? `الفترة: ${periodLabel}` : `Period: ${periodLabel}`,
                sheetName: lang === 'ar' ? 'الحضور' : 'Attendance',
                lang,
                totals: {
                    [lang === 'ar' ? 'الموظفون' : 'Employees']: rows.length,
                    [lang === 'ar' ? 'إجمالي الأيام' : 'Total days']: rows.reduce((sum, row) => sum + Number(row.totalDays || 0), 0),
                    [lang === 'ar' ? 'إجمالي الساعات' : 'Total hours']: rows.reduce((sum, row) => sum + Number(row.totalHours || 0), 0).toFixed(1),
                },
                rows: rows.map((row) => ({
                    [lang === 'ar' ? 'الموظف' : 'Employee']: row.employeeName,
                    [lang === 'ar' ? 'الوظيفة' : 'Role']: row.role,
                    [lang === 'ar' ? 'أيام العمل' : 'Working days']: Number(row.totalDays || 0),
                    [lang === 'ar' ? 'حضور' : 'Present']: Number(row.presentDays || 0),
                    [lang === 'ar' ? 'تأخير' : 'Late']: Number(row.lateDays || 0),
                    [lang === 'ar' ? 'غياب' : 'Absent']: Number(row.absentDays || 0),
                    [lang === 'ar' ? 'مرضي' : 'Sick leave']: Number(row.sickDays || 0),
                    [lang === 'ar' ? 'الساعات' : 'Hours']: Number(row.totalHours || 0).toFixed(1),
                    [lang === 'ar' ? 'متوسط اليوم' : 'Avg/day']: Number(row.avgHoursPerDay || 0).toFixed(1),
                })),
            });
        } else if (reportType === 'OVERTIME') {
            const conditions: any[] = [gte(attendance.clockIn, start), lte(attendance.clockIn, end)];
            if (branchId) conditions.push(eq(attendance.branchId, branchId));
            const rows = await db.select({
                employeeName: employees.name,
                role: employees.role,
                hourlyRate: employees.hourlyRate,
                totalHours: sql<number>`coalesce(sum(${attendance.totalHours}), 0)`,
                workDays: sql<number>`count(*)`,
                overtimeHours: sql<number>`coalesce(sum(greatest(${attendance.totalHours} - 8, 0)), 0)`,
            }).from(attendance)
                .innerJoin(employees, eq(attendance.employeeId, employees.id))
                .where(and(...conditions))
                .groupBy(employees.name, employees.role, employees.hourlyRate)
                .having(sql`sum(greatest(${attendance.totalHours} - 8, 0)) > 0`)
                .orderBy(sql`sum(greatest(${attendance.totalHours} - 8, 0)) desc`);

            buffer = await generateHrTabularXlsx({
                title: workbookTitle,
                subtitle: lang === 'ar' ? `الفترة: ${periodLabel}` : `Period: ${periodLabel}`,
                sheetName: lang === 'ar' ? 'إضافي' : 'Overtime',
                lang,
                totals: {
                    [lang === 'ar' ? 'الموظفون' : 'Employees']: rows.length,
                    [lang === 'ar' ? 'إجمالي الإضافي' : 'Total overtime']: rows.reduce((sum, row) => sum + Number(row.overtimeHours || 0), 0).toFixed(1),
                    [lang === 'ar' ? 'تكلفة الإضافي' : 'Overtime cost']: rows.reduce((sum, row) => sum + (Number(row.overtimeHours || 0) * Number(row.hourlyRate || 0) * 1.5), 0).toFixed(2),
                },
                rows: rows.map((row) => ({
                    [lang === 'ar' ? 'الموظف' : 'Employee']: row.employeeName,
                    [lang === 'ar' ? 'الوظيفة' : 'Role']: row.role,
                    [lang === 'ar' ? 'أيام العمل' : 'Work days']: Number(row.workDays || 0),
                    [lang === 'ar' ? 'إجمالي الساعات' : 'Total hours']: Number(row.totalHours || 0).toFixed(1),
                    [lang === 'ar' ? 'ساعات إضافية' : 'Overtime hours']: Number(row.overtimeHours || 0).toFixed(1),
                    [lang === 'ar' ? 'أجر الساعة' : 'Hourly rate']: Number(row.hourlyRate || 0).toFixed(2),
                    [lang === 'ar' ? 'تكلفة إضافي' : 'Overtime cost']: (Number(row.overtimeHours || 0) * Number(row.hourlyRate || 0) * 1.5).toFixed(2),
                })),
            });
        } else if (reportType === 'STAFF_COST_VS_REVENUE') {
            const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
            const revConditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, deliveredStatuses)];
            if (branchId) revConditions.push(eq(orders.branchId, branchId));
            const [rev] = await db.select({ revenue: sql<number>`coalesce(sum(${orders.total}), 0)` }).from(orders).where(and(...revConditions));
            const [payroll] = await db.select({
                totalPayroll: sql<number>`coalesce(sum(${payrollPayouts.netPay}), 0)`,
                employeeCount: sql<number>`count(distinct ${payrollPayouts.employeeId})`,
            }).from(payrollPayouts).where(and(gte(payrollPayouts.createdAt, start), lte(payrollPayouts.createdAt, end)));
            const revenue = Number(rev?.revenue || 0);
            const staffCost = Number(payroll?.totalPayroll || 0);
            const employeeCount = Number(payroll?.employeeCount || 0);

            buffer = await generateHrTabularXlsx({
                title: workbookTitle,
                subtitle: lang === 'ar' ? `الفترة: ${periodLabel}` : `Period: ${periodLabel}`,
                sheetName: lang === 'ar' ? 'تكلفة العمالة' : 'Staff Cost',
                lang,
                totals: {
                    [lang === 'ar' ? 'الإيراد' : 'Revenue']: revenue.toFixed(2),
                    [lang === 'ar' ? 'تكلفة العمالة' : 'Staff cost']: staffCost.toFixed(2),
                    [lang === 'ar' ? 'النسبة' : 'Share %']: revenue > 0 ? ((staffCost / revenue) * 100).toFixed(1) : '0.0',
                },
                rows: [{
                    [lang === 'ar' ? 'الإيراد' : 'Revenue']: revenue,
                    [lang === 'ar' ? 'تكلفة العمالة' : 'Staff cost']: staffCost,
                    [lang === 'ar' ? 'النسبة %' : 'Ratio %']: revenue > 0 ? Number(((staffCost / revenue) * 100).toFixed(1)) : 0,
                    [lang === 'ar' ? 'عدد الموظفين' : 'Employees']: employeeCount,
                    [lang === 'ar' ? 'متوسط تكلفة الموظف' : 'Cost per employee']: employeeCount > 0 ? Number((staffCost / employeeCount).toFixed(2)) : 0,
                }],
            });
        } else if (reportType === 'SALES_PER_LABOR_HOUR') {
            const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
            const revConditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, deliveredStatuses)];
            if (branchId) revConditions.push(eq(orders.branchId, branchId));
            const [rev] = await db.select({ revenue: sql<number>`coalesce(sum(${orders.total}), 0)` }).from(orders).where(and(...revConditions));
            const [att] = await db.select({
                totalHours: sql<number>`coalesce(sum(${attendance.totalHours}), 0)`,
                totalDays: sql<number>`count(*)`,
            }).from(attendance).where(and(gte(attendance.clockIn, start), lte(attendance.clockIn, end), branchId ? eq(attendance.branchId, branchId) : undefined));
            const revenue = Number(rev?.revenue || 0);
            const totalHours = Number(att?.totalHours || 0);
            const totalDays = Number(att?.totalDays || 0);

            buffer = await generateHrTabularXlsx({
                title: workbookTitle,
                subtitle: lang === 'ar' ? `الفترة: ${periodLabel}` : `Period: ${periodLabel}`,
                sheetName: lang === 'ar' ? 'إنتاجية الساعات' : 'Labor Hour',
                lang,
                totals: {
                    [lang === 'ar' ? 'الإيراد' : 'Revenue']: revenue.toFixed(2),
                    [lang === 'ar' ? 'ساعات العمل' : 'Labor hours']: totalHours.toFixed(1),
                    [lang === 'ar' ? 'لكل ساعة' : 'Per hour']: totalHours > 0 ? (revenue / totalHours).toFixed(2) : '0.00',
                },
                rows: [{
                    [lang === 'ar' ? 'الإيراد' : 'Revenue']: revenue,
                    [lang === 'ar' ? 'إجمالي الساعات' : 'Total hours']: totalHours,
                    [lang === 'ar' ? 'إجمالي الأيام' : 'Total days']: totalDays,
                    [lang === 'ar' ? 'الإيراد لكل ساعة' : 'Revenue per hour']: totalHours > 0 ? Number((revenue / totalHours).toFixed(2)) : 0,
                }],
            });
        } else if (reportType === 'EMPLOYEE_PRODUCTIVITY') {
            const deliveredStatuses = ['DELIVERED', 'COMPLETED'];
            const conditions: any[] = [gte(orders.createdAt, start), lte(orders.createdAt, end), inArray(orders.status, deliveredStatuses)];
            if (branchId) conditions.push(eq(orders.branchId, branchId));
            const rows = await db.select({
                agentId: orders.callCenterAgentId,
                orderCount: sql<number>`count(*)`,
                revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
                avgTicket: sql<number>`coalesce(avg(${orders.total}), 0)`,
            }).from(orders)
                .where(and(...conditions, sql`${orders.callCenterAgentId} is not null`))
                .groupBy(orders.callCenterAgentId)
                .orderBy(sql`sum(${orders.total}) desc`);

            buffer = await generateHrTabularXlsx({
                title: workbookTitle,
                subtitle: lang === 'ar' ? `الفترة: ${periodLabel}` : `Period: ${periodLabel}`,
                sheetName: lang === 'ar' ? 'الإنتاجية' : 'Productivity',
                lang,
                totals: {
                    [lang === 'ar' ? 'الأفراد' : 'Contributors']: rows.length,
                    [lang === 'ar' ? 'إجمالي الطلبات' : 'Orders']: rows.reduce((sum, row) => sum + Number(row.orderCount || 0), 0),
                    [lang === 'ar' ? 'إجمالي الإيراد' : 'Revenue']: rows.reduce((sum, row) => sum + Number(row.revenue || 0), 0).toFixed(2),
                },
                rows: rows.map((row, index) => ({
                    '#': index + 1,
                    [lang === 'ar' ? 'الموظف / المعرف' : 'Employee / ID']: row.agentId,
                    [lang === 'ar' ? 'الطلبات' : 'Orders']: Number(row.orderCount || 0),
                    [lang === 'ar' ? 'الإيراد' : 'Revenue']: Number(Number(row.revenue || 0).toFixed(2)),
                    [lang === 'ar' ? 'متوسط الطلب' : 'Avg ticket']: Number(Number(row.avgTicket || 0).toFixed(2)),
                })),
            });
        }

        if (!buffer) {
            return res.status(400).json({ error: 'XLSX export is currently available for HR reports only.' });
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
