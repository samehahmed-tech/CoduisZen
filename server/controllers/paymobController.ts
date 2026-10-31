import type { Request, Response } from 'express';
import { db } from '../db';
import { and, eq } from 'drizzle-orm';
import { orders, payments, paymentSessions } from '../../src/db/schema';
import { createIntention, getPaymobConfig, savePaymobConfig } from '../modules/payments/paymobService';
import logger from '../utils/logger';
import { paymentWebhookRetryService } from '../services/paymentWebhookRetryService';
import { settlePaymobCallback } from '../services/paymobSettlementService';
import { createSignedAuditLog } from '../services/auditService';
import { isTransientPaymentWebhookError } from '../utils/paymentWebhookRetryPolicy';
import { paymentGatewayService } from '../services/paymentGatewayService';

const log = logger.child({ controller: 'paymob' });

const auditPaymobMutation = (req: Request, eventType: string, payload: Record<string, unknown>, after?: Record<string, unknown>) => createSignedAuditLog({
    eventType,
    userId: req.user?.id || 'system',
    userRole: req.user?.role,
    branchId: req.effectiveBranchId || req.user?.branchId || null,
    requestId: req.requestId,
    sourceDevice: req.headers['user-agent'],
    payload,
    after,
    reason: `Paymob mutation: ${eventType}`,
});

export const getConfig = async (_req: Request, res: Response) => {
    res.json(await getPaymobConfig());
};

export const updateConfig = async (req: Request, res: Response) => {
    try {
        await savePaymobConfig(req.body || {}, (req as any).user?.id || 'system');
        const config = await getPaymobConfig();
        await auditPaymobMutation(req, 'PAYMOB_CONFIG_UPDATED', {
            changedKeys: Object.keys(req.body || {}).sort(),
            apiKeySet: Boolean(config.apiKeySet),
            hmacSecretSet: Boolean(config.hmacSecretSet),
        }, { enabled: Boolean(config.enabled) });
        res.json(config);
    } catch {
        res.status(500).json({ error: 'PAYMOB_CONFIG_SAVE_FAILED' });
    }
};

/** Cashier creates a checkout intention → hosted iframe URL. Body: {orderId, amount, method?, billing?}. */
export const createCheckout = async (req: Request, res: Response) => {
    try {
        const { orderId, amount, method, billing, deviceId } = req.body || {};
        if (!orderId || !(Number(amount) > 0)) return res.status(400).json({ error: 'ORDER_AND_AMOUNT_REQUIRED' });
        const [order] = await db.select({ id: orders.id, branchId: orders.branchId, total: orders.total })
            .from(orders)
            .where(and(eq(orders.id, String(orderId)), eq(orders.branchId, String(req.effectiveBranchId || ''))));
        if (!order) return res.status(404).json({ error: 'ORDER_NOT_FOUND' });

        const [paymentRows, sessionRows] = await Promise.all([
            db.select({ amount: payments.amount, status: payments.status })
                .from(payments).where(eq(payments.orderId, order.id)),
            db.select({ amount: paymentSessions.amount, status: paymentSessions.status })
                .from(paymentSessions).where(eq(paymentSessions.orderId, order.id)),
        ]);
        const activePaymentTotal = paymentRows
            .filter((row: any) => ['PENDING', 'COMPLETED'].includes(String(row.status || '').toUpperCase()))
            .reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const activeSessionTotal = sessionRows
            .filter((row: any) => ['initiated', 'pending', 'confirmed'].includes(String(row.status || '').toLowerCase()))
            .reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const reserved = Math.max(activePaymentTotal, activeSessionTotal);
        const requestedAmount = Number(amount);
        const remaining = Number(order.total || 0) - reserved;
        if (requestedAmount > remaining + 0.0001) {
            return res.status(409).json({ error: 'PAYMENT_AMOUNT_EXCEEDS_REMAINING', remaining: Math.max(0, remaining) });
        }
        const intention = await createIntention({
            amount: requestedAmount,
            merchantOrderId: String(orderId),
            billing,
            method: method === 'INSTAPAY' ? 'INSTAPAY' : 'CARD',
            branchId: order.branchId,
        });
        // Pending trail for reconciliation (best effort).
        try {
            await db.insert(payments).values({
                id: `PAYMOB-${intention.paymobOrderId}`,
                orderId: String(orderId),
                method: intention.method === 'INSTAPAY' ? 'INSTAPAY' : 'PAYMOB',
                amount: Number(amount),
                referenceNumber: String(intention.paymobOrderId),
                status: 'PENDING',
                processedBy: (req as any).user?.id || 'system',
                createdAt: new Date(),
            } as any);
        } catch { /* duplicate retry — fine */ }
        try {
            await db.insert(paymentSessions).values({
                id: `PAYMOB-SESSION-${intention.paymobOrderId}`,
                orderId: String(orderId),
                branchId: order.branchId,
                providerType: intention.method === 'INSTAPAY' ? 'paymob_instapay' : 'paymob_card',
                amount: Number(amount),
                status: 'initiated',
                verified: false,
                externalReference: String(intention.paymobOrderId),
                idempotencyKey: `paymob:${intention.paymobOrderId}`,
                deviceId: deviceId || 'online-checkout',
                createdBy: (req as any).user?.id || 'system',
                createdAt: new Date(),
                updatedAt: new Date(),
            } as any);
        } catch { /* duplicate checkout callback/session — keep the original */ }
        await auditPaymobMutation(req, 'PAYMOB_CHECKOUT_CREATED', {
            orderId: String(orderId),
            paymentSessionId: `PAYMOB-SESSION-${intention.paymobOrderId}`,
            amountCents: Math.round(Number(amount) * 100),
            method: intention.method,
        }, { status: 'initiated' });
        res.status(201).json(intention);
    } catch (err: any) {
        res.status(Number((err as any)?.status) || 500).json({ error: String(err?.message || 'PAYMOB_CHECKOUT_FAILED') });
    }
};

