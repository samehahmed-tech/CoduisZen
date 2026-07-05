import { useState, useMemo, useRef, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '../../stores/useAuthStore';
import { reportsApi } from '../../services/api/reports';
import { UserRole } from '../../types';

// ?? Types ??
export interface ReportCategory {
   id: string;
   label: string;
   color: string;
   icon: React.ComponentType<any>;
   subReports: string[];
}

export interface DateRange {
   start: string;
   end: string;
}

export interface ReportParams {
   branchId?: string;
   startDate: string;
   endDate: string;
}

// ?? State Hook ??
export function useReportsState() {
   const { settings, branches } = useAuthStore(
      useShallow((state) => ({
         settings: state.settings,
         branches: state.branches,
      }))
   );
   const activeBranchId = settings.activeBranchId;
   const currentRole = settings.currentUser?.role;
   const isHrReportsOnly = currentRole === UserRole.HR_MANAGER || currentRole === UserRole.PAYROLL_OFFICER;

   const [activeCategory, setActiveCategory] = useState<string>(isHrReportsOnly ? 'HR' : 'SALES');
   const [activeSubReport, setActiveSubReport] = useState<string>(isHrReportsOnly ? 'Payroll Summary' : 'Daily Sales');
   const [dateRange, setDateRange] = useState<DateRange>({
      start: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0],
      end: new Date().toISOString().split('T')[0]
   });
   const [appliedRange, setAppliedRange] = useState(dateRange);
   const [isLoadingReport, setIsLoadingReport] = useState(false);
   const [reportError, setReportError] = useState<string | null>(null);
   const printableRootRef = useRef<HTMLDivElement | null>(null);

   // ?? All report data states ??
   const [dailySales, setDailySales] = useState<any[]>([]);
   const [profitDaily, setProfitDaily] = useState<any[]>([]);
   const [overview, setOverview] = useState<any>(null);
   const [profitSummary, setProfitSummary] = useState<any>(null);
   const [foodCostData, setFoodCostData] = useState<any[]>([]);
   const [paymentSummary, setPaymentSummary] = useState<any[]>([]);
   const [vatReport, setVatReport] = useState<any>(null);
   const [hourlySales, setHourlySales] = useState<any[]>([]);
   const [cashierSummary, setCashierSummary] = useState<any[]>([]);
   const [refunds, setRefunds] = useState<any[]>([]);
   const [integrity, setIntegrity] = useState<any>(null);
   const [trialBalance, setTrialBalance] = useState<any[]>([]);
   const [profitAndLoss, setProfitAndLoss] = useState<any>(null);
   const [topExpenses, setTopExpenses] = useState<any[]>([]);
   const [expenseReport, setExpenseReport] = useState<any>(null);
   const [stockMovementLog, setStockMovementLog] = useState<any[]>([]);
   const [wasteLoss, setWasteLoss] = useState<any>(null);
   const [reorderAlerts, setReorderAlerts] = useState<any[]>([]);
   const [expiringBatches, setExpiringBatches] = useState<any>(null);
   const [payrollData, setPayrollData] = useState<any>(null);
   const [attendanceData, setAttendanceData] = useState<any[]>([]);
   const [overtimeData, setOvertimeData] = useState<any[]>([]);
   const [customerLTV, setCustomerLTV] = useState<any[]>([]);
   const [campaignROI, setCampaignROI] = useState<any[]>([]);
   const [branchPerformance, setBranchPerformance] = useState<any[]>([]);
   const [orderPrepTime, setOrderPrepTime] = useState<any[]>([]);
   const [salesByOrderType, setSalesByOrderType] = useState<any[]>([]);
   const [salesByItem, setSalesByItem] = useState<any[]>([]);
   const [salesByCategory, setSalesByCategory] = useState<any[]>([]);
   const [discountAnalysis, setDiscountAnalysis] = useState<any>(null);
   const [cancelledOrders, setCancelledOrders] = useState<any>(null);
   const [deliveryPerformance, setDeliveryPerformance] = useState<any>(null);
   const [salesBySource, setSalesBySource] = useState<any[]>([]);
   const [dineInTables, setDineInTables] = useState<any[]>([]);
   const [peakHoursData, setPeakHoursData] = useState<any[]>([]);
   const [modifierSalesData, setModifierSalesData] = useState<any[]>([]);
   const [avgTicketTrend, setAvgTicketTrend] = useState<any[]>([]);
   const [salesComparisonData, setSalesComparisonData] = useState<any>(null);
   const [slowMovingItems, setSlowMovingItems] = useState<any[]>([]);
   const [revenueByWeekday, setRevenueByWeekday] = useState<any[]>([]);
   const [voidItemsData, setVoidItemsData] = useState<any>(null);
   const [tipsData, setTipsData] = useState<any>(null);
   const [serviceChargeData, setServiceChargeData] = useState<any>(null);
   const [shiftSummaryData, setShiftSummaryData] = useState<any[]>([]);
   const [actualVsTheoreticalData, setActualVsTheoreticalData] = useState<any[]>([]);
   const [purchaseHistoryData, setPurchaseHistoryData] = useState<any>(null);
   const [inventoryValuationData, setInventoryValuationData] = useState<any>(null);
   const [staffCostData, setStaffCostData] = useState<any>(null);
   const [salesPerLaborData, setSalesPerLaborData] = useState<any>(null);
   const [customerRetentionData, setCustomerRetentionData] = useState<any>(null);
   const [newVsReturningData, setNewVsReturningData] = useState<any>(null);
   const [customerFrequencyData, setCustomerFrequencyData] = useState<any>(null);
   const [kitchenPerformanceData, setKitchenPerformanceData] = useState<any[]>([]);
   const [menuEngineeringData, setMenuEngineeringData] = useState<any>(null);
   const [daypartData, setDaypartData] = useState<any[]>([]);
   const [basketData, setBasketData] = useState<any[]>([]);
   const [seasonalityData, setSeasonalityData] = useState<any[]>([]);
   const [onlineOfflineData, setOnlineOfflineData] = useState<any[]>([]);
   const [foodCostTrendData, setFoodCostTrendData] = useState<any[]>([]);
   const [taxComplianceData, setTaxComplianceData] = useState<any>(null);
   const [auditTrailData, setAuditTrailData] = useState<any>(null);
   const [cashFlowData, setCashFlowData] = useState<any>(null);
   const [supplierPriceData, setSupplierPriceData] = useState<any[]>([]);
   const [recipeCostData, setRecipeCostData] = useState<any>(null);
   const [abcData, setAbcData] = useState<any>(null);
   const [empProductivityData, setEmpProductivityData] = useState<any[]>([]);
   const [churnData, setChurnData] = useState<any>(null);
   const [loyaltyData, setLoyaltyData] = useState<any>(null);
   const [promoImpactData, setPromoImpactData] = useState<any[]>([]);
   const [tableTurnoverData, setTableTurnoverData] = useState<any[]>([]);
   const [waitTimeData, setWaitTimeData] = useState<any>(null);
   const [driverUtilData, setDriverUtilData] = useState<any[]>([]);
   const [branchCompData, setBranchCompData] = useState<any>(null);
   const [demandForecastData, setDemandForecastData] = useState<any>(null);
   const [priceElasticityData, setPriceElasticityData] = useState<any[]>([]);
   const [cannibalizationData, setCannibalizationData] = useState<any>(null);
   const [anomalyData, setAnomalyData] = useState<any>(null);
   const [breakEvenData, setBreakEvenData] = useState<any>(null);
   const [reconciliationData, setReconciliationData] = useState<any>(null);
   const [dailyFlashData, setDailyFlashData] = useState<any>(null);
   const [menuLifecycleData, setMenuLifecycleData] = useState<any[]>([]);
   const [catContribData, setCatContribData] = useState<any[]>([]);
   const [shiftProfitData, setShiftProfitData] = useState<any[]>([]);
   const [deliveryZoneData, setDeliveryZoneData] = useState<any[]>([]);
   const [deliveryCostData, setDeliveryCostData] = useState<any>(null);
   const [journeyFunnelData, setJourneyFunnelData] = useState<any[]>([]);
   const [channelMixData, setChannelMixData] = useState<any[]>([]);
   const [optimalPricingData, setOptimalPricingData] = useState<any>(null);
   const [thirdPartyData, setThirdPartyData] = useState<any>(null);
   const [timeToFirstData, setTimeToFirstData] = useState<any[]>([]);

   // ?? On-Demand Report Loading ??
   const loadedReports = useRef<Set<string>>(new Set());

   useEffect(() => {
      loadedReports.current = new Set();
   }, [appliedRange.start, appliedRange.end]);

   useEffect(() => {
      if (!isHrReportsOnly) return;
      if (activeCategory !== 'HR') setActiveCategory('HR');
      if (!['HR Executive Summary', 'Payroll Summary', 'Payroll Ledger', 'Attendance & Delays', 'Attendance Exceptions', 'Overtime Report', 'Staff Cost %', 'Sales per Labor Hour', 'Employee Productivity'].includes(activeSubReport)) {
         setActiveSubReport('HR Executive Summary');
      }
   }, [isHrReportsOnly, activeCategory, activeSubReport]);

   useEffect(() => {
      const params: ReportParams = { branchId: activeBranchId, startDate: appliedRange.start, endDate: appliedRange.end };
      const key = `${activeSubReport}__${appliedRange.start}__${appliedRange.end}__${activeBranchId}`;
      if (loadedReports.current.has(key)) return;

      const load = async () => {
         setIsLoadingReport(true);
         setReportError(null);
         try {
            if (!isHrReportsOnly && !overview) {
               const [ov, ps] = await Promise.all([
                  reportsApi.getOverview(params).catch(() => null),
                  reportsApi.getProfitSummary(params).catch(() => null),
               ]);
               setOverview(ov); setProfitSummary(ps);
            }
            if (!isHrReportsOnly && !integrity) {
               const intData = await reportsApi.getIntegrity(params).catch(() => null);
               setIntegrity(intData);
            }

            switch (activeSubReport) {
               case 'Daily Sales': { const [d, pd, pm] = await Promise.all([reportsApi.getDailySales(params), reportsApi.getProfitDaily(params), reportsApi.getPayments(params)]); setDailySales(d || []); setProfitDaily(pd || []); setPaymentSummary(pm || []); break; }
               case 'Hourly Trends': { const r = await reportsApi.getHourlySales(params); setHourlySales(r || []); break; }
               case 'Payment Mix': { const r = await reportsApi.getPayments(params); setPaymentSummary(r || []); break; }
               case 'Cashier Summary': { const r = await reportsApi.getCashierSummary(params); setCashierSummary(r || []); break; }
               case 'Refunds': { const r = await reportsApi.getRefundsReport(params); setRefunds(r || []); break; }
               case 'Sales by Order Type': { const r = await reportsApi.getSalesByOrderType(params).catch(() => []); setSalesByOrderType(r as any || []); break; }
               case 'Sales by Item': { const r = await reportsApi.getSalesByItem(params).catch(() => []); setSalesByItem(r as any || []); break; }
               case 'Sales by Category': { const r = await reportsApi.getSalesByCategory(params).catch(() => []); setSalesByCategory(r as any || []); break; }
               case 'Discounts': { const r = await reportsApi.getDiscountAnalysis(params).catch(() => null); setDiscountAnalysis(r as any); break; }
               case 'Cancelled Orders': { const r = await reportsApi.getCancelledOrders(params).catch(() => null); setCancelledOrders(r as any); break; }
               case 'Sales by Source': { const r = await reportsApi.getSalesBySource(params).catch(() => []); setSalesBySource(r as any || []); break; }
               case 'Peak Hours Heatmap': { const r = await reportsApi.getPeakHoursHeatmap(params).catch(() => []); setPeakHoursData(r as any || []); break; }
               case 'Modifier Sales': { const r = await reportsApi.getModifierSales(params).catch(() => []); setModifierSalesData(r as any || []); break; }
               case 'Avg Ticket Trend': { const r = await reportsApi.getAvgTicketTrend(params).catch(() => []); setAvgTicketTrend(r as any || []); break; }
               case 'Sales Comparison': { const compareEnd = new Date(new Date(params.startDate).getTime() - 86400000).toISOString().split('T')[0]; const duration = new Date(params.endDate).getTime() - new Date(params.startDate).getTime(); const compareStart = new Date(new Date(params.startDate).getTime() - duration - 86400000).toISOString().split('T')[0]; const r = await reportsApi.getSalesComparison({ ...params, compareStartDate: compareStart, compareEndDate: compareEnd }).catch(() => null); setSalesComparisonData(r as any); break; }
               case 'Slow-Moving Items': { const r = await reportsApi.getSlowMovingItems(params).catch(() => []); setSlowMovingItems(r as any || []); break; }
               case 'Revenue by Weekday': { const r = await reportsApi.getRevenueByWeekday(params).catch(() => []); setRevenueByWeekday(r as any || []); break; }
               case 'Void Items Log': { const r = await reportsApi.getVoidItemsLog(params).catch(() => null); setVoidItemsData(r as any); break; }
               case 'Menu Engineering': { const r = await reportsApi.getMenuEngineering(params).catch(() => null); setMenuEngineeringData(r as any); break; }
               case 'Daypart Analysis': { const r = await reportsApi.getDaypartAnalysis(params).catch(() => []); setDaypartData(r as any || []); break; }
               case 'Basket Analysis': { const r = await reportsApi.getBasketAnalysis(params).catch(() => []); setBasketData(r as any || []); break; }
               case 'Seasonality': { const r = await reportsApi.getSeasonality({ branchId: params.branchId }).catch(() => []); setSeasonalityData(r as any || []); break; }
               case 'Online vs Offline': { const r = await reportsApi.getOnlineVsOffline(params).catch(() => []); setOnlineOfflineData(r as any || []); break; }
               case 'Menu Cannibalization': { const r = await reportsApi.getMenuCannibalization({ branchId: params.branchId }).catch(() => null); setCannibalizationData(r as any); break; }
               case 'Menu Item Lifecycle': { const r = await reportsApi.getMenuLifecycle({ branchId: params.branchId }).catch(() => []); setMenuLifecycleData(r as any || []); break; }
               case 'Category Contribution': { const r = await reportsApi.getCategoryContribution(params).catch(() => []); setCatContribData(r as any || []); break; }
               case 'Time-to-First-Order': { const r = await reportsApi.getTimeToFirstOrder().catch(() => []); setTimeToFirstData(r as any || []); break; }
               case 'Z-Report / Fiscal': { const r = await reportsApi.getVat(params); setVatReport(r || null); break; }
               case 'Profit & Loss (P&L)': { const [pd, pl] = await Promise.all([reportsApi.getProfitDaily(params), reportsApi.getProfitAndLoss(params).catch(() => null)]); setProfitDaily(pd || []); setProfitAndLoss(pl as any); break; }
               case 'Trial Balance': { const r = await reportsApi.getTrialBalance(params).catch(() => []); setTrialBalance(r as any || []); break; }
               case 'Top Expenses': { const r = await reportsApi.getTopExpenses(params).catch(() => []); setTopExpenses(r as any || []); break; }
                case 'Expense Report': { const r = await reportsApi.getExpenseReport({ ...params, status: 'ALL' }).catch(() => null); setExpenseReport(r as any); break; }
               case 'Tips Report': { const r = await reportsApi.getTipsReport(params).catch(() => null); setTipsData(r as any); break; }
               case 'Service Charge': { const r = await reportsApi.getServiceChargeReport(params).catch(() => null); setServiceChargeData(r as any); break; }
               case 'Shift Summary': { const r = await reportsApi.getShiftSummary(params).catch(() => []); setShiftSummaryData(r as any || []); break; }
               case 'Food Cost % Trend': { const r = await reportsApi.getFoodCostTrend(params).catch(() => []); setFoodCostTrendData(r as any || []); break; }
               case 'Cash Flow Forecast': { const r = await reportsApi.getCashFlowForecast({ branchId: params.branchId }).catch(() => null); setCashFlowData(r as any); break; }
               case 'Tax Compliance': { const r = await reportsApi.getTaxCompliance(params).catch(() => null); setTaxComplianceData(r as any); break; }
               case 'Audit Trail': { const r = await reportsApi.getAuditTrail(params).catch(() => null); setAuditTrailData(r as any); break; }
               case 'Break-Even Analysis': { const r = await reportsApi.getBreakEven({ branchId: params.branchId }).catch(() => null); setBreakEvenData(r as any); break; }
               case 'Payment Reconciliation': { const r = await reportsApi.getPaymentReconciliation(params).catch(() => null); setReconciliationData(r as any); break; }
               case 'Shift Profitability': { const r = await reportsApi.getShiftProfitability(params).catch(() => []); setShiftProfitData(r as any || []); break; }
               case 'COGS & Margin': { const r = await reportsApi.getFoodCost(params); setFoodCostData(r || []); break; }
               case 'Stock Movement': { const r = await reportsApi.getStockMovements(params).catch(() => []); setStockMovementLog(r as any || []); break; }
               case 'Waste/Loss Log': { const r = await reportsApi.getWasteLoss(params).catch(() => null); setWasteLoss(r as any); break; }
               case 'Reorder Alerts': { const r = await reportsApi.getReorderAlerts().catch(() => []); setReorderAlerts(r as any || []); break; }
               case 'Expiring Batches': { const r = await reportsApi.getExpiringBatches().catch(() => null); setExpiringBatches(r as any); break; }
               case 'Actual vs Theoretical': { const r = await reportsApi.getActualVsTheoretical(params).catch(() => []); setActualVsTheoreticalData(r as any || []); break; }
               case 'Purchase History': { const r = await reportsApi.getPurchaseHistory(params).catch(() => null); setPurchaseHistoryData(r as any); break; }
               case 'Inventory Valuation': { const r = await reportsApi.getInventoryValuation().catch(() => null); setInventoryValuationData(r as any); break; }
               case 'Supplier Price Tracking': { const r = await reportsApi.getSupplierPriceTracking(params).catch(() => []); setSupplierPriceData(r as any || []); break; }
               case 'Recipe Cost Alerts': { const r = await reportsApi.getRecipeCostAlerts().catch(() => null); setRecipeCostData(r as any); break; }
               case 'ABC Classification': { const r = await reportsApi.getABCClassification().catch(() => null); setAbcData(r as any); break; }
               case 'Optimal Pricing': { const r = await reportsApi.getOptimalPricing().catch(() => null); setOptimalPricingData(r as any); break; }
               case 'HR Executive Summary': {
                  const [payroll, attendanceRows, overtimeRows, staffCost, labor, productivity] = await Promise.all([
                     reportsApi.getPayrollSummary(params).catch(() => null),
                     reportsApi.getAttendanceReport(params).catch(() => []),
                     reportsApi.getOvertimeReport(params).catch(() => []),
                     reportsApi.getStaffCostVsRevenue(params).catch(() => null),
                     reportsApi.getSalesPerLaborHour(params).catch(() => null),
                     reportsApi.getEmployeeProductivity(params).catch(() => []),
                  ]);
                  setPayrollData(payroll as any);
                  setAttendanceData(attendanceRows as any || []);
                  setOvertimeData(overtimeRows as any || []);
                  setStaffCostData(staffCost as any);
                  setSalesPerLaborData(labor as any);
                  setEmpProductivityData(productivity as any || []);
                  break;
               }
               case 'Payroll Summary':
               case 'Payroll Ledger': { const r = await reportsApi.getPayrollSummary(params).catch(() => null); setPayrollData(r as any); break; }
               case 'Attendance & Delays':
               case 'Attendance Exceptions': { const r = await reportsApi.getAttendanceReport(params).catch(() => []); setAttendanceData(r as any || []); break; }
               case 'Overtime Report': { const r = await reportsApi.getOvertimeReport(params).catch(() => []); setOvertimeData(r as any || []); break; }
               case 'Staff Cost %': { const r = await reportsApi.getStaffCostVsRevenue(params).catch(() => null); setStaffCostData(r as any); break; }
               case 'Sales per Labor Hour': { const r = await reportsApi.getSalesPerLaborHour(params).catch(() => null); setSalesPerLaborData(r as any); break; }
               case 'Employee Productivity': { const r = await reportsApi.getEmployeeProductivity(params).catch(() => []); setEmpProductivityData(r as any || []); break; }
               case 'Customer LTV': { const r = await reportsApi.getCustomerLTV(params).catch(() => []); setCustomerLTV(r as any || []); break; }
               case 'Campaign ROI': { const r = await reportsApi.getCampaignROI().catch(() => []); setCampaignROI(r as any || []); break; }
               case 'Customer Retention': { const r = await reportsApi.getCustomerRetention(params).catch(() => null); setCustomerRetentionData(r as any); break; }
               case 'New vs Returning': { const r = await reportsApi.getNewVsReturning(params).catch(() => null); setNewVsReturningData(r as any); break; }
               case 'Customer Frequency': { const r = await reportsApi.getCustomerFrequency(params).catch(() => null); setCustomerFrequencyData(r as any); break; }
               case 'Customer Churn': { const r = await reportsApi.getCustomerChurn({ branchId: params.branchId }).catch(() => null); setChurnData(r as any); break; }
               case 'Loyalty Points': { const r = await reportsApi.getLoyaltyPoints().catch(() => null); setLoyaltyData(r as any); break; }
               case 'Promotion Impact': { const r = await reportsApi.getPromotionImpact().catch(() => []); setPromoImpactData(r as any || []); break; }
               case 'Customer Journey Funnel': { const r = await reportsApi.getCustomerJourney().catch(() => []); setJourneyFunnelData(r as any || []); break; }
               case 'Branch Performance': { const r = await reportsApi.getBranchPerformance(params).catch(() => []); setBranchPerformance(r as any || []); break; }
               case 'Order Preparation Time': { const r = await reportsApi.getOrderPrepTime(params).catch(() => []); setOrderPrepTime(r as any || []); break; }
               case 'Delivery Performance': { const r = await reportsApi.getDeliveryPerformance(params).catch(() => null); setDeliveryPerformance(r as any); break; }
               case 'Dine-in Tables': { const r = await reportsApi.getDineInTableAnalysis(params).catch(() => []); setDineInTables(r as any || []); break; }
               case 'Kitchen Performance': { const r = await reportsApi.getKitchenPerformance(params).catch(() => []); setKitchenPerformanceData(r as any || []); break; }
               case 'Table Turnover': { const r = await reportsApi.getTableTurnover(params).catch(() => []); setTableTurnoverData(r as any || []); break; }
               case 'Wait Time': { const r = await reportsApi.getWaitTime(params).catch(() => null); setWaitTimeData(r as any); break; }
               case 'Driver Utilization': { const r = await reportsApi.getDriverUtilization(params).catch(() => []); setDriverUtilData(r as any || []); break; }
               case 'Branch Comparison': { const r = await reportsApi.getBranchComparison(params).catch(() => null); setBranchCompData(r as any); break; }
               case 'Delivery Zone Analytics': { const r = await reportsApi.getDeliveryZone(params).catch(() => []); setDeliveryZoneData(r as any || []); break; }
               case 'Delivery Cost vs Revenue': { const r = await reportsApi.getDeliveryCostRevenue(params).catch(() => null); setDeliveryCostData(r as any); break; }
               case '3rd Party vs In-House': { const r = await reportsApi.getThirdPartyVsInHouse(params).catch(() => null); setThirdPartyData(r as any); break; }
               case 'Daily Flash Report': { const r = await reportsApi.getDailyFlash({ branchId: params.branchId }).catch(() => null); setDailyFlashData(r as any); break; }
               case 'Demand Forecasting': { const r = await reportsApi.getDemandForecast({ branchId: params.branchId }).catch(() => null); setDemandForecastData(r as any); break; }
               case 'Price Elasticity Simulator': { const r = await reportsApi.getPriceElasticity({ branchId: params.branchId }).catch(() => []); setPriceElasticityData(r as any || []); break; }
               case 'Anomaly Detection': { const r = await reportsApi.getAnomalyDetection(params).catch(() => null); setAnomalyData(r as any); break; }
               case 'Channel Mix Trend': { const r = await reportsApi.getChannelMix(params).catch(() => []); setChannelMixData(r as any || []); break; }
                default:
                   setReportError(`No loader defined for report: ${activeSubReport}`);
                   break;
            }
            loadedReports.current.add(key);
         } catch (error: any) {
            setReportError(error.message || 'Failed to load report');
         } finally {
            setIsLoadingReport(false);
         }
      };
      load();
   }, [activeSubReport, activeCategory, activeBranchId, appliedRange.start, appliedRange.end, isHrReportsOnly]);

   // ?? Computed Values ??
   const salesSeries = useMemo(() => (
      profitDaily.map((row: any) => ({
         name: row.day,
         revenue: Number(row.revenue || 0),
         orders: Number(row.orderCount || 0),
         cost: Number(row.cogs || 0),
         profit: Number(row.grossProfit || 0),
      }))
   ), [profitDaily]);

   const activeBranchName = useMemo(
      () => activeBranchId ? branches.find((branch: any) => branch.id === activeBranchId)?.name : 'Global Entity',
      [activeBranchId, branches]
   );

   const peakHoursLookup = useMemo(() => {
      const lookup = new Map<string, { orderCount: number; revenue: number }>();
      peakHoursData.forEach((cell: any) => {
         lookup.set(`${cell.dayOfWeek}-${cell.hour}`, { orderCount: cell.orderCount, revenue: cell.revenue });
      });
      return lookup;
   }, [peakHoursData]);

   const peakHoursMaxOrders = useMemo(
      () => peakHoursData.reduce((max: number, cell: any) => Math.max(max, cell.orderCount), 1),
      [peakHoursData]
   );

   const revenueByWeekdayMax = useMemo(
      () => revenueByWeekday.reduce((max: number, day: any) => Math.max(max, day.revenue), 1),
      [revenueByWeekday]
   );

   const daypartRevenueMax = useMemo(
      () => daypartData.reduce((max: number, part: any) => Math.max(max, part.revenue), 1),
      [daypartData]
   );

   return {
      // Navigation
      activeCategory, setActiveCategory,
      activeSubReport, setActiveSubReport,
      dateRange, setDateRange,
      appliedRange, setAppliedRange,
      isLoadingReport, reportError, setReportError,
      printableRootRef,
      settings, branches, activeBranchId, activeBranchName,
      isHrReportsOnly,

      // All data
      dailySales, profitDaily, overview, profitSummary, foodCostData,
      paymentSummary, vatReport, hourlySales, cashierSummary, refunds,
      integrity, trialBalance, profitAndLoss, topExpenses, expenseReport,
      stockMovementLog, wasteLoss, reorderAlerts, expiringBatches,
      payrollData, attendanceData, overtimeData,
      customerLTV, campaignROI,
      branchPerformance, orderPrepTime,
      salesByOrderType, salesByItem, salesByCategory,
      discountAnalysis, cancelledOrders, deliveryPerformance,
      salesBySource, dineInTables, peakHoursData,
      modifierSalesData, avgTicketTrend, salesComparisonData,
      slowMovingItems, revenueByWeekday, voidItemsData,
      tipsData, serviceChargeData, shiftSummaryData,
      actualVsTheoreticalData, purchaseHistoryData, inventoryValuationData,
      staffCostData, salesPerLaborData,
      customerRetentionData, newVsReturningData, customerFrequencyData,
      kitchenPerformanceData, menuEngineeringData, daypartData, basketData,
      seasonalityData, onlineOfflineData, foodCostTrendData,
      taxComplianceData, auditTrailData, cashFlowData,
      supplierPriceData, recipeCostData, abcData,
      empProductivityData, churnData, loyaltyData, promoImpactData,
      tableTurnoverData, waitTimeData, driverUtilData, branchCompData,
      demandForecastData, priceElasticityData, cannibalizationData,
      anomalyData, breakEvenData, reconciliationData,
      dailyFlashData, menuLifecycleData, catContribData,
      shiftProfitData, deliveryZoneData, deliveryCostData,
      journeyFunnelData, channelMixData, optimalPricingData,
      thirdPartyData, timeToFirstData,

      // Computed
      salesSeries, peakHoursLookup, peakHoursMaxOrders,
      revenueByWeekdayMax, daypartRevenueMax,
   };
}

export type ReportsState = ReturnType<typeof useReportsState>;
