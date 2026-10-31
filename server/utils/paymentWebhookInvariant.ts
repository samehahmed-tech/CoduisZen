export type PaymentWebhookStatus = 'COMPLETED' | 'PENDING' | 'FAILED';

export type PaymentWebhookDecision = {
    status: PaymentWebhookStatus;
    accepted: boolean;
    reason?: 'AMOUNT_MISMATCH' | 'TERMINAL_REPLAY';
};

/**
 * Makes gateway callbacks monotonic and amount-safe before persistence.
 * A completed payment can never be downgraded by a later callback.
 */
export const decidePaymentWebhookStatus = (input: {
    currentStatus?: string | null;
    success: boolean;
    expectedAmountCents?: number | null;
    receivedAmountCents?: number | null;
}): PaymentWebhookDecision => {
    if (input.currentStatus === 'COMPLETED') {
        return { status: 'COMPLETED', accepted: true, reason: 'TERMINAL_REPLAY' };
    }

    if (
        input.success
        && input.expectedAmountCents !== undefined
        && input.expectedAmountCents !== null
        && input.receivedAmountCents !== undefined
        && input.receivedAmountCents !== null
        && input.expectedAmountCents !== input.receivedAmountCents
    ) {
        return { status: 'PENDING', accepted: false, reason: 'AMOUNT_MISMATCH' };
    }

    return { status: input.success ? 'COMPLETED' : 'FAILED', accepted: true };
};