/** Public Paymob Transaction Processed Callback (HMAC verified). */
export const handleWebhook = async (req: Request, res: Response) => {
    try {
        const obj = (req.body as any)?.obj || req.body;
        try {
            const result = await settlePaymobCallback(obj);
            return res.status(200).json({ ok: true, success: result.success });
        } catch (e: any) {
            if (e?.code === 'BAD_HMAC') {
                log.warn('Paymob webhook bad HMAC');
                return res.status(401).json({ ok: false, error: 'BAD_HMAC' });
            }
            if (e?.code === 'STALE_CALLBACK') {
                log.warn('Paymob webhook stale callback');
                return res.status(409).json({ ok: false, error: 'STALE_CALLBACK' });
            }
            if (!isTransientPaymentWebhookError(e)) {
                log.warn({ err: e?.message }, 'Paymob webhook rejected without retry');
                return res.status(422).json({ ok: false, error: 'PAYMOB_WEBHOOK_NOT_RETRYABLE' });
            }
            log.warn({ err: e?.message }, 'Paymob webhook ledger update failed');
            await paymentWebhookRetryService.recordFailure({
                provider: 'paymob',
                payload: obj,
                reason: String(e?.message || e),
            });
            return res.status(202).json({ ok: false, accepted: true, retryQueued: true });
        }
    } catch {
        return res.status(500).json({ ok: false, error: 'PAYMOB_WEBHOOK_FAILED' });
    }
};

export const refund = async (req: Request, res: Response) => {
    try {
        const { transactionId, amount } = req.body || {};
        if (!transactionId) return res.status(400).json({ error: 'TRANSACTION_ID_REQUIRED' });
        const [payment] = await db.select({
            orderId: payments.orderId,
            referenceNumber: payments.referenceNumber,
            status: payments.status,
            branchId: orders.branchId,
        }).from(payments)
            .innerJoin(orders, eq(payments.orderId, orders.id))
            .where(and(
                eq(payments.referenceNumber, String(transactionId)),
                eq(orders.branchId, String(req.effectiveBranchId || '')),
            ));
        if (!payment) return res.status(404).json({ error: 'TRANSACTION_NOT_FOUND' });
        if (String(payment.status || '').toUpperCase() !== 'COMPLETED') {
            return res.status(409).json({ error: 'TRANSACTION_NOT_SETTLED' });
        }
        const [session] = await db.select({ id: paymentSessions.id })
            .from(paymentSessions)
            .innerJoin(orders, eq(paymentSessions.orderId, orders.id))
            .where(and(
                eq(paymentSessions.orderId, payment.orderId),
                eq(orders.branchId, String(req.effectiveBranchId || '')),
            ))
            .limit(1);
        if (!session) return res.status(409).json({ error: 'PAYMENT_SESSION_NOT_FOUND' });
        const result = await paymentGatewayService.refund(String(session.id), {
            branchId: String(req.effectiveBranchId),
            requestedBy: String(req.user?.id || 'system'),
        });
        await auditPaymobMutation(req, 'PAYMOB_REFUND_REQUESTED', {
            transactionId: String(transactionId),
            amountCents: amount !== undefined ? Math.round(Number(amount) * 100) : null,
            sessionId: session.id,
        }, { requested: true, providerResult: Boolean(result) });
        res.json(result);
    } catch (err: any) {
        res.status(Number((err as any)?.status) || 500).json({ error: String(err?.message || 'PAYMOB_REFUND_FAILED') });
    }
};
