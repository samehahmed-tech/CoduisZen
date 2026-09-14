/**
 * Fawry Adapter (scaffold) — P1 Financial Backbone
 *
 * Real integration steps once credentials are configured:
 * 1. POST /eCommerceApi/v2/CheckoutAPI/order/createCharge → get
 *    merchantChargeId (customer pays at any Fawry outlet / online)
 * 2. Webhook (merchantOrderStatusChange) verified via sha256
 *    (merchantCode + orderId + merchantRefNumber + chargeStatusCode +
 *    securityKey), then the session is marked SUCCESS.
 * Until then, the adapter refuses checkouts with a configuration error.
 */

import type { GatewayAdapter } from '../services/paymentGatewayService';

export const fawryAdapter: GatewayAdapter = {
    name: 'Fawry',

    async createCheckout(input) {
        const merchantId = String(input.providerConfig.merchantId || '');
        if (!merchantId) {
            throw Object.assign(new Error('FAWRY_NOT_CONFIGURED'), { code: 'FAWRY_NOT_CONFIGURED' });
        }
        throw Object.assign(new Error('FAWRY_ADAPTER_PENDING_VERIFICATION'), { code: 'FAWRY_ADAPTER_PENDING_VERIFICATION' });
    },

    async handleWebhook(input) {
        return { status: 'FAILED' as const, failureReason: 'FAWRY_NOT_CONFIGURED' };
    },

    async refund(input) {
        const merchantId = String(input.providerConfig.merchantId || '');
        if (!merchantId) {
            throw Object.assign(new Error('FAWRY_NOT_CONFIGURED'), { code: 'FAWRY_NOT_CONFIGURED' });
        }
        throw Object.assign(new Error('FAWRY_ADAPTER_PENDING_VERIFICATION'), { code: 'FAWRY_ADAPTER_PENDING_VERIFICATION' });
    },
};

export default fawryAdapter;
