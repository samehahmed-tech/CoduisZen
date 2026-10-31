import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const controller = readFileSync(fileURLToPath(new URL('../server/controllers/customerController.ts', import.meta.url)), 'utf8');
const routes = readFileSync(fileURLToPath(new URL('../server/routes/customerRoutes.ts', import.meta.url)), 'utf8');

describe('customer consent contract', () => {
    it('records explicit opt-in/opt-out through an audited endpoint', () => {
        expect(routes).toContain("router.patch('/:id/marketing-consent'");
        expect(controller).toContain('export const updateMarketingConsent');
        expect(controller).toContain('CUSTOMER_MARKETING_CONSENT_UPDATED');
        expect(controller).toContain('const marketingOptOutAt = raw ? null : new Date()');
        expect(controller).toContain('marketingWhatsappOptIn');
        expect(controller).toContain('parseMarketingConsentChannel');
        expect(controller).toContain('CUSTOMER_MARKETING_CONSENT_UPDATED');
        expect(controller).toContain('channel');
        expect(controller).toContain('marketingOptOutAt: channel === \'GLOBAL\'');
        expect(controller).toContain('ensureCustomerConsentSchema');
        expect(controller).toContain('marketingEmailOptIn');
        expect(controller).toContain('marketingSmsOptIn');
        expect(controller).toContain('marketingPushOptIn');
        expect(routes).toContain("router.patch('/:id/marketing-consent'");
    });
});
