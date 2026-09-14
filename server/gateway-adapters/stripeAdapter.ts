/**
 * Stripe Adapter (scaffold) — P1 Financial Backbone
 *
 * Real integration steps once keys are configured:
 * 1. Create Stripe client with secret key
 * 2. POST /v1/payment_intents (or Checkout Session) → redirect URL
 * 3. Webhook: Stripe-Signature header verified with endpoint signing
 *    secret; session completed on payment_intent.succeeded, refunded on
 *    charge.refunded.
 * Until then, the adapter refuses checkouts with a configuration error.
 */

import type { GatewayAdapter } from '../services/paymentGatewayService';

export const stripeAdapter: GatewayAdapter = {
    name: 'Stripe',

    async createCheckout(input) {
        const secretKey = String(input.providerConfig.secretKey || '');
        if (!secretKey) {
            throw Object.assign(new Error('STRIPE_NOT_CONFIGURED'), { code: 'STRIPE_NOT_CONFIGURED' });
        }
        throw Object.assign(new Error('STRIPE_ADAPTER_PENDING_VERIFICATION'), { code: 'STRIPE_ADAPTER_PENDING_VERIFICATION' });
    },

    async handleWebhook(input) {
        return { status: 'FAILED' as const, failureReason: 'STRIPE_NOT_CONFIGURED' };
    },

    async refund(input) {
        const secretKey = String(input.providerConfig.secretKey || '');
        if (!secretKey) {
            throw Object.assign(new Error('STRIPE_NOT_CONFIGURED'), { code: 'STRIPE_NOT_CONFIGURED' });
        }
        throw Object.assign(new Error('STRIPE_ADAPTER_PENDING_VERIFICATION'), { code: 'STRIPE_ADAPTER_PENDING_VERIFICATION' });
    },
};

export default stripeAdapter;
