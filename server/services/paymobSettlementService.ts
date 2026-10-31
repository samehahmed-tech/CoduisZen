import { and, eq, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { orders, payments, paymentSessions } from '../../src/db/schema';
import { handleCallback } from '../modules/payments/paymobService';
import { decidePaymentWebhookStatus } from '../utils/paymentWebhookInvariant';
import { fromMinorUnits, toMinorUnits } from '../utils/money';

export const settlePaymobCallback = async (obj: Record<string, any>) => {
    const result = await handleCallback(obj);
    if (!result.verified) {
        const error = new Error(result.stale ? 'STALE_CALLBACK' : 'BAD_HMAC');
        (error as Error & { code?: string }).code = result.stale ? 'STALE_CALLBACK' : 'BAD_HMAC';
        throw error;
    }

    if (!result.paymobOrderId) return result;

    const callbackReference = result.transactionId !== undefined
        ? String(result.transactionId)
        : String(result.paymobOrderId);
    // Keep payment, session, and order projection changes atomic. A callback can
    // be retried by Paymob while the first request is still committing.
    return db.transaction(async (tx) => {
        const [session] = await tx.select({
            id: paymentSessions.id,
            orderId: paymentSessions.orderId,
            amount: paymentSessions.amount,
        }).from(paymentSessions).where(and(
            or(
                eq(paymentSessions.providerType, 'paymob_card'),
                eq(paymentSessions.providerType, 'paymob_instapay'),
            ),
            sql`${paymentSessions.externalReference} = ${String(result.paymobOrderId)}`,
        )).top(1);

        if (session && result.amountCents !== undefined && toMinorUnits(Number(session.amount || 0)) !== toMinorUnits(Number(result.amountCents) / 100)) {
            await tx.update(paymentSessions).set({
                status: 'requires_reconciliation',
                verified: false,
                updatedAt: new Date(),
            }).where(eq(paymentSessions.id, session.id));
            return { ...result, success: false, amountMismatch: true };
        }

        // Never resolve a callback reference globally: provider references can
        // be reused or malformed across tenants. The payment session/order is
        // the trusted branch-scoped anchor for settlement.
        const paymentScope = session
            ? eq(payments.orderId, session.orderId)
            : result.merchantOrderId
                ? eq(payments.orderId, result.merchantOrderId)
                : undefined;
        const [existing] = paymentScope
            ? await tx.select({
                id: payments.id,
                amount: payments.amount,
                status: payments.status,
            }).from(payments).where(and(
                paymentScope,
                or(
                    eq(payments.referenceNumber, String(result.paymobOrderId)),
                    eq(payments.referenceNumber, callbackReference),
                ),
            ))
            : [];

        const decision = existing
            ? decidePaymentWebhookStatus({
                currentStatus: existing.status,
                success: result.success,
                expectedAmountCents: Math.round(Number(existing.amount || 0) * 100),
                receivedAmountCents: result.amountCents,
            })
            : decidePaymentWebhookStatus({ success: result.success });

        if (existing) {
            await tx.update(payments).set({
                status: decision.status,
                referenceNumber: callbackReference,
            } as any).where(eq(payments.id, existing.id));
        } else if (result.merchantOrderId) {
            await tx.insert(payments).values({
                id: `PAYMOB-${result.paymobOrderId}-${result.transactionId ?? 'cb'}`,
                orderId: result.merchantOrderId,
                method: 'PAYMOB',
                amount: Number(result.amountCents || 0) / 100,
                referenceNumber: callbackReference,
                status: decision.status,
                processedBy: 'paymob-webhook',
                createdAt: new Date(),
            } as any).onConflictDoNothing();
        }

        if (session) {
            await tx.update(paymentSessions).set({
                status: decision.status === 'COMPLETED' ? 'confirmed' : decision.status === 'FAILED' ? 'failed' : 'requires_reconciliation',
                verified: decision.status === 'COMPLETED',
                updatedAt: new Date(),
            }).where(eq(paymentSessions.id, session.id));

            const [confirmed] = await tx.select({
                total: sql<number>`coalesce(sum(${paymentSessions.amount}), 0)`,
            }).from(paymentSessions).where(and(
                eq(paymentSessions.orderId, session.orderId),
                eq(paymentSessions.status, 'confirmed'),
            ));
            const [order] = await tx.select({ total: orders.total, status: orders.status })
                .from(orders).where(eq(orders.id, session.orderId)).top(1);
            if (order) {
                const paidMinor = toMinorUnits(Number(confirmed?.total || 0));
                const orderTotalMinor = toMinorUnits(Number(order.total || 0));
                const fullyPaid = paidMinor >= orderTotalMinor;
                await tx.update(orders).set({
                    paidAmount: fromMinorUnits(paidMinor),
                    isPaid: fullyPaid,
                    status: fullyPaid && order.status === 'PENDING' ? 'PREPARING' : order.status,
                    updatedAt: new Date(),
                }).where(eq(orders.id, session.orderId));
            }
        }

        return result;
    });
};
