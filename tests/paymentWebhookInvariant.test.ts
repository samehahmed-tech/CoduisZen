import { describe, expect, it } from 'vitest';
import { decidePaymentWebhookStatus } from '../server/utils/paymentWebhookInvariant';

describe('payment webhook invariants', () => {
    it('keeps completed payments terminal on replay', () => {
        expect(decidePaymentWebhookStatus({
            currentStatus: 'COMPLETED',
            success: false,
            expectedAmountCents: 1000,
            receivedAmountCents: 1,
        })).toEqual({ status: 'COMPLETED', accepted: true, reason: 'TERMINAL_REPLAY' });
    });

    it('does not complete a callback with a mismatched amount', () => {
        expect(decidePaymentWebhookStatus({
            currentStatus: 'PENDING',
            success: true,
            expectedAmountCents: 1000,
            receivedAmountCents: 999,
        })).toEqual({ status: 'PENDING', accepted: false, reason: 'AMOUNT_MISMATCH' });
    });

    it('maps valid success and failure callbacks', () => {
        expect(decidePaymentWebhookStatus({ success: true, expectedAmountCents: 1000, receivedAmountCents: 1000 }))
            .toEqual({ status: 'COMPLETED', accepted: true });
        expect(decidePaymentWebhookStatus({ success: false })).toEqual({ status: 'FAILED', accepted: true });
    });
});
