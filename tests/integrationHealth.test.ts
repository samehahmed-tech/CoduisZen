import { describe, expect, it, vi } from 'vitest';
import { summarizeAggregatorProviderHealth, summarizePaymentProviderHealth } from '../server/services/integrationHealth';
import { probePaymobConnectivity } from '../server/utils/paymobHealthProbe';

describe('integration provider health contract', () => {
    it('returns capability/status summaries without provider secrets', () => {
        const payments = summarizePaymentProviderHealth([
            { provider: 'PAYMOB', status: 'CONFIGURED', enabled: true, capabilities: { checkout: true, refund: true } },
            { provider: 'FAWRY', status: 'ADAPTER_PENDING_VERIFICATION', enabled: false, capabilities: { checkout: false } },
        ]);
        const aggregators = summarizeAggregatorProviderHealth({
            talabat: { enabled: true, webhookSecret: 'do-not-return' },
            elmenus: { enabled: false, basicPassword: 'do-not-return' },
        });

        expect(payments).toMatchObject([
            { provider: 'PAYMOB', status: 'CONFIGURED', configured: true },
            { provider: 'FAWRY', status: 'ADAPTER_PENDING', configured: false },
        ]);
        expect(aggregators).toMatchObject([
            { provider: 'talabat', status: 'CONFIGURED', configured: true },
            { provider: 'elmenus', status: 'DISABLED', configured: false },
        ]);
        expect(JSON.stringify(aggregators)).not.toContain('do-not-return');
    });

    it('does not call a pending adapter healthy', () => {
        const [summary] = summarizePaymentProviderHealth([{ provider: 'STRIPE', status: 'ADAPTER_PENDING_VERIFICATION' }]);
        expect(summary.status).toBe('ADAPTER_PENDING');
        expect(summary.configured).toBe(false);
    });

    it('probes Paymob auth without exposing credentials or creating a payment', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ token: 'opaque-token' }),
        } as Response);
        const result = await probePaymobConnectivity({ enabled: true, apiKey: 'secret', baseUrl: 'https://probe.invalid/api' });
        expect(result.connectivity).toBe('HEALTHY');
        expect(fetchMock).toHaveBeenCalledWith('https://probe.invalid/api/auth/tokens', expect.objectContaining({ method: 'POST' }));
        expect(JSON.stringify(result)).not.toContain('secret');
        fetchMock.mockRestore();
    });
});
