import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const controller = readFileSync(fileURLToPath(new URL('../server/controllers/campaignController.ts', import.meta.url)), 'utf8');
const routes = readFileSync(fileURLToPath(new URL('../server/routes/campaignRoutes.ts', import.meta.url)), 'utf8');
const api = readFileSync(fileURLToPath(new URL('../services/api/campaigns.ts', import.meta.url)), 'utf8');

describe('campaign delivery logs contract', () => {
    it('exposes bounded, privacy-safe delivery history', () => {
        expect(controller).toContain('export const getCampaignDeliveryLogs');
        expect(controller).toContain('Math.min(Math.max(Number(req.query.limit) || 100, 1), 500)');
        expect(controller).toContain('summary:');
        expect(controller).not.toContain('customerPhone: campaignLogs');
        expect(routes).toContain("router.get('/:id/logs'");
        expect(api).toContain('getDeliveryLogs');
    });
});
