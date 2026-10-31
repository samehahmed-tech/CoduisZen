import { describe, expect, it, vi } from 'vitest';

// Adapter imports are intentionally tested without opening a database connection.
vi.mock('../server/db', () => ({ db: {} }));

import { paymobAdapter } from '../server/gateway-adapters/paymobAdapter';
import { instaPayAdapter } from '../server/gateway-adapters/instaPayAdapter';

describe('Paymob-backed gateway adapter contract', () => {
    it('exposes the complete adapter surface', () => {
        for (const adapter of [paymobAdapter, instaPayAdapter]) {
            expect(adapter.name).toBeTruthy();
            expect(typeof adapter.createCheckout).toBe('function');
            expect(typeof adapter.handleWebhook).toBe('function');
            expect(typeof adapter.refund).toBe('function');
        }
    });

    it('fails closed when Paymob is disabled or not configured', async () => {
        await expect(paymobAdapter.createCheckout({ amount: 10, orderId: 'o1', providerConfig: {} }))
            .rejects.toMatchObject({ message: 'PAYMOB_DISABLED' });
        await expect(instaPayAdapter.createCheckout({ amount: 10, orderId: 'o1', providerConfig: {} }))
            .rejects.toMatchObject({ message: 'PAYMOB_DISABLED' });
    });
});
