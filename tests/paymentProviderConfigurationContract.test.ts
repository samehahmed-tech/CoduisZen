import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('../server/services/paymentGatewayService.ts', import.meta.url)), 'utf8');

describe('payment provider configuration contract', () => {
    it('persists the verified Paymob configuration and rejects unsupported providers', () => {
        expect(source).toContain("import { savePaymobConfig } from '../modules/payments/paymobService'");
        expect(source).toContain("provider !== 'PAYMOB' && provider !== 'CARD' && provider !== 'INSTAPAY'");
        expect(source).toContain("PAYMENT_PROVIDER_CONFIGURATION_NOT_SUPPORTED");
        expect(source).toContain('await savePaymobConfig({');
        expect(source).toContain("eventType: 'PAYMENT_PROVIDER_CONFIGURED'");
        expect(source).not.toContain('PAYMENT_PROVIDER_CONFIGURATION_NOT_IMPLEMENTED');
    });
});
