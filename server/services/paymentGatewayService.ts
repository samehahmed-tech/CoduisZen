/**
 * Payment Gateway Integration Framework
 * Implements: Phase 2.9 (Egypt Localized Payments)
 * 
 * Provides a unified interface for InstaPay, Vodafone Cash, and Fawry integrations.
 */

import { db } from '../db';
import { payments, auditLogs } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import logger from '../utils/logger';

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
            await db.insert(auditLogs).values({
                eventType: 'PAYMENT_INITIATED',
                userId: 'system',
                payload: { ...req, response },
                createdAt: new Date(),
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

    async configureProvider(_input: Record<string, any>) {
        throw new Error('PAYMENT_PROVIDER_CONFIGURATION_NOT_IMPLEMENTED');
    },

    async listProviders(branchId: string) {
        const { getPaymobConfigRaw } = await import('../modules/payments/paymobService');
        const paymob = await getPaymobConfigRaw();
        const enabledForBranch = (cfg: { enabled?: boolean; branchIds?: string[] }) =>
            Boolean(cfg.enabled) && (!Array.isArray(cfg.branchIds) || cfg.branchIds.length === 0 || (branchId && cfg.branchIds.includes(branchId)));
        const out: Array<{ provider: string; enabled: boolean; methods: string[] }> = [];
        if (paymob.enabled) {
            out.push({
                provider: 'PAYMOB',
                enabled: enabledForBranch(paymob),
                methods: [
                    ...(paymob.cardIntegrationId ? ['CARD'] : []),
                    ...(paymob.instapayIntegrationId ? ['INSTAPAY'] : []),
                ],
            });
        }
        return out;
    },

    async createCheckout(input: Record<string, any>): Promise<{ checkoutUrl?: string; [key: string]: any }> {
        const provider = String(input.provider || input.method || 'PAYMOB').toUpperCase();
        if (provider === 'PAYMOB' || provider === 'CARD') {
            const { paymobAdapter } = await import('../gateway-adapters/paymobAdapter');
            const intention = await paymobAdapter.createCheckout(input);
            return { checkoutUrl: intention.iframeUrl, ...intention };
        }
        if (provider === 'INSTAPAY') {
            const { instaPayAdapter } = await import('../gateway-adapters/instaPayAdapter');
            const intention = await instaPayAdapter.createCheckout(input);
            return { checkoutUrl: intention.iframeUrl, ...intention };
        }
        throw new Error(`Unsupported payment provider: ${provider}`);
    },

    async handleWebhook(provider: string, payload: any) {
        const name = String(provider || '').toUpperCase();
        if (name === 'PAYMOB' || name === 'INSTAPAY' || name === 'CARD') {
            const { handleCallback } = await import('../modules/payments/paymobService');
            return handleCallback(payload?.obj ?? payload);
        }
        return this.handleGatewayWebhook(provider as PaymentProvider, payload);
    },

    async refund(_sessionId: string) {
        throw new Error('PAYMENT_REFUND_NOT_IMPLEMENTED');
    },

    async listSessions(_branchId: string) {
        return [];
    },

    /**
     * Handle Webhook Verification from gateway
     */
    async handleGatewayWebhook(provider: PaymentProvider, payload: any) {
         // Logical entry point for gateway callbacks (Fawry payment successful, etc.)
         log.info({ provider }, 'Processing gateway callback');
         // We would update the payments table here
    }
};
