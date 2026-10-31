import { describe, expect, it, vi } from 'vitest';
import { decryptPaymentCheckoutUrl, encryptPaymentCheckoutUrl } from '../server/utils/paymentSessionCrypto';

describe('payment checkout URL encryption', () => {
    it('round-trips without persisting the clear URL', () => {
        vi.stubEnv('PAYMENT_TOKEN_SECRET', 'payment-test-secret');
        const url = 'https://accept.paymob.com/acceptance/iframes/123?payment_token=secret-token';
        const encrypted = encryptPaymentCheckoutUrl(url);
        expect(encrypted).not.toContain('payment_token=secret-token');
        expect(decryptPaymentCheckoutUrl(encrypted)).toBe(url);
        expect(decryptPaymentCheckoutUrl(`${encrypted}tampered`)).toBeNull();
        vi.unstubAllEnvs();
    });

    it('does not decrypt without a configured key', () => {
        vi.stubEnv('PAYMENT_TOKEN_SECRET', '');
        vi.stubEnv('JWT_SECRET', '');
        expect(decryptPaymentCheckoutUrl('v1.invalid.invalid.invalid')).toBeNull();
        vi.unstubAllEnvs();
    });

    it('decrypts existing ciphertext with the previous key during rotation', () => {
        vi.stubEnv('PAYMENT_TOKEN_SECRET', 'payment-old-secret');
        vi.stubEnv('PAYMENT_TOKEN_SECRET_PREVIOUS', '');
        const encrypted = encryptPaymentCheckoutUrl('https://pay.example/checkout?id=1');
        vi.stubEnv('PAYMENT_TOKEN_SECRET', 'payment-new-secret');
        vi.stubEnv('PAYMENT_TOKEN_SECRET_PREVIOUS', 'payment-old-secret');
        expect(decryptPaymentCheckoutUrl(encrypted)).toBe('https://pay.example/checkout?id=1');
        vi.unstubAllEnvs();
    });
});
