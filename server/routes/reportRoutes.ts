import { NextFunction, Request, Response, Router } from 'express';
import * as reportController from '../controllers/reportController';
import { scopeBranchQuery } from '../middleware/branchIsolation';

const router = Router();

const HR_REPORT_PATHS = new Set([
    '/payroll-summary',
    '/attendance-report',
    '/overtime-report',
    '/staff-cost-vs-revenue',
    '/sales-per-labor-hour',
    '/employee-productivity',
]);

const HR_EXPORT_TYPES = new Set([
    'PAYROLL',
    'ATTENDANCE',
    'OVERTIME',
    'STAFF_COST_VS_REVENUE',
    'SALES_PER_LABOR_HOUR',
    'EMPLOYEE_PRODUCTIVITY',
]);

const restrictHrReportScope = (req: Request, res: Response, next: NextFunction) => {
    const role = String((req as any).user?.role || '');
    const isHrOnly = role === 'HR_MANAGER' || role === 'PAYROLL_OFFICER';
    if (!isHrOnly) return next();

    if (HR_REPORT_PATHS.has(req.path)) return next();

    if (req.path === '/export/csv' || req.path === '/export/pdf' || req.path === '/export/xlsx') {
        const reportType = String(req.query.reportType || '').toUpperCase();
        if (HR_EXPORT_TYPES.has(reportType)) return next();
    }

    return res.status(403).json({
        code: 'HR_REPORT_SCOPE_ONLY',
        message: 'This account can only access HR reports.',
    });
};

router.use(scopeBranchQuery);
router.use(restrictHrReportScope);

router.get('/vat', reportController.getVatReport);
router.get('/payments', reportController.getPaymentMethodSummary);
router.get('/fiscal', reportController.getFiscalSummary);
router.get('/daily-sales', reportController.getDailySales);
router.get('/hourly-sales', reportController.getHourlySales);
router.get('/cashier-summary', reportController.getCashierSummary);
router.get('/refunds', reportController.getRefundsReport);
router.get('/overview', reportController.getOverview);
router.get('/profit-summary', reportController.getProfitSummary);
router.get('/profit-daily', reportController.getProfitDaily);
router.get('/food-cost', reportController.getFoodCostReport);
router.get('/dashboard-kpis', reportController.getDashboardKpis);
router.get('/integrity', reportController.getIntegrityChecks);
router.get('/export/csv', reportController.exportReportCsv);
router.get('/export/pdf', reportController.exportReportPdf);
router.get('/export/xlsx', reportController.exportReportXlsx);

// Finance
router.get('/trial-balance', reportController.getTrialBalance);
router.get('/profit-loss', reportController.getProfitAndLoss);
router.get('/top-expenses', reportController.getTopExpenses);
router.get('/expenses', reportController.getExpenseReport);

// Inventory
router.get('/stock-movements', reportController.getStockMovementLog);
router.get('/waste-loss', reportController.getWasteLossLog);
router.get('/reorder-alerts', reportController.getReorderAlerts);
router.get('/expiring-batches', reportController.getExpiringBatches);

// HR
router.get('/payroll-summary', reportController.getPayrollSummary);
router.get('/attendance-report', reportController.getAttendanceReport);
router.get('/overtime-report', reportController.getOvertimeReport);

// CRM
router.get('/customer-ltv', reportController.getCustomerLTV);
router.get('/campaign-roi', reportController.getCampaignROI);

// Operations
router.get('/branch-performance', reportController.getBranchPerformance);
router.get('/order-prep-time', reportController.getOrderPrepTime);

// Extended Sales
router.get('/sales-by-order-type', reportController.getSalesByOrderType);
router.get('/sales-by-item', reportController.getSalesByItem);
router.get('/sales-by-category', reportController.getSalesByCategory);
router.get('/discount-analysis', reportController.getDiscountAnalysis);
router.get('/cancelled-orders', reportController.getCancelledOrders);
router.get('/delivery-performance', reportController.getDeliveryPerformance);
router.get('/sales-by-source', reportController.getSalesBySource);
router.get('/dine-in-tables', reportController.getDineInTableAnalysis);

