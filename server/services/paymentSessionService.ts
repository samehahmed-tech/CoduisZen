import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, pool } from '../db';
import { orders, paymentSessions } from '../../src/db/schema';
import logger from '../utils/logger';
import { fromMinorUnits, toMinorUnits } from '../utils/money';
import { createSignedAuditLog } from './auditService';

export type PaymentProviderType = 'manual_cash' | 'eft_pos' | 'fawry' | 'instapay' | 'vodafone_cash';

const PROVIDERS = new Set<PaymentProviderType>(['manual_cash', 'eft_pos', 'fawry', 'instapay', 'vodafone_cash']);
const UNCONFIGURED_PROVIDERS = new Set<PaymentProviderType>(['fawry', 'instapay', 'vodafone_cash']);

let paymentSessionSchemaReady = false;

export const ensurePaymentSessionSchema = async () => {
    if (paymentSessionSchemaReady) return;
    try {
        await pool.query(`
            IF COL_LENGTH('dbo.payment_sessions', 'branch_id') IS NULL
                ALTER TABLE dbo.payment_sessions ADD branch_id nvarchar(255) NULL;
        `);
        await pool.query(`
            EXEC(N'UPDATE ps
                   SET branch_id = o.branch_id
                   FROM dbo.payment_sessions ps
                   INNER JOIN dbo.orders o ON o.id = ps.order_id
                   WHERE ps.branch_id IS NULL AND o.branch_id IS NOT NULL');
        `);
        await pool.query(`
            IF NOT EXISTS (
                SELECT 1 FROM sys.foreign_keys
                WHERE name = N'fk_payment_sessions_branch'
                  AND parent_object_id = OBJECT_ID(N'dbo.payment_sessions')
            )
                ALTER TABLE dbo.payment_sessions
                ADD CONSTRAINT fk_payment_sessions_branch FOREIGN KEY (branch_id) REFERENCES dbo.branches(id);
        `);
        await pool.query(`
            IF COL_LENGTH('dbo.payment_sessions', 'checkout_url_ciphertext') IS NULL
                ALTER TABLE dbo.payment_sessions ADD checkout_url_ciphertext nvarchar(max) NULL;
        `);
        paymentSessionSchemaReady = true;
    } catch (error: any) {
        logger.error({ error: error?.message || String(error) }, 'Payment session schema is not compatible');
        throw new PaymentSessionError('PAYMENT_SCHEMA_NOT_READY', 'Payment schema migration is required before processing payments.', 503);
    }
};

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
        scopeBranchId?: string,
    ) {
        await ensurePaymentSessionSchema();
        const provider = validateProvider(String(providerType));
        const numericAmount = Number(amount);
        if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
            throw new PaymentSessionError('INVALID_PAYMENT_AMOUNT', 'Payment amount must be greater than zero.', 400);
        }
        const normalizedAmount = fromMinorUnits(toMinorUnits(amount));

        const finalIdempotencyKey = idempotencyKey || randomUUID();
        const outcome = await db.transaction(async (tx) => {
            await tx.execute(sql`
                SELECT id
                FROM orders WITH (UPDLOCK, HOLDLOCK)
                WHERE id = ${orderId}
            `);

            const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).top(1);
            if (!order) throw new PaymentSessionError('ORDER_NOT_FOUND', 'Order not found.', 404);
            if (scopeBranchId && order.branchId !== scopeBranchId) {
                throw new PaymentSessionError('FORBIDDEN_BRANCH_ACCESS', 'Payment order is outside the active branch scope.', 403);
            }

            const [existingSession] = await tx.select().from(paymentSessions)
                .where(eq(paymentSessions.idempotencyKey, finalIdempotencyKey)).top(1);
            if (existingSession) {
                const sameRequest = existingSession.orderId === orderId
                    && existingSession.providerType === provider
                    && toMinorUnits(existingSession.amount) === toMinorUnits(normalizedAmount);
                if (!sameRequest) {
                    throw new PaymentSessionError(
                        'IDEMPOTENCY_KEY_REUSED',
                        'Idempotency key was already used for a different payment request.',
                        409,
                    );
                }
                return { order, session: existingSession, created: false };
            }

            if (order.isPaid) throw new PaymentSessionError('ORDER_ALREADY_PAID', 'Order is already fully paid.', 409);

            const [reserved] = await tx.select({
                total: sql<number>`coalesce(sum(${paymentSessions.amount}), 0)`,
            }).from(paymentSessions).where(sql`
                ${paymentSessions.orderId} = ${orderId}
                AND ${paymentSessions.status} IN ('initiated', 'pending', 'confirmed')
            `);
            const reservedMinor = toMinorUnits(Number(reserved?.total || 0));
            const orderTotalMinor = toMinorUnits(Number(order.total || 0));
            if (reservedMinor + toMinorUnits(normalizedAmount) > orderTotalMinor) {
                throw new PaymentSessionError(
                    'PAYMENT_EXCEEDS_ORDER_TOTAL',
                    'The requested payment exceeds the order total after existing payment reservations.',
                    409,
                );
            }

            const sessionId = randomUUID();
            await tx.insert(paymentSessions).values({
                id: sessionId,
                orderId,
                branchId: order.branchId,
                providerType: provider,
                amount: normalizedAmount,
                status: 'initiated',
                idempotencyKey: finalIdempotencyKey,
                deviceId,
                createdBy,
            }).onConflictDoNothing();

            const [session] = await tx.select().from(paymentSessions)
                .where(eq(paymentSessions.id, sessionId)).top(1);
            if (!session) throw new PaymentSessionError('PAYMENT_SESSION_CREATE_FAILED', 'Payment session could not be created.', 409);
            return { order, session, created: true };
        });

        if (!outcome.created) {
            logger.warn({ orderId, finalIdempotencyKey }, 'Idempotent request: returning existing session');
            return {
                sessionId: outcome.session.id,
                orderId: outcome.session.orderId,
                status: outcome.session.status,
                idempotencyKey: outcome.session.idempotencyKey,
                idempotentReplay: true,
            };
        }

        await createSignedAuditLog({
            eventType: 'PAYMENT_SESSION_INITIATED',
            userId: createdBy,
            branchId: outcome.order.branchId,
            payload: { sessionId: outcome.session.id, orderId, providerType: provider, amount: normalizedAmount, idempotencyKey: finalIdempotencyKey },
            reason: 'Payment session initiated',
        });

        logger.info({ sessionId: outcome.session.id, orderId, providerType: provider }, 'Payment session initiated');
        return { sessionId: outcome.session.id, orderId, status: 'initiated', idempotencyKey: finalIdempotencyKey };
    }

    static async confirmPayment(sessionId: string, externalReference?: string, confirmedBy = 'system', scopeBranchId?: string) {
        await ensurePaymentSessionSchema();
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
            if (session.branchId && order.branchId && session.branchId !== order.branchId) {
                throw new PaymentSessionError('PAYMENT_BRANCH_MISMATCH', 'Payment session branch no longer matches the order branch.', 409);
            }
            if (scopeBranchId && session.branchId && session.branchId !== scopeBranchId) {
                throw new PaymentSessionError('FORBIDDEN_BRANCH_ACCESS', 'Payment session is outside the active branch scope.', 403);
            }
            if (scopeBranchId && order.branchId !== scopeBranchId) {
                throw new PaymentSessionError('FORBIDDEN_BRANCH_ACCESS', 'Payment order is outside the active branch scope.', 403);
            }

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

            const confirmedMinor = toMinorUnits(Number(totals?.confirmed || 0));
            const orderTotalMinor = toMinorUnits(Number(order.total || 0));
            if (confirmedMinor > orderTotalMinor) {
                throw new PaymentSessionError(
                    'PAYMENT_EXCEEDS_ORDER_TOTAL',
                    'Confirmed payments exceed the order total.',
                    409,
                );
            }

            const fullyPaid = confirmedMinor >= orderTotalMinor;
            const confirmedAmount = fromMinorUnits(confirmedMinor);
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
                branchId: order.branchId,
            };
        });

        await createSignedAuditLog({
            eventType: 'PAYMENT_SESSION_CONFIRMED',
            userId: confirmedBy,
            branchId: (result as any).branchId,
            payload: { sessionId, orderId: result.orderId, externalReference: result.externalReference, paidAmount: result.paidAmount, isPaid: result.isPaid },
            reason: 'Payment session confirmed',
        });

        logger.info({ sessionId, externalReference }, 'Payment session confirmed');
        return result;
    }

    static async reversePayment(sessionId: string, reason: string, reversedBy = 'system', scopeBranchId?: string) {
        await ensurePaymentSessionSchema();
        const result = await db.transaction(async (tx) => {
            const [session] = await tx.select().top(1).from(paymentSessions).where(eq(paymentSessions.id, sessionId));
            if (!session) throw new PaymentSessionError('SESSION_NOT_FOUND', 'Payment session not found.', 404);
            if (session.status === 'confirmed') {
                throw new PaymentSessionError(
                    'CONFIRMED_PAYMENT_REQUIRES_REFUND',
                    'Confirmed payments must use the audited refund flow.',
                    409,
                );
            }

            const [order] = await tx.select({ branchId: orders.branchId })
                .from(orders).where(eq(orders.id, session.orderId)).top(1);
            if (session.branchId && order?.branchId && session.branchId !== order.branchId) {
                throw new PaymentSessionError('PAYMENT_BRANCH_MISMATCH', 'Payment session branch no longer matches the order branch.', 409);
            }
            if (scopeBranchId && session.branchId && session.branchId !== scopeBranchId) {
                throw new PaymentSessionError('FORBIDDEN_BRANCH_ACCESS', 'Payment session is outside the active branch scope.', 403);
            }
            if (scopeBranchId && order?.branchId !== scopeBranchId) {
                throw new PaymentSessionError('FORBIDDEN_BRANCH_ACCESS', 'Payment order is outside the active branch scope.', 403);
            }

            await tx.update(paymentSessions).set({
                status: 'requires_reconciliation',
                updatedAt: new Date(),
            }).where(eq(paymentSessions.id, sessionId));

            logger.warn({ sessionId, reason }, 'Payment session marked for reversal/reconciliation');
            return { sessionId, orderId: session.orderId, branchId: order?.branchId, status: 'requires_reconciliation' };
        });
        await createSignedAuditLog({
            eventType: 'PAYMENT_SESSION_REVERSED',
            userId: reversedBy,
            branchId: result.branchId,
            payload: { sessionId, orderId: result.orderId, status: result.status },
            reason,
        });
        return result;
    }
}
