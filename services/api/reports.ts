import { apiRequest, apiRequestBlob } from './core';

export const reportsApi = {
    getVat: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any>(`/reports/vat?${query}`);
    },
    getPayments: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any[]>(`/reports/payments?${query}`);
    },
    getFiscal: (params: { startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any>(`/reports/fiscal?${query}`);
    },
    getDailySales: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ day: string; revenue: number; net: number; tax: number; orderCount: number }>>(`/reports/daily-sales?${query}`);
    },
    getHourlySales: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ hour: string; revenue: number; orderCount: number }>>(`/reports/hourly-sales?${query}`);
    },
    getCashierSummary: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ cashier: string; method: string; totalCollected: number; transactionCount: number }>>(`/reports/cashier-summary?${query}`);
    },
    getRefundsReport: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ id: string; orderNumber: number; orderType: string; businessDate?: string; createdAt: string; customerName?: string; customerPhone?: string; total: number; cancelReason: string; cancelledAt: string; status: string }>>(`/reports/refunds?${query}`);
    },
    getOverview: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ orderCount: number; grossSales: number; netSales: number; taxTotal: number; discountTotal: number; serviceChargeTotal: number }>(`/reports/overview?${query}`);
    },
    getProfitSummary: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ grossSales: number; netSales: number; taxTotal: number; orderCount: number; cogs: number; grossProfit: number; foodCostPercent: number }>(`/reports/profit-summary?${query}`);
    },
    getProfitDaily: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ day: string; revenue: number; net: number; tax: number; orderCount: number; cogs: number; grossProfit: number }>>(`/reports/profit-daily?${query}`);
    },
    getFoodCost: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ id: string; name: string; price: number; cost: number; margin: number; marginPercent: number; soldQty: number; soldRevenue: number }>>(`/reports/food-cost?${query}`);
    },
    getDashboardKpis: (params: { branchId?: string; startDate: string; endDate: string; scope?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ALL' }) => {
        const query = new URLSearchParams({ ...(params as any), _ts: String(Date.now()) }).toString();
        return apiRequest<{
            branchId: string;
            scope: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ALL';
            period: { start: string; end: string };
            totals: {
                revenue: number;
                netRevenue: number;
                taxTotal: number;
                expenses: number;
                pendingExpenses: number;
                cogs: number;
                netProfit: number;
                paidRevenue: number;
                discounts: number;
                orderCount: number;
                avgTicket: number;
                uniqueCustomers: number;
                itemsSold: number;
                cancelled: number;
                cancelledValue: number;
                pending: number;
                delivered: number;
                cancelRate: number;
            };
            trendData: Array<{ name: string; revenue: number }>;
            paymentBreakdown: Array<{ name: string; value: number }>;
            orderTypeBreakdown: Array<{ name: string; value: number }>;
            categoryData: Array<{ name: string; value: number }>;
            topItems: Array<{ name: string; qty: number; revenue: number }>;
            branchPerformance: Array<{ branchId: string; branchName: string; orders: number; revenue: number; avgTicket: number }>;
            topCustomers: Array<{ id: string; name: string; visits: number; totalSpent: number }>;
            reportParity: {
                overview: {
                    orderCount: number;
                    grossSales: number;
                    netSales: number;
                    taxTotal: number;
                    discountTotal: number;
                    serviceChargeTotal: number;
                };
            };
        }>(`/reports/dashboard-kpis?${query}`);
    },
    getIntegrity: (params: { branchId?: string; startDate: string; endDate: string; reportType?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any>(`/reports/integrity?${query}`);
    },
    exportCsv: (params: { branchId?: string; startDate: string; endDate: string; reportType?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequestBlob(`/reports/export/csv?${query}`);
    },
    exportPdf: (params: { branchId?: string; startDate: string; endDate: string; reportType?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequestBlob(`/reports/export/pdf?${query}`);
    },
    exportXlsx: (params: { branchId?: string; startDate: string; endDate: string; reportType?: string; lang?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequestBlob(`/reports/export/xlsx?${query}`);
    },
    getTrialBalance: (params: { startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ accountId: string; accountCode: string; accountName: string; accountType: string; totalDebit: number; totalCredit: number; balance: number }>>(`/reports/trial-balance?${query}`);
    },
    getProfitAndLoss: (params: { startDate: string; endDate: string; branchId?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ revenue: number; expenses: number; netProfit: number; details: Array<{ type: string; name: string; debit: number; credit: number; net: number }> }>(`/reports/profit-loss?${query}`);
    },
    getTopExpenses: (params: { startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ name: string; total: number }>>(`/reports/top-expenses?${query}`);
    },
    getExpenseReport: (params: { branchId?: string; startDate: string; endDate: string; status?: 'ALL' | 'POSTED' | 'PENDING_APPROVAL'; limit?: number; offset?: number }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{
            summary: { total: number; count: number; totalCount: number; postedCount: number; postedTotal: number; pendingCount: number; pendingTotal: number; status: string; branchId: string; hasMore: boolean };
            byCategory: Array<{ code: string; name: string; nameAr?: string | null; total: number; count: number }>;
            byDay: Array<{ day: string; total: number; count: number }>;
            rows: Array<{
                entryId: string;
                entryNumber: number;
                date: string;
                reference: string;
                referenceType: string;
                description: string;
                status: string;
                createdBy?: string | null;
                createdByName?: string | null;
                accountCode: string;
                accountName: string;
                accountNameAr?: string | null;
                costCenterName?: string | null;
                branchName?: string | null;
                branchId?: string | null;
                amount: number;
            }>;
        }>(`/reports/expenses?${query}`);
    },
    getStockMovements: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ id: number; itemName: string; quantity: number; unitCost: number; totalCost: number; type: string; reason: string; performedBy: string; createdAt: string }>>(`/reports/stock-movements?${query}`);
    },
    getWasteLoss: (params: { startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ items: Array<{ id: number; itemName: string; unit: string; quantity: number; unitCost: number; totalCost: number; reason: string; performedBy: string; createdAt: string }>; totalWasteCost: number; count: number }>(`/reports/waste-loss?${query}`);
    },
    getReorderAlerts: () => apiRequest<Array<{ itemId: string; itemName: string; unit: string; threshold: number; costPrice: number; currentStock: number; deficit: number }>>('/reports/reorder-alerts'),
    getExpiringBatches: () => apiRequest<{ items: Array<{ batchId: string; batchNumber: string; itemName: string; unit: string; currentQty: number; unitCost: number; expiryDate: string; receivedDate: string; status: string }>; totalAtRiskValue: number; alreadyExpired: number; totalBatches: number }>('/reports/expiring-batches'),
    getPayrollSummary: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ cycles: any[]; payouts: Array<{ cycleId: string; employeeName: string; role: string; basicSalary: number; deductions: number; overtime: number; netPay: number; status: string }>; totalPayroll: number }>(`/reports/payroll-summary?${query}`);
    },
    getAttendanceReport: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ employeeName: string; role: string; totalDays: number; presentDays: number; lateDays: number; absentDays: number; sickDays: number; totalHours: number; avgHoursPerDay: number }>>(`/reports/attendance-report?${query}`);
    },
    getOvertimeReport: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ employeeName: string; role: string; hourlyRate: number; totalHours: number; workDays: number; overtimeHours: number; overtimeCost: number }>>(`/reports/overtime-report?${query}`);
    },
    getCustomerLTV: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ customerId: string; customerName: string; phone: string; totalSpent: number; orderCount: number; avgTicket: number; firstOrder: string; lastOrder: string }>>(`/reports/customer-ltv?${query}`);
    },
    getCampaignROI: () => apiRequest<Array<{ id: string; name: string; type: string; status: string; reach: number; conversions: number; revenue: number; budget: number; roi: number; conversionRate: number; createdAt: string }>>('/reports/campaign-roi'),
    getBranchPerformance: (params: { startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ branchId: string; branchName: string; orderCount: number; revenue: number; avgTicket: number; cancelledCount: number }>>(`/reports/branch-performance?${query}`);
    },
    getOrderPrepTime: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ branchName: string; orderType: string; avgPrepMinutes: number; minPrepMinutes: number; maxPrepMinutes: number; orderCount: number }>>(`/reports/order-prep-time?${query}`);
    },
    getSalesByOrderType: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ orderType: string; orderCount: number; revenue: number; netRevenue: number; avgTicket: number; totalDiscount: number; totalDeliveryFee: number; totalTax: number; percentage: number }>>(`/reports/sales-by-order-type?${query}`);
    },
    getSalesByItem: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ menuItemId: string; itemName: string; qtySold: number; revenue: number; cost: number; profit: number; marginPercent: number }>>(`/reports/sales-by-item?${query}`);
    },
    getSalesByCategory: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ categoryId: string; categoryName: string; qtySold: number; revenue: number; cost: number; profit: number; itemCount: number; percentage: number }>>(`/reports/sales-by-category?${query}`);
    },
    getDiscountAnalysis: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ summary: { totalDiscountedOrders: number; totalOrders: number; discountRate: number; totalDiscount: number; avgDiscount: number; maxDiscount: number }; byReason: Array<{ reason: string; orderCount: number; totalDiscount: number; avgDiscount: number }>; byType: Array<{ discountType: string; orderCount: number; totalDiscount: number }> }>(`/reports/discount-analysis?${query}`);
    },
    getCancelledOrders: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ summary: { cancelledCount: number; cancelledTotal: number; totalOrders: number; cancelRate: number }; byReason: Array<{ reason: string; count: number; total: number }>; orders: Array<{ id: string; orderNumber: number; type: string; total: number; cancelReason: string; cancelledAt: string; createdAt: string; customerName: string }> }>(`/reports/cancelled-orders?${query}`);
    },
    getDeliveryPerformance: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ summary: { orderCount: number; revenue: number; avgTicket: number; totalDeliveryFees: number; freeDeliveryCount: number; avgDeliveryMinutes: number }; byDriver: Array<{ driverId: string; orderCount: number; revenue: number; avgDeliveryMinutes: number }> }>(`/reports/delivery-performance?${query}`);
    },
    getSalesBySource: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ source: string; orderCount: number; revenue: number; avgTicket: number; percentage: number }>>(`/reports/sales-by-source?${query}`);
    },
    getDineInTableAnalysis: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ tableId: string; tableName: string; zoneName: string; seats: number; status: string; configuredDiscountPercent: number; defaultCouponCode: string; minSpend: number; isVIP: boolean; notes: string; orderCount: number; revenue: number; avgTicket: number; avgDurationMinutes: number; totalDiscount: number; discountedOrderCount: number; discountRate: number }>>(`/reports/dine-in-tables?${query}`);
    },
    getPeakHoursHeatmap: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ dayOfWeek: number; hour: number; orderCount: number; revenue: number }>>(`/reports/peak-hours-heatmap?${query}`);
    },
    getModifierSales: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ name: string; count: number; revenue: number }>>(`/reports/modifier-sales?${query}`);
    },
    getAvgTicketTrend: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ day: string; avgTicket: number; orderCount: number; revenue: number }>>(`/reports/avg-ticket-trend?${query}`);
    },
    getSalesComparison: (params: { branchId?: string; startDate: string; endDate: string; compareStartDate: string; compareEndDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ current: any; compare: any; change: any }>(`/reports/sales-comparison?${query}`);
    },
    getSlowMovingItems: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ menuItemId: string; itemName: string; qtySold: number; revenue: number }>>(`/reports/slow-moving-items?${query}`);
    },
    getRevenueByWeekday: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ dayOfWeek: number; dayName: string; orderCount: number; revenue: number; avgTicket: number }>>(`/reports/revenue-by-weekday?${query}`);
    },
    getVoidItemsLog: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ summary: { voidCount: number; voidTotal: number }; items: any[] }>(`/reports/void-items?${query}`);
    },
    getTipsReport: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ summary: { totalTips: number; orderCount: number; avgTip: number; maxTip: number }; byType: any[]; daily: any[] }>(`/reports/tips-report?${query}`);
    },
    getServiceChargeReport: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ summary: { totalServiceCharge: number; orderCount: number; avgServiceCharge: number }; daily: any[] }>(`/reports/service-charge-report?${query}`);
    },
    getShiftSummary: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ shiftId: string; branchId: string; userId: string; openingTime: string; closingTime: string; openingBalance: number; expectedBalance: number; actualBalance: number; status: string; orderCount: number; revenue: number; cancelledCount: number; variance: number }>>(`/reports/shift-summary?${query}`);
    },
    getActualVsTheoretical: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ inventoryItemId: string; itemName: string; unit: string; theoreticalQty: number; actualQty: number; variance: number; variancePercent: number }>>(`/reports/actual-vs-theoretical?${query}`);
    },
    getPurchaseHistory: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ summary: any; bySupplier: any[]; byStatus: any[] }>(`/reports/purchase-history?${query}`);
    },
    getInventoryValuation: () => apiRequest<{ totalValue: number; items: Array<{ itemId: string; itemName: string; unit: string; totalQty: number; totalValue: number; avgUnitCost: number; batchCount: number }> }>('/reports/inventory-valuation'),
    getStaffCostVsRevenue: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ revenue: number; staffCost: number; staffCostPercent: number; employeeCount: number; costPerEmployee: number }>(`/reports/staff-cost-vs-revenue?${query}`);
    },
    getSalesPerLaborHour: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ revenue: number; totalLaborHours: number; totalLaborDays: number; salesPerLaborHour: number }>(`/reports/sales-per-labor-hour?${query}`);
    },
    getCustomerRetention: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ totalCustomers: number; returningCustomers: number; newCustomers: number; retentionRate: number }>(`/reports/customer-retention?${query}`);
    },
    getNewVsReturning: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ new: { orders: number; revenue: number }; returning: { orders: number; revenue: number }; totalOrders: number; totalRevenue: number }>(`/reports/new-vs-returning?${query}`);
    },
    getCustomerFrequency: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ distribution: { once: number; twice: number; thrice: number; frequent: number; veryFrequent: number }; topCustomers: any[] }>(`/reports/customer-frequency?${query}`);
    },
    getKitchenPerformance: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ itemName: string; totalPrepared: number; avgPrepMinutes: number; minPrepMinutes: number; maxPrepMinutes: number }>>(`/reports/kitchen-performance?${query}`);
    },
    getMenuEngineering: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ summary: any; items: any[] }>(`/reports/menu-engineering?${query}`);
    },
    getDaypartAnalysis: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ name: string; orderCount: number; revenue: number; avgTicket: number; percentage: number }>>(`/reports/daypart-analysis?${query}`);
    },
    getBasketAnalysis: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ pair: string; count: number; percentage: number }>>(`/reports/basket-analysis?${query}`);
    },
    getSeasonality: (params: { branchId?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ month: string; orderCount: number; revenue: number; avgTicket: number }>>(`/reports/seasonality?${query}`);
    },
    getOnlineVsOffline: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ day: string; onlineRevenue: number; offlineRevenue: number; onlineOrders: number; offlineOrders: number; onlinePercent: number }>>(`/reports/online-vs-offline?${query}`);
    },
    getFoodCostTrend: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ day: string; revenue: number; cost: number; foodCostPercent: number }>>(`/reports/food-cost-trend?${query}`);
    },
    getTaxCompliance: (params: { startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ fiscal: any; deadLetters: any[] }>(`/reports/tax-compliance?${query}`);
    },
    getAuditTrail: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ byType: any[]; byUser: any[]; recent: any[] }>(`/reports/audit-trail?${query}`);
    },
    getCashFlowForecast: (params: { branchId?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ history: any[]; forecast: any[]; avgWeeklyRevenue: number; weeklyTrend: number }>(`/reports/cash-flow-forecast?${query}`);
    },
    getSupplierPriceTracking: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ itemId: string; itemName: string; supplierId: string; supplierName: string; avgPrice: number; minPrice: number; maxPrice: number; totalQty: number; priceVariance: number }>>(`/reports/supplier-price-tracking?${query}`);
    },
    getRecipeCostAlerts: () => apiRequest<{ critical: number; warning: number; ok: number; items: any[] }>('/reports/recipe-cost-alerts'),
    getABCClassification: () => apiRequest<{ totalValue: number; a: number; b: number; c: number; items: any[] }>('/reports/abc-classification'),
    getEmployeeProductivity: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ userId: string; orderCount: number; revenue: number; avgTicket: number }>>(`/reports/employee-productivity?${query}`);
    },
    getCustomerChurn: (params: { branchId?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ summary: any; atRisk: any[] }>(`/reports/customer-churn?${query}`);
    },
    getLoyaltyPoints: () => apiRequest<{ summary: any; tiers: any[]; topPointHolders: any[] }>('/reports/loyalty-points'),
    getPromotionImpact: (params?: { campaignId?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any>(`/reports/promotion-impact?${query}`);
    },
    getTableTurnover: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ tableId: string; tableName: string; zoneName: string; totalOrders: number; turnsPerDay: number; revenue: number; revenuePerDay: number }>>(`/reports/table-turnover?${query}`);
    },
    getWaitTime: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ byType: any[]; daily: any[] }>(`/reports/wait-time?${query}`);
    },
    getDriverUtilization: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<Array<{ driverId: string; driverName: string; orderCount: number; ordersPerDay: number; revenue: number; totalDeliveryFees: number; avgDeliveryMinutes: number }>>(`/reports/driver-utilization?${query}`);
    },
    getBranchComparison: (params: { startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ branches: any[]; topBranch: string }>(`/reports/branch-comparison?${query}`);
    },
    getDemandForecast: (params: { branchId?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ weeklyForecast: any[]; topItemsDemand: any[] }>(`/reports/demand-forecast?${query}`);
    },
    getPriceElasticity: (params: { branchId?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any[]>(`/reports/price-elasticity?${query}`);
    },
    getMenuCannibalization: (params: { branchId?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ declining: any[]; growing: any[]; all: any[] }>(`/reports/menu-cannibalization?${query}`);
    },
    getAnomalyDetection: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ highDiscounts: any[]; offHoursOrders: any[]; highCancelDays: any[] }>(`/reports/anomaly-detection?${query}`);
    },
    getBreakEven: (params: { branchId?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any>(`/reports/break-even?${query}`);
    },
    getPaymentReconciliation: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any>(`/reports/payment-reconciliation?${query}`);
    },
    getDailyFlash: (params: { branchId?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any>(`/reports/daily-flash?${query}`);
    },
    getMenuLifecycle: (params: { branchId?: string; menuItemId?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any[]>(`/reports/menu-lifecycle?${query}`);
    },
    getCategoryContribution: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any[]>(`/reports/category-contribution?${query}`);
    },
    getShiftProfitability: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any[]>(`/reports/shift-profitability?${query}`);
    },
    getDeliveryZone: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any[]>(`/reports/delivery-zone?${query}`);
    },
    getDeliveryCostRevenue: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ summary: any; daily: any[] }>(`/reports/delivery-cost-revenue?${query}`);
    },
    getCustomerJourney: () => apiRequest<any[]>('/reports/customer-journey'),
    getChannelMix: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any[]>(`/reports/channel-mix?${query}`);
    },
    getOptimalPricing: () => apiRequest<{ targetMargin: number; items: any[]; needsIncrease: number; ok: number; canDecrease: number }>('/reports/optimal-pricing'),
    getThirdPartyVsInHouse: (params: { branchId?: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<{ inHouse: any; thirdParty: any }>(`/reports/third-party-vs-inhouse?${query}`);
    },
    getTimeToFirstOrder: () => apiRequest<any[]>('/reports/time-to-first-order'),
};
