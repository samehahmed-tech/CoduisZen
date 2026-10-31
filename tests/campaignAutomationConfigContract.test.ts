import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const controller = readFileSync(fileURLToPath(new URL('../server/controllers/campaignController.ts', import.meta.url)), 'utf8');
const routes = readFileSync(fileURLToPath(new URL('../server/routes/campaignRoutes.ts', import.meta.url)), 'utf8');
const api = readFileSync(fileURLToPath(new URL('../services/api/campaigns.ts', import.meta.url)), 'utf8');
const ui = readFileSync(fileURLToPath(new URL('../components/CampaignHub.tsx', import.meta.url)), 'utf8');

describe('campaign automation config contract', () => {
    it('persists scoped trigger settings and exposes a real UI control', () => {
        expect(controller).toContain('CAMPAIGN_AUTOMATION_CONFIG_KEY');
        expect(controller).toContain('getCampaignAutomationConfig');
        expect(controller).toContain('saveCampaignAutomationConfig');
        expect(controller).toContain('CAMPAIGN_AUTOMATION_CONFIG_UPDATED');
        expect(routes).toContain("router.get('/automation-config'");
        expect(routes).toContain("router.put('/automation-config'");
        expect(api).toContain('getAutomationConfig');
        expect(api).toContain('saveAutomationConfig');
        expect(ui).toContain('toggleAutomation');
        expect(ui).toContain('automationConfig');
    });
});
