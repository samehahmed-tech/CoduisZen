import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('../server/controllers/campaignController.ts', import.meta.url)), 'utf8');

describe('campaign delivery log contract', () => {
    it('records channel delivery outcomes without persisting recipient phone numbers', () => {
        expect(source).toContain('campaignLogs');
        expect(source).toContain('recordCampaignDelivery');
        expect(source).toContain('delivered');
        expect(source).toContain('errorMessage');
        expect(source).not.toContain('customerPhone: phone');
    });
});
