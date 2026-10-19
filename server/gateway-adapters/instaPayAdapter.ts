/**
 * InstaPay Adapter — no public merchant API exists, so InstaPay acceptance
 * runs through the Paymob account's InstaPay integration id.
 * Requires Paymob enabled + instapayIntegrationId configured.
 */
import type { GatewayAdapter } from '../services/paymentGatewayService';
import { createIntention, handleCallback } from '../modules/payments/paymobService';

export const instaPayAdapter: GatewayAdapter = {
    name: 'InstaPay',

    async createCheckout(input) {
        return createIntention({
            amount: Number(input.amount),
            currency: input.currency || 'EGP',
            merchantOrderId: input.merchantOrderId || input.orderId,
            billing: input.billing,
            method: 'INSTAPAY',
            branchId: input.branchId,
        });
    },

    async handleWebhook(input) {
        const result = await handleCallback(input.payload ?? input);
        return result.verified && result.success
            ? { status: 'SUCCESS' as const }
            : { status: 'FAILED' as const, failureReason: result.verified ? 'INSTAPAY_DECLINED' : 'INSTAPAY_BAD_HMAC' };
    },

    async refund(input) {
        const { refundTransaction } = await import('../modules/payments/paymobService');
        return refundTransaction(input.transactionId, input.amountCents);
    },
};

export default instaPayAdapter;
