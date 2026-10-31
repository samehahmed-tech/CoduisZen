import { describe, expect, it, vi } from 'vitest';

vi.mock('../server/db', () => ({ db: {} }));

import { isSuccessfulGatewayRefundResult, paymentGatewayService } from '../server/services/paymentGatewayService';
import { fawryAdapter } from '../server/gateway-adapters/fawryAdapter';
import { vodafoneCashAdapter } from '../server/gateway-adapters/vodafoneCashAdapter';
import { stripeAdapter } from '../server/gateway-adapters/stripeAdapter';

describe('payment gateway adapter contract', () => {
    it('fails closed for unverified Fawry, Vodafone Cash, and Stripe adapters', async () => {
        await expect(fawryAdapter.createCheckout({ providerConfig: {}, amount: 10 })).rejects.toMatchObject({
            code: 'FAWRY_NOT_CONFIGURED',
        });
        await expect(vodafoneCashAdapter.createCheckout({ providerConfig: {}, amount: 10 })).rejects.toMatchObject({
            code: 'VODAFONE_CASH_NOT_CONFIGURED',
        });
        await expect(stripeAdapter.createCheckout({ providerConfig: {}, amount: 10 })).rejects.toMatchObject({
            code: 'STRIPE_NOT_CONFIGURED',
        });
    });

    it('routes checkout and webhook calls through the adapter registry without false success', async () => {
        await expect(paymentGatewayService.createCheckout({ provider: 'FAWRY', amount: 10 }))
            .rejects.toMatchObject({ code: 'FAWRY_NOT_CONFIGURED' });
        await expect(paymentGatewayService.handleWebhook('FAWRY', { id: 'webhook-1' }))
            .rejects.toMatchObject({ status: 503 });
    });

    it('fails closed when a provider returns an ambiguous or negative refund response', () => {
        expect(isSuccessfulGatewayRefundResult({ success: false, id: 'provider-refund-1' })).toBe(false);
        expect(isSuccessfulGatewayRefundResult({ status: 'FAILED', id: 'provider-refund-2' })).toBe(false);
        expect(isSuccessfulGatewayRefundResult({})).toBe(false);
        expect(isSuccessfulGatewayRefundResult({ id: 'provider-refund-3' })).toBe(true);
        expect(isSuccessfulGatewayRefundResult({ success: true })).toBe(true);
    });
});
