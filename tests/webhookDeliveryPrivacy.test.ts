import { describe, expect, it } from 'vitest';
import { sanitizeWebhookDelivery } from '../server/utils/webhookDeliveryPrivacy';

describe('webhook delivery privacy', () => {
    it('redacts credentials and customer/payment identifiers from delivery history', () => {
        const safe = sanitizeWebhookDelivery({
            payload: {
                orderId: 'order-1',
                customerPhone: '+201000000000',
                customerEmail: 'customer@example.com',
                payment: { cardPan: '4111111111111111', token: 'gateway-token' },
            },
            responseBody: JSON.stringify({ authorization: 'Bearer secret', ok: true }),
            lastError: 'email=customer@example.com token=secret',
        });

        expect(safe.payload).toMatchObject({
            orderId: 'order-1',
            customerPhone: '[REDACTED]',
            customerEmail: '[REDACTED]',
            payment: { cardPan: '[REDACTED]', token: '[REDACTED]' },
        });
        expect(safe.responseBody).toContain('authorization');
        expect(safe.responseBody).toContain('[REDACTED]');
        expect(safe.lastError).toBe('email=[REDACTED] token=[REDACTED]');
    });
});
