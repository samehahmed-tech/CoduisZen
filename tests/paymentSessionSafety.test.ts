import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../server/db';
import { PaymentSessionService } from '../server/services/paymentSessionService';
import { branches, orders, paymentSessions } from '../src/db/schema';

const branchId = 'test-payment-session-branch';
const orderId = 'test-payment-session-order';

describe('payment session safety', () => {
    beforeEach(async () => {
        await db.insert(branches).values({ id: branchId, name: 'Payment Safety Branch' }).onConflictDoNothing();
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
    });

    it('fails closed for external providers without a verified adapter', async () => {
        await expect(PaymentSessionService.initiatePayment(
            orderId,
            100,
            'fawry',
            'test-device',
            'test-user',
            'test-payment-provider-key',
        )).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_NOT_CONFIGURED', status: 503 });

        const sessions = await db.select().from(paymentSessions).where(eq(paymentSessions.orderId, orderId));
        expect(sessions).toHaveLength(0);
    });

    it('keeps a partially paid order unpaid, then settles it atomically', async () => {
        const first = await PaymentSessionService.initiatePayment(
            orderId, 40, 'manual_cash', 'test-device', 'test-user', 'test-payment-partial-1',
        );
        await PaymentSessionService.confirmPayment(first.sessionId);

        let order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
        expect(order).toMatchObject({ isPaid: false, paidAmount: 40, status: 'PENDING' });

        const second = await PaymentSessionService.initiatePayment(
            orderId, 60, 'manual_cash', 'test-device', 'test-user', 'test-payment-partial-2',
        );
        const result = await PaymentSessionService.confirmPayment(second.sessionId);

        order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
        expect(result).toMatchObject({ isPaid: true, paidAmount: 100, orderStatus: 'PREPARING' });
        expect(order).toMatchObject({ isPaid: true, paidAmount: 100, status: 'PREPARING' });
    });

    it('requires a terminal reference before confirming EFT/POS', async () => {
        const session = await PaymentSessionService.initiatePayment(
            orderId, 100, 'eft_pos', 'test-device', 'test-user', 'test-payment-eft-key',
        );

        await expect(PaymentSessionService.confirmPayment(session.sessionId))
            .rejects.toMatchObject({ code: 'PAYMENT_REFERENCE_REQUIRED', status: 400 });

        const stored = await db.query.paymentSessions.findFirst({
            where: eq(paymentSessions.id, session.sessionId),
        });
        expect(stored).toMatchObject({ status: 'initiated', verified: false });
    });
});
