import { describe, expect, it } from 'vitest';
import { getRetryPolicy, isPaymentWebhookLeaseExpired, PAYMENT_WEBHOOK_LEASE_MS } from '../server/utils/retryPolicy';

describe('payment webhook retry policy', () => {
    it('uses exponential backoff and skips before eligibility', () => {
        const lastAttempt = new Date('2026-01-01T00:00:00.000Z');
        expect(getRetryPolicy(0, lastAttempt, lastAttempt.getTime() + 30_000)).toMatchObject({
            eligible: false,
            nextAttempt: 1,
            backoffMinutes: 1,
        });
        expect(getRetryPolicy(0, lastAttempt, lastAttempt.getTime() + 60_000).eligible).toBe(true);
    });

    it('moves to dead letter after the fifth attempt', () => {
        expect(getRetryPolicy(5, new Date('2026-01-01T00:00:00.000Z'), Date.now())).toMatchObject({
            exhausted: true,
            eligible: false,
            nextAttempt: 6,
        });
    });

    it('expires a worker lease after the recovery window', () => {
        const leasedAt = new Date('2026-01-01T00:00:00.000Z');
        expect(isPaymentWebhookLeaseExpired(leasedAt, leasedAt.getTime() + PAYMENT_WEBHOOK_LEASE_MS - 1)).toBe(false);
        expect(isPaymentWebhookLeaseExpired(leasedAt, leasedAt.getTime() + PAYMENT_WEBHOOK_LEASE_MS)).toBe(true);
        expect(isPaymentWebhookLeaseExpired(undefined)).toBe(true);
    });
});
