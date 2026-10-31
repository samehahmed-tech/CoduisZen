import { beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '../server/db';
import { branches, orders, payments, paymentSessions } from '../src/db/schema';

const callbackResult = vi.hoisted(() => ({
    verified: true,
    success: true,
    transactionId: 8001,
    amountCents: 10000,
    paymobOrderId: 7001,
    merchantOrderId: 'test-paymob-replay-order',
}));

vi.mock('../server/modules/payments/paymobService', () => ({
    handleCallback: vi.fn(async () => callbackResult),
}));

import { settlePaymobCallback } from '../server/services/paymobSettlementService';

describe('Paymob settlement replay integration', () => {
    const branchId = 'test-paymob-replay-branch';
    const orderId = 'test-paymob-replay-order';
    const paymentSessionId = 'test-paymob-replay-session';

    beforeEach(async () => {
        callbackResult.success = true;
        callbackResult.amountCents = 10000;
        await db.delete(payments).where(eq(payments.orderId, orderId));
        await db.delete(paymentSessions).where(eq(paymentSessions.id, paymentSessionId));
        await db.delete(orders).where(eq(orders.id, orderId));
        await db.insert(branches).values({ id: branchId, name: 'Paymob Replay Branch' }).onConflictDoNothing();
        await db.insert(orders).values({
            id: orderId,
            type: 'TAKEAWAY',
            branchId,
            status: 'PENDING',
            subtotal: 100,
            tax: 0,
            total: 100,
            isPaid: false,
        });
        await db.insert(paymentSessions).values({
            id: paymentSessionId,
            orderId,
            branchId,
            providerType: 'paymob_card',
            externalReference: '7001',
            status: 'pending',
            amount: 100,
            verified: false,
        });
    });

    it('applies the same callback twice without duplicating payment or paid projection', async () => {
        await settlePaymobCallback({});
        await settlePaymobCallback({});

        const rows = await db.select().from(payments).where(and(
            eq(payments.orderId, orderId),
            eq(payments.referenceNumber, '8001'),
        ));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ amount: 100, status: 'COMPLETED' });

        const session = await db.query.paymentSessions.findFirst({ where: eq(paymentSessions.id, paymentSessionId) });
        const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
        expect(session).toMatchObject({ status: 'confirmed', verified: true });
        expect(order).toMatchObject({ isPaid: true, paidAmount: 100, status: 'PREPARING' });
    });

    it('quarantines a callback whose amount differs from the payment session', async () => {
        callbackResult.amountCents = 9900;

        const result = await settlePaymobCallback({});

        const rows = await db.select().from(payments).where(eq(payments.orderId, orderId));
        const session = await db.query.paymentSessions.findFirst({ where: eq(paymentSessions.id, paymentSessionId) });
        const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
        expect(result).toMatchObject({ success: false, amountMismatch: true });
        expect(rows).toHaveLength(0);
        expect(session).toMatchObject({ status: 'requires_reconciliation', verified: false });
        expect(order).toMatchObject({ isPaid: false, paidAmount: null, status: 'PENDING' });
    });
});
