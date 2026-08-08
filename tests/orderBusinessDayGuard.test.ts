import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../server/db';
import { branches, dayCloseReports, orders, orderStatusHistory, users } from '../src/db/schema';
import { transitionOrderStatus } from '../server/services/orderLifecycleService';

const suffix = Date.now();
const branchId = `TST-DAY-GUARD-${suffix}`;
const closedOrderId = `TST-CLOSED-ORDER-${suffix}`;
const historicalOrderId = `TST-HISTORY-ORDER-${suffix}`;
const closeReportId = `TST-CLOSE-REPORT-${suffix}`;
let userId = '';

beforeAll(async () => {
    const [user] = await db.select({ id: users.id }).top(1).from(users);
    if (!user) throw new Error('ORDER_DAY_GUARD_USER_MISSING');
    userId = user.id;

    await db.insert(branches).values({
        id: branchId,
        name: 'Order Day Guard Test',
        businessDate: '2025-01-02',
        timezone: 'Africa/Cairo',
    });
    await db.insert(orders).values([
        {
            id: closedOrderId,
            type: 'TAKEAWAY',
            branchId,
            businessDate: '2025-01-01',
            status: 'PENDING',
            subtotal: 10,
            tax: 0,
            total: 10,
        },
        {
            id: historicalOrderId,
            type: 'DINE_IN',
            branchId,
            businessDate: '2024-12-31',
            status: 'PENDING',
            subtotal: 10,
            tax: 0,
            total: 10,
        },
    ]);
    const closedDate = new Date('2025-01-01T00:00:00.000Z');
    await db.insert(dayCloseReports).values({
        id: closeReportId,
        branchId,
        closedBy: userId,
        businessDate: closedDate,
        date: closedDate,
    });
});

afterAll(async () => {
    await db.delete(orderStatusHistory).where(eq(orderStatusHistory.orderId, closedOrderId));
    await db.delete(orderStatusHistory).where(eq(orderStatusHistory.orderId, historicalOrderId));
    await db.delete(dayCloseReports).where(eq(dayCloseReports.id, closeReportId));
    await db.delete(orders).where(eq(orders.id, closedOrderId));
    await db.delete(orders).where(eq(orders.id, historicalOrderId));
    await db.delete(branches).where(eq(branches.id, branchId));
});

describe('order business-day mutation guard', () => {
    it('blocks cancellation when the order business day is closed', async () => {
        await expect(transitionOrderStatus({
            orderId: closedOrderId,
            nextStatus: 'CANCELLED',
            notes: 'must stay immutable',
            user: { role: 'ADMIN', branchId },
        })).rejects.toThrow('ORDER_BUSINESS_DAY_CLOSED');
    });

    it('keeps orders from prior business days review-only', async () => {
        await expect(transitionOrderStatus({
            orderId: historicalOrderId,
            nextStatus: 'PREPARING',
            user: { role: 'ADMIN', branchId },
        })).rejects.toThrow('ORDER_HISTORY_READ_ONLY');
    });
});
