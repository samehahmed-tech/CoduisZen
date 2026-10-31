/**
 * Payment Gateway Integration Framework
 * Implements: Phase 2.9 (Egypt Localized Payments)
 * 
 * Provides a unified interface for InstaPay, Vodafone Cash, and Fawry integrations.
 */

import { db } from '../db';
import { payments, orders, paymentSessions } from '../../src/db/schema';
import { and, desc, eq, ne } from 'drizzle-orm';
import logger from '../utils/logger';
import { paymobAdapter } from '../gateway-adapters/paymobAdapter';
import { instaPayAdapter } from '../gateway-adapters/instaPayAdapter';
import { fawryAdapter } from '../gateway-adapters/fawryAdapter';
import { vodafoneCashAdapter } from '../gateway-adapters/vodafoneCashAdapter';
import { stripeAdapter } from '../gateway-adapters/stripeAdapter';
import { refundService } from './refundService';
import { createSignedAuditLog } from './auditService';
import { savePaymobConfig } from '../modules/payments/paymobService';

const log = logger.child({ service: 'payment' });

export type PaymentProvider = 'INSTAPAY' | 'VODAFONE_CASH' | 'FAWRY' | 'STRIPE' | 'CASH';

export interface PaymentRequest {
    orderId: string;
    amount: number;
    provider: PaymentProvider;
    customerPhone?: string;
    description?: string;
}

export interface PaymentResponse {
    success: boolean;
    transactionId: string;
    referenceCode?: string; // e.g. for Fawry
    gatewayUrl?: string; // Redirect URL
    qrCode?: string; // QR Base64
    status: 'PENDING' | 'SUCCESS' | 'FAILED';
    message?: string;
}

export interface GatewayAdapter {
    name: string;
    createCheckout(input: { providerConfig: Record<string, any>; [key: string]: any }): Promise<any>;
    handleWebhook(input: { providerConfig?: Record<string, any>; [key: string]: any }): Promise<{ status: 'PENDING' | 'SUCCESS' | 'FAILED'; failureReason?: string }>;
    refund(input: { providerConfig: Record<string, any>; [key: string]: any }): Promise<any>;
}

const GATEWAY_ADAPTERS: Record<string, GatewayAdapter> = {
    PAYMOB: paymobAdapter,
    CARD: paymobAdapter,
    INSTAPAY: instaPayAdapter,
    FAWRY: fawryAdapter,
    VODAFONE_CASH: vodafoneCashAdapter,
    STRIPE: stripeAdapter,
};

const getGatewayAdapter = (provider: unknown): GatewayAdapter => {
    const normalized = String(provider || '').trim().toUpperCase();
    const adapter = GATEWAY_ADAPTERS[normalized];
    if (!adapter) throw Object.assign(new Error(`PAYMENT_PROVIDER_NOT_CONFIGURED: ${normalized || 'UNKNOWN'}`), { status: 503 });
    return adapter;
};

/**
 * Providers are not consistent about whether a failed refund is represented
 * by an exception, a boolean, or a status field. Treat every ambiguous result
 * as a failure so the internal payment/refund state cannot become falsely
 * successful.
 */
export const isSuccessfulGatewayRefundResult = (result: unknown): boolean => {
    if (!result || typeof result !== 'object') return false;
    const data = result as Record<string, unknown>;
    if (data.success === false || data.ok === false) return false;
    const status = String(data.status ?? data.state ?? '').trim().toUpperCase();
    if (['FAILED', 'FAILURE', 'DECLINED', 'ERROR', 'REJECTED'].includes(status)) return false;
    if (data.success === true || data.ok === true) return true;
    return ['id', 'refundId', 'refund_id', 'transaction_id'].some((key) => {
        const value = data[key];
        return value !== undefined && value !== null && String(value).trim().length > 0;
    });
};

