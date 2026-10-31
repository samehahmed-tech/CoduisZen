import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(fileURLToPath(new URL('../src/db/schema.ts', import.meta.url)), 'utf8');
const orderController = readFileSync(fileURLToPath(new URL('../server/controllers/orderController.ts', import.meta.url)), 'utf8');
const report = readFileSync(fileURLToPath(new URL('../server/controllers/report/crmReports.ts', import.meta.url)), 'utf8');
const marketing = readFileSync(fileURLToPath(new URL('../server/controllers/marketingController.ts', import.meta.url)), 'utf8');

describe('campaign attribution contract', () => {
    it('persists a campaign id on orders through an additive migration', () => {
        expect(schema).toContain("campaignId: nvarchar('campaign_id')");
        expect(orderController).toContain('ensureCampaignAttributionSchema');
        expect(orderController).toContain('bodyData.utm_campaign');
    });

    it('calculates ROI from completed or delivered attributed orders', () => {
        expect(report).toContain("inArray(orders.status, ['DELIVERED', 'COMPLETED'])");
        expect(report).toContain('COMPLETED_OR_DELIVERED_ORDERS');
        expect(report).toContain('storedRevenueEstimate');
    });

    it('falls back from coupon usage to the linked campaign', () => {
        expect(schema).toContain("campaignId: nvarchar('campaign_id'), // Optional campaign attribution fallback");
        expect(marketing).toContain('campaignId: campaignId ? String(campaignId).trim() : null');
        expect(orderController).toContain('if (!orderData.campaignId && coupon.campaignId)');
    });
});
