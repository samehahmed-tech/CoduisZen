import { eq, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { orders, paymentSessions } from '../../src/db/schema';
import logger from '../utils/logger';

export type PaymentProviderType = 'manual_cash' | 'eft_pos' | 'fawry' | 'instapay' | 'vodafone_cash';

const PROVIDERS = new Set<PaymentProviderType>(['manual_cash', 'eft_pos', 'fawry', 'instapay', 'vodafone_cash']);
const UNCONFIGURED_PROVIDERS = new Set<PaymentProviderType>(['fawry', 'instapay', 'vodafone_cash']);

export class PaymentSessionError extends Error {
    constructor(public readonly code: string, message: string, public readonly status: number) {
        super(message);
        this.name = 'PaymentSessionError';
    }
}

const validateProvider = (provider: string): PaymentProviderType => {
    if (!PROVIDERS.has(provider as PaymentProviderType)) {
        throw new PaymentSessionError('INVALID_PAYMENT_PROVIDER', 'Unsupported payment provider.', 400);
    }
    const typedProvider = provider as PaymentProviderType;
    if (UNCONFIGURED_PROVIDERS.has(typedProvider)) {
        throw new PaymentSessionError(
            'PAYMENT_PROVIDER_NOT_CONFIGURED',
            `${typedProvider} is unavailable until a verified provider adapter is configured.`,
            503,
        );
    }
    return typedProvider;
};

export class PaymentSessionService {
    static async initiatePayment(
        orderId: string,
        amount: number,
        providerType: PaymentProviderType,
        deviceId: string,
        createdBy: string,
        idempotencyKey?: string,
    ) {
        const provider = validateProvider(String(providerType));
        const normalizedAmount = Number(amount);
        if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
            throw new PaymentSessionError('INVALID_PAYMENT_AMOUNT', 'Payment amount must be greater than zero.', 400);
        }

        const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
        if (!order) throw new PaymentSessionError('ORDER_NOT_FOUND', 'Order not found.', 404);
        if (order.isPaid) throw new PaymentSessionError('ORDER_ALREADY_PAID', 'Order is already fully paid.', 409);

        const finalIdempotencyKey = idempotencyKey || uuidv4();
        const existingSession = await db.query.paymentSessions.findFirst({
            where: eq(paymentSessions.idempotencyKey, finalIdempotencyKey),
        });

        if (existingSession) {
            const sameRequest = existingSession.orderId === orderId
                && existingSession.providerType === provider
                && Math.abs(Number(existingSession.amount) - normalizedAmount) < 0.005;
            if (!sameRequest) {
                throw new PaymentSessionError(
                    'IDEMPOTENCY_KEY_REUSED',
                    'Idempotency key was already used for a different payment request.',
                    409,
                );
            }
            logger.warn({ orderId, finalIdempotencyKey }, 'Idempotent request: returning existing session');
            return existingSession;
        }

        const sessionId = uuidv4();
        await db.insert(paymentSessions).values({
            id: sessionId,
            orderId,
            providerType: provider,
            amount: normalizedAmount,
            status: 'initiated',
            idempotencyKey: finalIdempotencyKey,
            deviceId,
            createdBy,
        });

        logger.info({ sessionId, orderId, providerType: provider }, 'Payment session initiated');
        return { sessionId, orderId, status: 'initiated', idempotencyKey: finalIdempotencyKey };
    }

    static async confirmPayment(sessionId: string, externalReference?: string) {
        const result = await db.transaction(async (tx) => {
            await tx.execute(sql`
                SELECT o.id
                FROM orders o WITH (UPDLOCK, HOLDLOCK)
                INNER JOIN payment_sessions ps ON ps.order_id = o.id
                WHERE ps.id = ${sessionId}
            `);

            const [session] = await tx.select().top(1).from(paymentSessions).where(eq(paymentSessions.id, sessionId));
            if (!session) throw new PaymentSessionError('SESSION_NOT_FOUND', 'Payment session not found.', 404);

            const provider = validateProvider(String(session.providerType));
            if (provider === 'eft_pos' && !externalReference?.trim()) {
                throw new PaymentSessionError(
                    'PAYMENT_REFERENCE_REQUIRED',
                    'EFT/POS confirmation requires the terminal reference.',
                    400,
                );
            }
            if (['failed', 'cancelled', 'requires_reconciliation'].includes(String(session.status))) {
                throw new PaymentSessionError(
                    'INVALID_PAYMENT_STATE',
                    `Cannot confirm a payment session that is ${session.status}.`,
                    409,
                );
            }

            const [order] = await tx.select().top(1).from(orders).where(eq(orders.id, session.orderId));
            if (!order) throw new PaymentSessionError('ORDER_NOT_FOUND', 'Order not found.', 404);

            if (session.status !== 'confirmed') {
                await tx.update(paymentSessions).set({
                    status: 'confirmed',
                    verified: true,
                    externalReference: externalReference?.trim() || null,
                    updatedAt: new Date(),
                }).where(eq(paymentSessions.id, sessionId));
            }

            const [totals] = await tx.select({
                confirmed: sql<number>`coalesce(sum(${paymentSessions.amount}), 0)`,
            }).from(paymentSessions).where(sql`${paymentSessions.orderId} = ${session.orderId} AND ${paymentSessions.status} = 'confirmed'`);

            const confirmedAmount = Number(totals?.confirmed || 0);
            const orderTotal = Number(order.total || 0);
            if (confirmedAmount > orderTotal + 0.005) {
                throw new PaymentSessionError(
                    'PAYMENT_EXCEEDS_ORDER_TOTAL',
                    'Confirmed payments exceed the order total.',
                    409,
                );
            }

            const fullyPaid = confirmedAmount + 0.005 >= orderTotal;
            const orderStatus = fullyPaid && order.status === 'PENDING' ? 'PREPARING' : order.status;
            await tx.update(orders).set({
                paidAmount: confirmedAmount,
                isPaid: fullyPaid,
                status: orderStatus,
                updatedAt: new Date(),
            }).where(eq(orders.id, order.id));

            return {
                ...session,
                status: 'confirmed',
                verified: true,
                externalReference: externalReference?.trim() || session.externalReference,
                paidAmount: confirmedAmount,
                isPaid: fullyPaid,
                orderStatus,
            };
        });

        logger.info({ sessionId, externalReference }, 'Payment session confirmed');
        return result;
    }

    static async reversePayment(sessionId: string, reason: string) {
        return db.transaction(async (tx) => {
            const [session] = await tx.select().top(1).from(paymentSessions).where(eq(paymentSessions.id, sessionId));
            if (!session) throw new PaymentSessionError('SESSION_NOT_FOUND', 'Payment session not found.', 404);
            if (session.status === 'confirmed') {
                throw new PaymentSessionError(
                    'CONFIRMED_PAYMENT_REQUIRES_REFUND',
                    'Confirmed payments must use the audited refund flow.',
                    409,
                );
            }

            await tx.update(paymentSessions).set({
                status: 'requires_reconciliation',
                updatedAt: new Date(),
            }).where(eq(paymentSessions.id, sessionId));

            logger.warn({ sessionId, reason }, 'Payment session marked for reversal/reconciliation');
            return { sessionId, status: 'requires_reconciliation' };
        });
    }
}
