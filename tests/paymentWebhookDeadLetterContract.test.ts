import { describe, expect, it } from 'vitest';
import { summarizePaymentWebhookDeadLetter } from '../server/utils/paymentWebhookDeadLetter';

describe('payment webhook dead-letter contract', () => {
    it('exposes operational metadata without replay payload or secrets', () => {
        const summary = summarizePaymentWebhookDeadLetter({
            id: 'event-1',
            branchId: 'branch-1',
            createdAt: new Date('2026-01-01T00:00:00Z'),
            payload: {
                provider: 'paymob',
                retryCount: 5,
                lastError: 'x'.repeat(500),
                callback: { cardToken: 'must-not-leak' },
            },
        });
        expect(summary).toMatchObject({ id: 'event-1', provider: 'paymob', branchId: 'branch-1', retryCount: 5 });
        expect(summary.lastError).toHaveLength(300);
        expect(summary).not.toHaveProperty('callback');
        expect(summary).not.toHaveProperty('cardToken');
    });
});
