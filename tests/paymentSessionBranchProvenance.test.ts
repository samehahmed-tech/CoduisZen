import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../server/db';
import { PaymentSessionService } from '../server/services/paymentSessionService';
import { branches, orders, paymentSessions } from '../src/db/schema';

describe('payment session branch provenance', () => {
    const branchA = 'test-payment-provenance-a';
    const branchB = 'test-payment-provenance-b';
    const orderId = 'test-payment-provenance-order';

    beforeEach(async () => {
        await db.insert(branches).values([
            { id: branchA, name: 'Payment Provenance A' },
            { id: branchB, name: 'Payment Provenance B' },
        ]).onConflictDoNothing();
        await db.delete(paymentSessions).where(eq(paymentSessions.orderId, orderId));
        await db.delete(orders).where(eq(orders.id, orderId));
        await db.insert(orders).values({
            id: orderId,
            type: 'TAKEAWAY',
            branchId: branchA,
            status: 'PENDING',
            subtotal: 100,
            tax: 0,
            total: 100,
            isPaid: false,
        });
    });

    it('stores the originating branch and rejects confirmation after branch drift', async () => {
        const session = await PaymentSessionService.initiatePayment(
            orderId, 100, 'manual_cash', 'test-device', 'test-user', 'test-payment-provenance-key', branchA,
        );

        const stored = await db.query.paymentSessions.findFirst({ where: eq(paymentSessions.id, session.sessionId) });
        expect(stored).toMatchObject({ branchId: branchA, orderId });

        await db.update(orders).set({ branchId: branchB }).where(eq(orders.id, orderId));

        await expect(PaymentSessionService.confirmPayment(session.sessionId, undefined, 'test-user', branchB))
            .rejects.toMatchObject({ code: 'PAYMENT_BRANCH_MISMATCH', status: 409 });
    });
});
