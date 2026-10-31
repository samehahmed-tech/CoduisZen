import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('encryption key rotation contract', () => {
    it('keeps current and previous encryption secrets separate', () => {
        const payment = fs.readFileSync('server/utils/paymentSessionCrypto.ts', 'utf8');
        const ai = fs.readFileSync('server/services/aiKeyVaultService.ts', 'utf8');
        const env = fs.readFileSync('scripts/validate-env.ts', 'utf8');
        expect(payment).toContain('PAYMENT_TOKEN_SECRET_PREVIOUS');
        expect(ai).toContain('AI_KEY_ENCRYPTION_SECRET_PREVIOUS');
        expect(env).toContain("key: 'PAYMENT_TOKEN_SECRET_PREVIOUS'");
        expect(env).toContain("key: 'AI_KEY_ENCRYPTION_SECRET_PREVIOUS'");
    });
});
