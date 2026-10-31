import { describe, expect, it } from 'vitest';
import { fawryAdapter } from '../server/gateway-adapters/fawryAdapter';
import { stripeAdapter } from '../server/gateway-adapters/stripeAdapter';
import { vodafoneCashAdapter } from '../server/gateway-adapters/vodafoneCashAdapter';

const pendingAdapters = [fawryAdapter, stripeAdapter, vodafoneCashAdapter];

describe('gateway adapter contract', () => {
    it('requires every adapter operation and an explicit human-readable name', () => {
        for (const adapter of pendingAdapters) {
            expect(adapter.name).toBeTruthy();
            expect(typeof adapter.createCheckout).toBe('function');
            expect(typeof adapter.handleWebhook).toBe('function');
            expect(typeof adapter.refund).toBe('function');
        }
    });

    it('fails closed when credentials are missing instead of claiming checkout success', async () => {
        await expect(fawryAdapter.createCheckout({ providerConfig: {} })).rejects.toMatchObject({ code: 'FAWRY_NOT_CONFIGURED' });
        await expect(stripeAdapter.createCheckout({ providerConfig: {} })).rejects.toMatchObject({ code: 'STRIPE_NOT_CONFIGURED' });
        await expect(vodafoneCashAdapter.createCheckout({ providerConfig: {} })).rejects.toMatchObject({ code: 'VODAFONE_CASH_NOT_CONFIGURED' });
    });

    it('keeps configured-but-unverified adapters explicitly pending', async () => {
        await expect(fawryAdapter.createCheckout({ providerConfig: { merchantId: 'configured' } }))
            .rejects.toMatchObject({ code: 'FAWRY_ADAPTER_PENDING_VERIFICATION' });
        await expect(stripeAdapter.createCheckout({ providerConfig: { secretKey: 'configured' } }))
            .rejects.toMatchObject({ code: 'STRIPE_ADAPTER_PENDING_VERIFICATION' });
        await expect(vodafoneCashAdapter.createCheckout({ providerConfig: { apiKey: 'configured' } }))
            .rejects.toMatchObject({ code: 'VODAFONE_CASH_ADAPTER_PENDING_VERIFICATION' });
    });
});
