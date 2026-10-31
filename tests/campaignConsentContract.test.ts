import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('../server/controllers/campaignController.ts', import.meta.url)), 'utf8');

describe('campaign consent contract', () => {
    it('checks opt-out state for explicit phone recipients before dispatch', () => {
        expect(source).toContain('knownDirectRows');
        expect(source).toContain('row.marketingOptIn === false');
        expect(source).toContain('row.channelOptIn === false');
        expect(source).toContain('customers.marketingWhatsappOptIn');
        expect(source).toContain('ensureCustomerConsentSchema');
        expect(source).toContain('const consentedDirect = direct.filter');
    });
});
