/**
 * Paymob Adapter (scaffold) — P1 Financial Backbone
 *
 * Real integration steps once an API key is configured:
 * 1. POST /v1/authentication/tokens → get JWT
 * 2. POST /v2/ecommerce/orders → register order
 * 3. POST /v2/acceptance/payment_keys/joins → get payment_key
 * 4. POST /v2/iframe → POST payment_key, receive redirect page URL
 * Webhooks: HmacSHA512(secret, obj.id,obj.amount_cents,...) verified against
 * HMAC header before completing the session.
 * Until then, the adapter refuses checkouts with a configuration error.
 */

import type { GatewayAdapter } from '../services/paymentGatewayService';

export const paymobAdapter: GatewayAdapter = {
    name: 'Paymob',

    async createCheckout(input) {
        const apiKey = String(input.providerConfig.apiKey || '');
        if (!apiKey) {
            throw Object.assign(new Error('PAYMOB_NOT_CONFIGURED'), { code: 'PAYMOB_NOT_CONFIGURED' });
        }
        throw Object.assign(new Error('PAYMOB_ADAPTER_PENDING_VERIFICATION'), { code: 'PAYMOB_ADAPTER_PENDING_VERIFICATION' });
    },

    async handleWebhook(input) {
        return { status: 'FAILED' as const, failureReason: 'PAYMOB_NOT_CONFIGURED' };
    },

    async refund(input) {
        const apiKey = String(input.providerConfig.apiKey || '');
        if (!apiKey) {
            throw Object.assign(new Error('PAYMOB_NOT_CONFIGURED'), { code: 'PAYMOB_NOT_CONFIGURED' });
        }
        throw Object.assign(new Error('PAYMOB_ADAPTER_PENDING_VERIFICATION'), { code: 'PAYMOB_ADAPTER_PENDING_VERIFICATION' });
    },
};

export default paymobAdapter;
