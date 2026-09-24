import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import { getDashboardKpis } from '../server/controllers/reportController';
import { getBranchPerformance } from '../server/controllers/report/operationsReports';
import { getShiftSummary } from '../server/controllers/report/advancedFinanceReports';
import { getXReport } from '../server/controllers/shiftController';
import { db } from '../server/db';
import { dayCloseService } from '../server/services/dayCloseService';
import { branches, orders, payments, shifts, users } from '../src/db/schema';

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const fixtures = {
    branchId: `test-cancelled-revenue-branch-${suffix}`,
    userId: `test-cancelled-revenue-user-${suffix}`,
    shiftId: `test-cancelled-revenue-shift-${suffix}`,
    completedOrderId: `test-revenue-completed-${suffix}`,
    cancelledOrderId: `test-revenue-cancelled-${suffix}`,
};

// Local calendar day (NOT UTC): the reports scope by the branch's local day,
// so a UTC date breaks this test daily between 00:00–03:00 Cairo time.
const nowLocal = new Date();
const today = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;

const createResponse = () => {
    const response: any = {
        statusCode: 200,
        body: null,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(body: unknown) {
            this.body = body;
            return this;
        },
    };
    return response;
};

const cleanup = async () => {
    await db.delete(payments).where(inArray(payments.orderId, [fixtures.completedOrderId, fixtures.cancelledOrderId]));
    await db.delete(orders).where(inArray(orders.id, [fixtures.completedOrderId, fixtures.cancelledOrderId]));
    await db.delete(shifts).where(eq(shifts.id, fixtures.shiftId));
    await db.delete(users).where(eq(users.id, fixtures.userId));
    await db.delete(branches).where(eq(branches.id, fixtures.branchId));
};

describe('cancelled order revenue regression', () => {
    beforeEach(async () => {
        await cleanup();
        await db.insert(branches).values({
            id: fixtures.branchId,
            name: 'Cancelled Revenue Branch',
            timezone: 'Africa/Cairo',
            businessDate: today,
            isActive: true,
        });
        await db.insert(users).values({
            id: fixtures.userId,
            name: 'Revenue Test User',
            email: `${fixtures.userId}@restoflow.local`,
            role: 'SUPER_ADMIN',
            permissions: ['*'],
            assignedBranchId: fixtures.branchId,
            isActive: true,
        });
        await db.insert(shifts).values({
            id: fixtures.shiftId,
            branchId: fixtures.branchId,
            userId: fixtures.userId,
            openingTime: new Date(Date.now() - 60 * 60 * 1000),
            openingBalance: 0,
            status: 'OPEN',
        });
        await db.insert(orders).values([
            {
                id: fixtures.completedOrderId,
                branchId: fixtures.branchId,
                shiftId: fixtures.shiftId,
                businessDate: today,
                type: 'DINE_IN',
                status: 'COMPLETED',
                subtotal: 100,
                discount: 0,
                tax: 20,
                total: 120,
                isPaid: true,
            },
            {
                id: fixtures.cancelledOrderId,
                branchId: fixtures.branchId,
                shiftId: fixtures.shiftId,
                businessDate: today,
                type: 'DINE_IN',
                status: 'CANCELLED',
                subtotal: 70,
                discount: 0,
                tax: 10,
                total: 80,
                isPaid: true,
                cancelReason: 'Customer cancelled after payment',
                cancelledAt: new Date(),
            },
        ]);
        await db.insert(payments).values([
            { id: `test-payment-completed-${suffix}`, orderId: fixtures.completedOrderId, method: 'CASH', amount: 120, status: 'COMPLETED' },
            { id: `test-payment-cancelled-${suffix}`, orderId: fixtures.cancelledOrderId, method: 'CASH', amount: 80, status: 'COMPLETED' },
        ]);
    });

    afterEach(cleanup);

    it('removes cancelled paid orders from revenue while retaining tender reconciliation', async () => {
        const user = { role: 'SUPER_ADMIN', branchId: fixtures.branchId, permissions: ['*'] };
        const dashboard = createResponse();
        await getDashboardKpis({
            query: { branchId: fixtures.branchId, startDate: today, endDate: today, scope: 'DAILY' },
            user,
        } as any, dashboard);

        const xReport = createResponse();
        await getXReport({ params: { id: fixtures.shiftId }, user } as any, xReport);

        const branchPerformance = createResponse();
        await getBranchPerformance({ query: { startDate: today, endDate: today } } as any, branchPerformance);

        const shiftSummary = createResponse();
        await getShiftSummary({ query: { startDate: today, endDate: today, branchId: fixtures.branchId } } as any, shiftSummary);

        const dayClose = await dayCloseService.generateReport(fixtures.branchId, today);
        const branchRow = branchPerformance.body.find((row: any) => row.branchId === fixtures.branchId);
        const shiftRow = shiftSummary.body.find((row: any) => row.shiftId === fixtures.shiftId);

        expect(dashboard.statusCode).toBe(200);
        expect(dashboard.body.totals).toMatchObject({
            revenue: 120,
            netRevenue: 100,
            paidRevenue: 120,
            cancelled: 1,
            cancelledValue: 80,
            cancelRate: 50,
        });
        expect(dashboard.body.paymentBreakdown).toEqual([{ name: 'CASH', value: 120 }]);
        expect(dayClose.salesSummary).toMatchObject({ totalOrders: 1, totalRevenue: 120 });
        expect(dayClose.paymentBreakdown).toEqual([{ method: 'CASH', count: 2, total: 200 }]);
        expect(xReport.body).toMatchObject({ grossSales: 120, netSales: 100, cashCollected: 200 });
        expect(branchRow).toMatchObject({ orderCount: 2, revenue: 120, avgTicket: 120, cancelledCount: 1 });
        expect(shiftRow).toMatchObject({ orderCount: 2, revenue: 120, cancelledCount: 1 });
    });
});
