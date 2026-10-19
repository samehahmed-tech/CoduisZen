import type { Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { payments } from '../../src/db/schema';
import {
    createIntention,
    getPaymobConfig,
    handleCallback,
    refundTransaction,
    savePaymobConfig,
} from '../modules/payments/paymobService';
import logger from '../utils/logger';

const log = logger.child({ controller: 'paymob' });

export const getConfig = async (_req: Request, res: Response) => {
    res.json(await getPaymobConfig());
};

export const updateConfig = async (req: Request, res: Response) => {
    try {
        await savePaymobConfig(req.body || {}, (req as any).user?.id || 'system');
        res.json(await getPaymobConfig());
    } catch {
        res.status(500).json({ error: 'PAYMOB_CONFIG_SAVE_FAILED' });
    }
};

/** Cashier creates a checkout intention → hosted iframe URL. Body: {orderId, amount, method?, billing?}. */
export const createCheckout = async (req: Request, res: Response) => {
    try {
        const { orderId, amount, method, billing } = req.body || {};
        if (!orderId || !(Number(amount) > 0)) return res.status(400).json({ error: 'ORDER_AND_AMOUNT_REQUIRED' });
        const intention = await createIntention({
            amount: Number(amount),
            merchantOrderId: String(orderId),
            billing,
            method: method === 'INSTAPAY' ? 'INSTAPAY' : 'CARD',
            branchId: (req as any).user?.branchId || (req as any).branch?.id,
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
        res.status(201).json(intention);
    } catch (err: any) {
        res.status(Number((err as any)?.status) || 500).json({ error: String(err?.message || 'PAYMOB_CHECKOUT_FAILED') });
    }
};

/** Public Paymob Transaction Processed Callback (HMAC verified). */
export const handleWebhook = async (req: Request, res: Response) => {
    try {
        const obj = (req.body as any)?.obj || req.body;
        const result = await handleCallback(obj);
        if (!result.verified) {
            log.warn('Paymob webhook bad HMAC');
            return res.status(401).json({ ok: false, error: 'BAD_HMAC' });
        }
        try {
            if (result.paymobOrderId) {
                const [existing] = await db.select({ id: payments.id }).from(payments)
                    .where(eq(payments.referenceNumber, String(result.paymobOrderId)));
                if (existing) {
                    await db.update(payments)
                        .set({
                            status: result.success ? 'COMPLETED' : 'FAILED',
                            referenceNumber: result.transactionId !== undefined ? String(result.transactionId) : undefined,
                        } as any)
                        .where(eq(payments.id, existing.id));
                } else if (result.merchantOrderId) {
                    await db.insert(payments).values({
                        id: `PAYMOB-${result.paymobOrderId}-${result.transactionId ?? 'cb'}`,
                        orderId: result.merchantOrderId,
                        method: 'PAYMOB',
                        amount: Number(result.amountCents || 0) / 100,
                        referenceNumber: result.transactionId !== undefined ? String(result.transactionId) : String(result.paymobOrderId),
                        status: result.success ? 'COMPLETED' : 'FAILED',
                        processedBy: 'paymob-webhook',
                        createdAt: new Date(),
                    } as any);
                }
            }
        } catch (e: any) {
            log.warn({ err: e?.message }, 'Paymob webhook ledger update failed');
        }
        return res.status(200).json({ ok: true, success: result.success });
    } catch {
        return res.status(500).json({ ok: false, error: 'PAYMOB_WEBHOOK_FAILED' });
    }
};

export const refund = async (req: Request, res: Response) => {
    try {
        const { transactionId, amount } = req.body || {};
        if (!transactionId) return res.status(400).json({ error: 'TRANSACTION_ID_REQUIRED' });
        const amountCents = amount !== undefined ? Math.round(Number(amount) * 100) : undefined;
        res.json(await refundTransaction(transactionId, amountCents));
    } catch (err: any) {
        res.status(Number((err as any)?.status) || 500).json({ error: String(err?.message || 'PAYMOB_REFUND_FAILED') });
    }
};