// Advanced Sales Analytics
router.get('/peak-hours-heatmap', reportController.getPeakHoursHeatmap);
router.get('/modifier-sales', reportController.getModifierSales);
router.get('/avg-ticket-trend', reportController.getAvgTicketTrend);
router.get('/sales-comparison', reportController.getSalesComparison);
router.get('/slow-moving-items', reportController.getSlowMovingItems);
router.get('/revenue-by-weekday', reportController.getRevenueByWeekday);
router.get('/void-items', reportController.getVoidItemsLog);

// Advanced Finance
router.get('/tips-report', reportController.getTipsReport);
router.get('/service-charge-report', reportController.getServiceChargeReport);
router.get('/shift-summary', reportController.getShiftSummary);

// Advanced Inventory
router.get('/actual-vs-theoretical', reportController.getActualVsTheoretical);
router.get('/purchase-history', reportController.getPurchaseHistory);
router.get('/inventory-valuation', reportController.getInventoryValuation);

// Advanced HR
router.get('/staff-cost-vs-revenue', reportController.getStaffCostVsRevenue);
router.get('/sales-per-labor-hour', reportController.getSalesPerLaborHour);

// Advanced CRM
router.get('/customer-retention', reportController.getCustomerRetention);
router.get('/new-vs-returning', reportController.getNewVsReturning);
router.get('/customer-frequency', reportController.getCustomerFrequency);

// Advanced Operations
router.get('/kitchen-performance', reportController.getKitchenPerformance);

// Strategic Sales
router.get('/menu-engineering', reportController.getMenuEngineeringMatrix);
router.get('/daypart-analysis', reportController.getDaypartAnalysis);
router.get('/basket-analysis', reportController.getBasketAnalysis);
router.get('/seasonality', reportController.getSeasonalityReport);
router.get('/online-vs-offline', reportController.getOnlineVsOfflineTrend);

// Strategic Finance
router.get('/food-cost-trend', reportController.getFoodCostTrend);
router.get('/tax-compliance', reportController.getTaxComplianceSummary);
router.get('/audit-trail', reportController.getAuditTrailReport);
router.get('/cash-flow-forecast', reportController.getCashFlowForecast);

// Strategic Inventory
router.get('/supplier-price-tracking', reportController.getSupplierPriceTracking);
router.get('/recipe-cost-alerts', reportController.getRecipeCostAlerts);
router.get('/abc-classification', reportController.getABCClassification);

// Strategic HR
router.get('/employee-productivity', reportController.getEmployeeProductivity);

// Strategic CRM
router.get('/customer-churn', reportController.getCustomerChurn);
router.get('/loyalty-points', reportController.getLoyaltyPointsReport);
router.get('/promotion-impact', reportController.getPromotionImpact);

// Strategic Operations
router.get('/table-turnover', reportController.getTableTurnoverRate);
router.get('/wait-time', reportController.getWaitTimeReport);
router.get('/driver-utilization', reportController.getDriverUtilization);
router.get('/branch-comparison', reportController.getBranchComparison);

// AI & Predictive
router.get('/demand-forecast', reportController.getDemandForecast);
router.get('/price-elasticity', reportController.getPriceElasticity);
router.get('/menu-cannibalization', reportController.getMenuCannibalization);
router.get('/anomaly-detection', reportController.getAnomalyDetection);
router.get('/break-even', reportController.getBreakEvenAnalysis);
router.get('/payment-reconciliation', reportController.getPaymentReconciliation);
router.get('/daily-flash', reportController.getDailyFlashReport);
router.get('/menu-lifecycle', reportController.getMenuItemLifecycle);
router.get('/category-contribution', reportController.getCategoryContribution);
router.get('/shift-profitability', reportController.getShiftProfitability);
router.get('/delivery-zone', reportController.getDeliveryZoneAnalysis);
router.get('/delivery-cost-revenue', reportController.getDeliveryCostVsRevenue);
router.get('/customer-journey', reportController.getCustomerJourneyFunnel);
router.get('/channel-mix', reportController.getChannelMixTrend);
router.get('/optimal-pricing', reportController.getOptimalPricing);
router.get('/third-party-vs-inhouse', reportController.getThirdPartyVsInHouse);
router.get('/time-to-first-order', reportController.getTimeToFirstOrder);

export default router;
