import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { generateDayClosePDF, generateDayCloseXlsx } from '../server/services/pdfService';

const report = {
    branchId: 'branch-test',
    branchName: 'RestoFlow Test Branch',
    date: '2026-07-18',
    currency: 'EGP',
    closedBy: 'manager-test',
    salesSummary: {
        totalOrders: 12,
        totalRevenue: 1500,
        totalDiscount: 100,
        totalTax: 180,
        netSales: 1400,
        averageOrderValue: 125,
    },
    orderTypeBreakdown: [{ type: 'DINE_IN', count: 12, total: 1500 }],
    paymentBreakdown: [{ method: 'CASH', count: 12, total: 1500 }],
    financeSummary: {
        expenses: 200,
        pendingExpenses: 50,
        netProfit: 1200,
        topExpenses: [{ name: 'Supplies', total: 200 }],
        expenseRows: [{
            date: '2026-07-18T12:30:00.000Z',
            name: 'Supplies and maintenance',
            description: 'A deliberately long expense description that must wrap on thermal paper',
            reference: 'EXP-THERMAL-80MM',
            total: 200,
        }],
    },
    auditSummary: { totalEvents: 3, voidCount: 1, refundCount: 0, discountCount: 1 },
    fiscalHealth: { pending: 0, failed: 0 },
    financeHealth: { pendingExceptions: 0 },
    sideEffectHealth: { failedTotal: 0 },
};

const legacyObjectReport = {
    ...report,
    orderTypeBreakdown: { DINE_IN: { count: 12, total: 1500 } },
    paymentBreakdown: { CASH: { count: 12, total: 1500 } },
    financeSummary: {
        ...report.financeSummary,
        topExpenses: { Supplies: { total: 200 } },
        expenseRows: {},
    },
};

describe('day close exports', () => {
    it('creates a readable Excel workbook with payment totals', async () => {
        const output = await generateDayCloseXlsx(legacyObjectReport, 'en');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(output);

        expect(workbook.getWorksheet('Summary')?.getCell('B4').value).toBe(12);
        expect(workbook.getWorksheet('Payments')?.getCell('C2').value).toBe(1500);
    });

    it('creates valid A4 and 80mm PDF files', async () => {
        const [a4, thermal] = await Promise.all([
            generateDayClosePDF(legacyObjectReport, 'ar', 'a4'),
            generateDayClosePDF(report, 'ar', '80mm'),
        ]);

        expect(a4.subarray(0, 4).toString()).toBe('%PDF');
        expect(thermal.subarray(0, 4).toString()).toBe('%PDF');
        expect(a4.length).toBeGreaterThan(10_000);
        expect(thermal.length).toBeGreaterThan(10_000);
        expect(thermal.equals(a4)).toBe(false);
    }, 120_000);
});
