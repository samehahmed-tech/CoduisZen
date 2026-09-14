/**
 * InstaPay Adapter (scaffold) — P1 Financial Backbone
 *
 * InstaPay does not expose a public merchant API in Egypt (2026); the common
 * commercial route is through a bank aggregator (e.g. Paymob's InstaPay
 * acceptance, or FIB/Khazna). This adapter is wired to that aggregation
 * path: once an aggregator key is configured, checkouts go through the
 * aggregator's InstaPay acceptance flow; otherwise it refuses checkouts.
 */

import type { GatewayAdapter } from '../services/paymentGatewayService';

export const instaPayAdapter: GatewayAdapter = {
    name: 'InstaPay',

    async createCheckout(input) {
        const apiKey = String(input.providerConfig.apiKey || '');
        if (!apiKey) {
            throw Object.assign(new Error('INSTAPAY_NOT_CONFIGURED'), { code: 'INSTAPAY_NOT_CONFIGURED' });
        }
        throw Object.assign(new Error('INSTAPAY_ADAPTER_PENDING_VERIFICATION'), { code: 'INSTAPAY_ADAPTER_PENDING_VERIFICATION' });
    },

    async handleWebhook(input) {
        return { status: 'FAILED' as const, failureReason: 'INSTAPAY_NOT_CONFIGURED' };
    },

    async refund(input) {
        const apiKey = String(input.providerConfig.apiKey || '');
        if (!apiKey) {
            throw Object.assign(new Error('INSTAPAY_NOT_CONFIGURED'), { code: 'INSTAPAY_NOT_CONFIGURED' });
        }
        throw Object.assign(new Error('INSTAPAY_ADAPTER_PENDING_VERIFICATION'), { code: 'INSTAPAY_ADAPTER_PENDING_VERIFICATION' });
    },
};

export default instaPayAdapter;
