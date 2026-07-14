import express from 'express';
import { PaymentSessionError, PaymentSessionService, PaymentProviderType } from '../services/paymentSessionService';
import { db } from '../db';
import { orders } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import logger from '../utils/logger';
import { requireRoles } from '../middleware/auth';
import { enforceBranch } from '../middleware/branchIsolation';

const router = express.Router();
const paymentAccess = requireRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'MANAGER', 'CASHIER_MANAGER', 'CASHIER');

const sendPaymentError = (res: express.Response, error: unknown) => {
    if (error instanceof PaymentSessionError) {
        return res.status(error.status).json({ error: error.code, message: error.message });
    }
    return res.status(500).json({ error: 'PAYMENT_OPERATION_FAILED' });
};

router.use(paymentAccess, enforceBranch);

/**
 * Initiates a new payment session constraint
 */
router.post('/sessions/initiate', async (req, res) => {
    try {
        const { orderId, amount, providerType, deviceId, idempotencyKey } = req.body;
        const user = (req as any).user;
        const userId = user?.id || 'system';

        if (!orderId || !amount || !providerType) {
            return res.status(400).json({ error: 'Missing required parameters: orderId, amount, providerType' });
        }

        // Branch Isolation Check
        const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
        if (!order) {
            return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
        }

        if (user && user.role !== 'SUPER_ADMIN' && user.role !== 'OWNER') {
            if (user.branchId && user.branchId !== order.branchId) {
                return res.status(403).json({ error: 'FORBIDDEN_BRANCH_ACCESS' });
            }
        }

        const session = await PaymentSessionService.initiatePayment(
            orderId,
            amount,
            providerType as PaymentProviderType,
            deviceId || 'unknown',
            userId,
            idempotencyKey
        );

        res.status(201).json(session);
    } catch (error: any) {
        logger.error({ error }, 'POST /sessions/initiate failed');
        sendPaymentError(res, error);
    }
});

/**
 * Confirms a payment session
 * Expected to be called by POS client or directly from EFT Hardware Bridge Webhooks
 */
router.post('/sessions/:id/confirm', async (req, res) => {
    try {
        const sessionId = req.params.id;
        const { externalReference } = req.body;
        const user = (req as any).user;

        // Branch Isolation Check
        if (user && user.role !== 'SUPER_ADMIN' && user.role !== 'OWNER' && user.branchId) {
            const sessionData = await db.query.paymentSessions.findFirst({ where: (s, { eq }) => eq(s.id, sessionId) });
            if (!sessionData) return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
            
            const order = await db.query.orders.findFirst({ where: eq(orders.id, sessionData.orderId!) });
            if (order && order.branchId !== user.branchId) {
                return res.status(403).json({ error: 'FORBIDDEN_BRANCH_ACCESS' });
            }
        }

        const session = await PaymentSessionService.confirmPayment(sessionId, externalReference);

        res.status(200).json(session);
    } catch (error: any) {
        logger.error({ error, sessionId: req.params.id }, 'POST /sessions/:id/confirm failed');
        sendPaymentError(res, error);
    }
});

/**
 * Voids/Reverses a session (Timeouts)
 */
router.post('/sessions/:id/reverse', async (req, res) => {
    try {
        const sessionId = req.params.id;
        const { reason } = req.body;
        const user = (req as any).user;

        // Branch Isolation Check
        if (user && user.role !== 'SUPER_ADMIN' && user.role !== 'OWNER' && user.branchId) {
            const sessionData = await db.query.paymentSessions.findFirst({ where: (s, { eq }) => eq(s.id, sessionId) });
            if (!sessionData) return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
            
            const order = await db.query.orders.findFirst({ where: eq(orders.id, sessionData.orderId!) });
            if (order && order.branchId !== user.branchId) {
                return res.status(403).json({ error: 'FORBIDDEN_BRANCH_ACCESS' });
            }
        }

        const session = await PaymentSessionService.reversePayment(sessionId, reason || 'User voided');
        res.status(200).json(session);
    } catch (error: any) {
        logger.error({ error, sessionId: req.params.id }, 'POST /sessions/:id/reverse failed');
        sendPaymentError(res, error);
    }
});

export default router;
