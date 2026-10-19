/**
 * Paymob Adapter — delegates to the settings-driven paymobService.
 * Single source of truth is the `paymob_config` settings key.
 */
import type { GatewayAdapter } from '../services/paymentGatewayService';
import { createIntention, handleCallback, refundTransaction } from '../modules/payments/paymobService';

export const paymobAdapter: GatewayAdapter = {
    name: 'Paymob',

    async createCheckout(input) {
        return createIntention({
            amount: Number(input.amount),
            currency: input.currency || 'EGP',
            merchantOrderId: input.merchantOrderId || input.orderId,
            billing: input.billing,
            method: 'CARD',
            branchId: input.branchId,
        });
    },

    async handleWebhook(input) {
        const result = await handleCallback(input.payload ?? input);
        return result.verified && result.success
            ? { status: 'SUCCESS' as const }
            : { status: 'FAILED' as const, failureReason: result.verified ? 'PAYMOB_DECLINED' : 'PAYMOB_BAD_HMAC' };
    },

    async refund(input) {
        return refundTransaction(input.transactionId, input.amountCents);
    },
};

export default paymobAdapter;
