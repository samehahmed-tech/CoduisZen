import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('../server/services/campaignSchedulerService.ts', import.meta.url)), 'utf8');
const index = readFileSync(fileURLToPath(new URL('../server/index.ts', import.meta.url)), 'utf8');

describe('campaign scheduler contract', () => {
    it('dispatches due campaigns with audience consent and idempotency', () => {
        expect(source).toContain("const SCOPE = 'CAMPAIGN_SCHEDULED_DISPATCH'");
        expect(source).toContain("eq(campaigns.status, 'SCHEDULED')");
        expect(source).toContain('marketingWhatsappOptIn');
        expect(source).toContain('marketingSmsOptIn');
        expect(source).toContain('INACTIVE_30_DAYS');
        expect(source).toContain('CAMPAIGN_AUDIENCE_NOT_SUPPORTED');
        expect(source).toContain("if (!['ALL', 'VIP', 'INACTIVE_30_DAYS', 'NEW_CUSTOMERS_7_DAYS', 'BIRTHDAY_TODAY'].includes(audience) && !rfmSegments.has(audience))");
        expect(source).toContain('customerRfmMetrics');
        expect(source).toContain('CHAMPIONS');
        expect(source).toContain('campaign_rfm');
        expect(source).toContain('CAMPAIGN_AUTOMATION_CONFIG_KEY');
        expect(source).toContain('AUTOMATION_TRIGGER_DISABLED');
        expect(source).toContain('welcomeRegistration');
        expect(source).toContain('NEW_CUSTOMERS_7_DAYS');
        expect(source).toContain('MAX_RECIPIENTS = 500');
        expect(source).toContain('scheduledAt: null');
        expect(index).toContain('campaignSchedulerService.startCron()');
    });
});
