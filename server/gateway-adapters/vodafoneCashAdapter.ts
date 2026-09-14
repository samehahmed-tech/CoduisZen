/**
 * Vodafone Cash (V-Cash) Adapter (scaffold) — P1 Financial Backbone
 *
 * V-Cash merchant APIs are exposed via a bank aggregator (e.g. Paymob
 * acceptance or a PSP acting on behalf of VF Cash). This adapter is wired
 * to that path: once an aggregator key is configured, checkouts use the
 * aggregator's V-Cash acceptance; otherwise it refuses checkouts.
 */

import type { GatewayAdapter } from '../services/paymentGatewayService';

export const vodafoneCashAdapter: GatewayAdapter = {
    name: 'Vodafone Cash',

    async createCheckout(input) {
        const apiKey = String(input.providerConfig.apiKey || '');
        if (!apiKey) {
            throw Object.assign(new Error('VODAFONE_CASH_NOT_CONFIGURED'), { code: 'VODAFONE_CASH_NOT_CONFIGURED' });
        }
        throw Object.assign(new Error('VODAFONE_CASH_ADAPTER_PENDING_VERIFICATION'), { code: 'VODAFONE_CASH_ADAPTER_PENDING_VERIFICATION' });
    },

    async handleWebhook(input) {
        return { status: 'FAILED' as const, failureReason: 'VODAFONE_CASH_NOT_CONFIGURED' };
    },

    async refund(input) {
        const apiKey = String(input.providerConfig.apiKey || '');
        if (!apiKey) {
            throw Object.assign(new Error('VODAFONE_CASH_NOT_CONFIGURED'), { code: 'VODAFONE_CASH_NOT_CONFIGURED' });
        }
        throw Object.assign(new Error('VODAFONE_CASH_ADAPTER_PENDING_VERIFICATION'), { code: 'VODAFONE_CASH_ADAPTER_PENDING_VERIFICATION' });
    },
};

export default vodafoneCashAdapter;
