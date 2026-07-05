import { db } from '../db';
import { paymentSessions, orders } from '../../src/db/schema';
import { idempotencyKeys } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import crypto from 'crypto';

export type PaymentProviderType = 'manual_cash' | 'eft_pos' | 'fawry' | 'instapay' | 'vodafone_cash';

export class PaymentSessionService {
    /**
     * Initiates a payment session. Uses Idempotency to prevent duplicate charges.
     */
    static async initiatePayment(
        orderId: string,
        amount: number,
        providerType: PaymentProviderType,
        deviceId: string,
        createdBy: string,
        idempotencyKey?: string
    ) {
        // Validation
        if (amount <= 0) throw new Error('Payment amount must be greater than zero.');

        // Idempotency Check
        const finalIdempotencyKey = idempotencyKey || uuidv4();
        const existingSession = await db.query.paymentSessions.findFirst({
            where: eq(paymentSessions.idempotencyKey, finalIdempotencyKey)
        });

        if (existingSession) {
            logger.warn({ orderId, finalIdempotencyKey }, 'Idempotent request: returning existing session');
            return existingSession;
        }

        const sessionId = uuidv4();
        
        try {
            await db.insert(paymentSessions).values({
                id: sessionId,
                orderId,
                providerType,
                amount,
                status: 'initiated',
                idempotencyKey: finalIdempotencyKey,
                deviceId,
                createdBy,
            });

            logger.info({ sessionId, orderId, providerType }, 'Payment session initiated');
            return { sessionId, status: 'initiated', idempotencyKey: finalIdempotencyKey };
        } catch (error) {
            logger.error({ error, orderId }, 'Failed to initiate payment session');
            throw error;
        }
    }

    /**
     * Confirms a payment session.
     * Enforces State Machine: Cannot transition to confirmed if already failed or canceled.
     */
    static async confirmPayment(sessionId: string, externalReference?: string) {
        return await db.transaction(async (tx) => {
            const session = await tx.query.paymentSessions.findFirst({
                where: eq(paymentSessions.id, sessionId)
            });

            if (!session) throw new Error('Payment session not found.');

            // Validations
            if (session.status === 'confirmed') return session; // Idempotent
            if (['failed', 'cancelled'].includes(session.status!)) {
                throw new Error(`Cannot confirm a payment session that is ${session.status}`);
            }

            await tx.update(paymentSessions)
                .set({
                    status: 'confirmed',
                    verified: true,
                    externalReference,
                    updatedAt: new Date()
                })
                .where(eq(paymentSessions.id, sessionId));

            logger.info({ sessionId, externalReference }, 'Payment session confirmed');
            
            // Note: After confirmation, the OrderService should be notified to record the Ledger Entries.
            return { ...session, status: 'confirmed', externalReference };
        });
    }

    /**
     * Reverses or Voids a payment session (for timeouts or phantom transactions).
     */
    static async reversePayment(sessionId: string, reason: string) {
        return await db.transaction(async (tx) => {
            const session = await tx.query.paymentSessions.findFirst({
                where: eq(paymentSessions.id, sessionId)
            });

            if (!session) throw new Error('Payment session not found.');

            // Can mainly reverse pending/initiated or requires_reconciliation
            const targetStatus = 'requires_reconciliation'; // Assume intervention if it fails to reverse

            await tx.update(paymentSessions)
                .set({
                    status: targetStatus,
                    updatedAt: new Date()
                })
                .where(eq(paymentSessions.id, sessionId));

            logger.warn({ sessionId, reason }, `Payment session marked for reversal/reconciliation`);
            return { sessionId, status: targetStatus };
        });
    }
}