export const paymentGatewayService = {

    /**
     * Unified payment initiation.
     */
    async initiatePayment(req: PaymentRequest): Promise<PaymentResponse> {
        log.info({ orderId: req.orderId, provider: req.provider, amount: req.amount }, 'Initiating payment');

        try {
            let response: PaymentResponse;

            switch (req.provider) {
                case 'INSTAPAY':
                    response = await this.initiateInstaPay(req);
                    break;
                case 'VODAFONE_CASH':
                    response = await this.initiateVodafoneCash(req);
                    break;
                case 'FAWRY':
                    response = await this.initiateFawry(req);
                    break;
                case 'CASH':
                    response = { success: true, transactionId: `CASH-${Date.now()}`, status: 'SUCCESS' };
                    break;
                default:
                    throw new Error(`Unsupported payment provider: ${req.provider}`);
            }

            // Log attempt to audit
            await createSignedAuditLog({
                eventType: 'PAYMENT_INITIATED',
                userId: 'system',
                branchId: (req as PaymentRequest & { branchId?: string }).branchId || null,
                payload: {
                    orderId: req.orderId,
                    provider: req.provider,
                    amount: req.amount,
                    customerPhoneProvided: Boolean(req.customerPhone),
                    descriptionLength: req.description ? String(req.description).length : 0,
                    response: {
                        success: response.success,
                        status: response.status,
                        transactionIdPresent: Boolean(response.transactionId),
                        referenceCodePresent: Boolean(response.referenceCode),
                    },
                },
            });

            return response;
        } catch (error: any) {
            log.error({ err: error.message, orderId: req.orderId }, 'Payment initiation failed');
            return { success: false, transactionId: 'FAILED', status: 'FAILED', message: error.message };
        }
    },

    /** InstaPay remains unavailable until a verified provider adapter is installed. */
    async initiateInstaPay(req: PaymentRequest): Promise<PaymentResponse> {
        throw new Error(`PAYMENT_PROVIDER_NOT_CONFIGURED: ${req.provider}`);
    },

    /** Vodafone Cash remains unavailable until a verified provider adapter is installed. */
    async initiateVodafoneCash(req: PaymentRequest): Promise<PaymentResponse> {
        if (!req.customerPhone) throw new Error('Customer phone required for Vodafone Cash');
        throw new Error(`PAYMENT_PROVIDER_NOT_CONFIGURED: ${req.provider}`);
    },

    /** Fawry remains unavailable until a verified provider adapter is installed. */
    async initiateFawry(req: PaymentRequest): Promise<PaymentResponse> {
        throw new Error(`PAYMENT_PROVIDER_NOT_CONFIGURED: ${req.provider}`);
    },

    async configureProvider(input: Record<string, any>) {
        const provider = String(input.provider || '').trim().toUpperCase();
        if (provider !== 'PAYMOB' && provider !== 'CARD' && provider !== 'INSTAPAY') {
            throw Object.assign(new Error('PAYMENT_PROVIDER_CONFIGURATION_NOT_SUPPORTED'), { status: 422 });
        }

        const branchId = String(input.branchId || '').trim();
        if (!branchId) throw Object.assign(new Error('BRANCH_ID_REQUIRED'), { status: 400 });

        const branchIds = Array.isArray(input.branchIds) && input.branchIds.length > 0
            ? input.branchIds.map((id: unknown) => String(id || '').trim()).filter(Boolean)
            : [branchId];
        await savePaymobConfig({
            enabled: input.enabled !== false,
            apiKey: input.apiKey,
            cardIntegrationId: input.cardIntegrationId,
            instapayIntegrationId: input.instapayIntegrationId,
            iframeId: input.iframeId,
            hmacSecret: input.hmacSecret,
            baseUrl: input.baseUrl,
            branchIds,
        }, String(input.updatedBy || 'system'));

        await createSignedAuditLog({
            eventType: 'PAYMENT_PROVIDER_CONFIGURED',
            userId: String(input.updatedBy || 'system'),
            branchId,
            payload: {
                provider,
                enabled: input.enabled !== false,
                branchCount: branchIds.length,
                apiKeyProvided: Boolean(input.apiKey),
                hmacSecretProvided: Boolean(input.hmacSecret),
            },
            reason: 'Payment provider configuration updated',
        });
        return { provider: 'PAYMOB', enabled: input.enabled !== false, branchIds };
    },

    async listProviders(branchId: string) {
        const { getPaymobConfigRaw } = await import('../modules/payments/paymobService');
        const paymob = await getPaymobConfigRaw();
        const enabledForBranch = (cfg: { enabled?: boolean; branchIds?: string[] }) =>
            Boolean(cfg.enabled) && (!Array.isArray(cfg.branchIds) || cfg.branchIds.length === 0 || (branchId && cfg.branchIds.includes(branchId)));
        const paymobEnabled = paymob.enabled && enabledForBranch(paymob);
        return [
            {
                provider: 'PAYMOB',
                enabled: paymobEnabled,
                status: paymobEnabled ? 'CONFIGURED' : 'NOT_CONFIGURED',
                methods: [
                    ...(paymob.cardIntegrationId ? ['CARD'] : []),
                    ...(paymob.instapayIntegrationId ? ['INSTAPAY'] : []),
                ],
                capabilities: { checkout: paymobEnabled, webhook: paymobEnabled, refund: paymobEnabled },
            },
            ...(['FAWRY', 'VODAFONE_CASH', 'STRIPE'] as const).map((provider) => ({
                provider,
                enabled: false,
                status: 'ADAPTER_PENDING_VERIFICATION',
                methods: [],
                capabilities: { checkout: false, webhook: false, refund: false },
            })),
        ];
    },

    async createCheckout(input: Record<string, any>): Promise<{ checkoutUrl?: string; [key: string]: any }> {
        const provider = String(input.provider || input.method || 'PAYMOB').toUpperCase();
        const adapter = getGatewayAdapter(provider);
        const result = await adapter.createCheckout({ providerConfig: {}, ...input });
        return { checkoutUrl: result?.iframeUrl || result?.checkoutUrl, ...result };
    },

    async handleWebhook(provider: string, payload: any) {
        const name = String(provider || '').toUpperCase();
        if (name === 'PAYMOB' || name === 'INSTAPAY' || name === 'CARD') {
            const { handleCallback } = await import('../modules/payments/paymobService');
            return handleCallback(payload?.obj ?? payload);
        }
        const adapter = getGatewayAdapter(name);
        const result = await adapter.handleWebhook({ providerConfig: {}, payload });
        if (result.status === 'FAILED') {
            throw Object.assign(new Error(result.failureReason || 'PAYMENT_PROVIDER_WEBHOOK_NOT_CONFIGURED'), { status: 503 });
        }
        return result;
    },

    async refund(sessionId: string, input: { branchId: string; requestedBy: string; requestedByName?: string }) {
        const normalizedSessionId = String(sessionId || '').trim();
        if (!normalizedSessionId) throw Object.assign(new Error('SESSION_ID_REQUIRED'), { status: 400 });
        if (!input?.branchId) throw Object.assign(new Error('BRANCH_ID_REQUIRED'), { status: 400 });
        if (!input?.requestedBy) throw Object.assign(new Error('USER_ID_REQUIRED'), { status: 400 });

        const [session] = await db.select({
            id: paymentSessions.id,
            orderId: paymentSessions.orderId,
            providerType: paymentSessions.providerType,
            status: paymentSessions.status,
            amount: paymentSessions.amount,
            branchId: orders.branchId,
        }).from(paymentSessions)
            .innerJoin(orders, eq(paymentSessions.orderId, orders.id))
            .where(and(eq(paymentSessions.id, normalizedSessionId), eq(orders.branchId, input.branchId)));

        if (!session) throw Object.assign(new Error('PAYMENT_SESSION_NOT_FOUND'), { status: 404 });
        if (!['CONFIRMED', 'COMPLETED', 'SUCCESS'].includes(String(session.status || '').toUpperCase())) {
            throw Object.assign(new Error('PAYMENT_SESSION_NOT_SETTLED'), { status: 409 });
        }
        if (!Number(session.amount) || Number(session.amount) <= 0) {
            throw Object.assign(new Error('PAYMENT_SESSION_AMOUNT_INVALID'), { status: 422 });
        }

        const providerType = String(session.providerType || '').toUpperCase();
        const provider = providerType.includes('INSTA')
            ? 'INSTAPAY'
            : (providerType.includes('PAYMOB') || providerType.includes('CARD') ? 'PAYMOB' : providerType);
        if (!['PAYMOB', 'CARD', 'INSTAPAY'].includes(provider)) {
            throw Object.assign(new Error('PAYMENT_REFUND_PROVIDER_NOT_READY'), { status: 503 });
        }

        // Refunds intentionally enter the existing approval + GL workflow first.
        // No gateway call is made here, preventing an external refund without
        // an approved, auditable internal transaction.
        const request = await refundService.requestRefund({
            orderId: session.orderId,
            type: 'PARTIAL',
            customAmount: Number(session.amount),
            refundMethod: 'ORIGINAL_PAYMENT',
            reason: `Gateway refund request for session ${normalizedSessionId}`,
            reasonCategory: 'CUSTOMER_REQUEST',
            requestedBy: input.requestedBy,
            requestedByName: input.requestedByName || input.requestedBy,
            branchId: input.branchId,
            requireApproval: true,
            gatewaySessionId: normalizedSessionId,
        });

        await createSignedAuditLog({
            eventType: 'PAYMENT_REFUND_REQUESTED',
            userId: input.requestedBy,
            branchId: input.branchId,
            payload: { sessionId: normalizedSessionId, orderId: session.orderId, provider, refundRequestId: request.id },
        });

        return {
            success: true,
            status: request.status === 'PROCESSED' ? 'PROCESSED' : 'PENDING_APPROVAL',
            refundRequestId: request.id,
            externalRefundPending: request.status !== 'PROCESSED',
            message: request.status === 'PROCESSED'
                ? 'Refund processed through the internal refund workflow'
                : 'Refund request created and awaiting approval',
        };
    },

    async processApprovedRefund(refundId: string, input: { branchId: string; processedBy: string }) {
        const refund = await refundService.getRefundById(refundId);
        if (!refund) throw Object.assign(new Error('Refund not found'), { status: 404 });
        if (refund.branchId !== input.branchId) throw Object.assign(new Error('FORBIDDEN_BRANCH_ACCESS'), { status: 403 });
        if (refund.status === 'PROCESSED') return refund;
        if (refund.status !== 'APPROVED') throw Object.assign(new Error('Refund is not approved'), { status: 409 });
        if (refund.refundMethod !== 'ORIGINAL_PAYMENT') {
            return refundService.processRefund(refundId, input.processedBy, input.branchId);
        }

        if (refund.gatewayRefundStatus !== 'SUCCEEDED') {
            const [session] = await db.select({
                id: paymentSessions.id,
                providerType: paymentSessions.providerType,
                status: paymentSessions.status,
                orderId: paymentSessions.orderId,
            }).from(paymentSessions)
                .innerJoin(orders, eq(paymentSessions.orderId, orders.id))
                .where(and(eq(paymentSessions.orderId, refund.orderId), eq(orders.branchId, input.branchId)))
                .orderBy(desc(paymentSessions.createdAt)).top(1);
            if (!session) throw Object.assign(new Error('PAYMENT_SESSION_NOT_FOUND'), { status: 404 });
            if (!['CONFIRMED', 'COMPLETED', 'SUCCESS'].includes(String(session.status || '').toUpperCase())) {
                throw Object.assign(new Error('PAYMENT_SESSION_NOT_SETTLED'), { status: 409 });
            }

            const paymentCandidates = await db.select({
                id: payments.id,
                referenceNumber: payments.referenceNumber,
                method: payments.method,
                status: payments.status,
            }).from(payments)
                .where(and(eq(payments.orderId, refund.orderId), eq(payments.status, 'COMPLETED'), ne(payments.method, 'REFUND')))
                .orderBy(desc(payments.createdAt));
            const payment = paymentCandidates.find(candidate => String(candidate.referenceNumber || '').trim());
            const transactionId = String(payment?.referenceNumber || '').trim();
            if (!transactionId) throw Object.assign(new Error('GATEWAY_TRANSACTION_REFERENCE_MISSING'), { status: 409 });

            const providerType = String(session.providerType || payment?.method || '').toUpperCase();
            const provider = providerType.includes('INSTA') ? 'INSTAPAY' : (providerType.includes('CARD') || providerType.includes('VISA') ? 'CARD' : 'PAYMOB');
            const adapter = getGatewayAdapter(provider);
            const [claimedPayment] = await db.update(payments)
                .set({ status: 'REFUND_PROCESSING' })
                .where(and(eq(payments.id, payment.id), eq(payments.status, 'COMPLETED')))
                .output();
            if (!claimedPayment) {
                throw Object.assign(new Error('GATEWAY_REFUND_ALREADY_PROCESSING_OR_RECONCILIATION_REQUIRED'), { status: 409 });
            }
            await db.update(paymentSessions)
                .set({ status: 'refund_processing', updatedAt: new Date() })
                .where(eq(paymentSessions.id, session.id));
            let gatewayResult: any;
            try {
                gatewayResult = await adapter.refund({
                    providerConfig: {},
                    transactionId,
                    amountCents: Math.round(Number(refund.refundAmount) * 100),
                    orderId: refund.orderId,
                    refundId: refund.id,
                });
                if (!isSuccessfulGatewayRefundResult(gatewayResult)) {
                    throw new Error('PAYMENT_GATEWAY_REFUND_UNCONFIRMED');
                }
            } catch (error: any) {
                await db.update(payments).set({ status: 'COMPLETED' }).where(eq(payments.id, payment.id));
                await db.update(paymentSessions)
                    .set({ status: 'confirmed', updatedAt: new Date() })
                    .where(eq(paymentSessions.id, session.id));
                throw Object.assign(new Error(error?.message || 'PAYMENT_GATEWAY_REFUND_FAILED'), { status: 502 });
            }
            await refundService.markGatewayRefundSucceeded({
                refundId: refund.id,
                provider,
                transactionId,
                gatewayRefundId: gatewayResult?.id || gatewayResult?.refundId,
                updatedBy: input.processedBy,
            });
            await db.update(payments).set({ status: 'REFUNDED' }).where(eq(payments.id, payment.id));
            await db.update(paymentSessions)
                .set({ status: 'refunded', updatedAt: new Date() })
                .where(eq(paymentSessions.id, session.id));
        }

        if (refund.gatewaySessionId && refund.gatewayRefundStatus === 'SUCCEEDED') {
            await db.update(paymentSessions)
                .set({ status: 'refunded', updatedAt: new Date() })
                .where(eq(paymentSessions.id, refund.gatewaySessionId));
        }

        return refundService.processRefund(refundId, input.processedBy, input.branchId);
    },

    async listSessions(branchId: string) {
        const normalizedBranchId = String(branchId || '').trim();
        if (!normalizedBranchId) throw Object.assign(new Error('BRANCH_ID_REQUIRED'), { status: 400 });
        return db.select({
            id: paymentSessions.id,
            orderId: paymentSessions.orderId,
            providerType: paymentSessions.providerType,
            status: paymentSessions.status,
            amount: paymentSessions.amount,
            currency: paymentSessions.currency,
            verified: paymentSessions.verified,
            externalReference: paymentSessions.externalReference,
            deviceId: paymentSessions.deviceId,
            createdBy: paymentSessions.createdBy,
            createdAt: paymentSessions.createdAt,
            updatedAt: paymentSessions.updatedAt,
            branchId: orders.branchId,
        }).from(paymentSessions)
            .innerJoin(orders, eq(paymentSessions.orderId, orders.id))
            .where(eq(orders.branchId, normalizedBranchId))
            .orderBy(desc(paymentSessions.createdAt))
            .offset(0).fetch(200);
    },

    /**
     * Handle Webhook Verification from gateway
     */
    async handleGatewayWebhook(provider: PaymentProvider, payload: any) {
         // Never report success for a provider whose adapter has not been
         // implemented. A silent no-op would leave the checkout and ledger in
         // contradictory states while appearing healthy to the caller.
         log.warn({ provider, hasPayload: Boolean(payload) }, 'Payment gateway webhook adapter is not configured');
         throw Object.assign(new Error('PAYMENT_PROVIDER_WEBHOOK_NOT_CONFIGURED'), { status: 503 });
    }
};
