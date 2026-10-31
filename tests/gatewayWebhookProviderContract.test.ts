import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('../server/controllers/p1FinanceController.ts', import.meta.url)), 'utf8');

describe('gateway webhook provider contract', () => {
    it('fails closed for providers without a verified adapter', () => {
        expect(source).toContain("if (normalizedProvider !== 'PAYMOB')");
        expect(source).toContain("PAYMENT_PROVIDER_WEBHOOK_NOT_CONFIGURED");
        expect(source).toContain('const result = await settlePaymobCallback(payload);');
    });
});
