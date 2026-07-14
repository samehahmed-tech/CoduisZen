import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { dispatchCampaign } from '../server/controllers/campaignController';
import { db } from '../server/db';
import { campaigns } from '../src/db/schema';

const campaignId = 'test-campaign-dispatch-safety';

const invokeDispatch = async (mode?: 'DRY_RUN') => {
    const response = {
        statusCode: 200,
        body: undefined as any,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(payload: any) {
            this.body = payload;
            return this;
        },
    };

    await dispatchCampaign({
        params: { id: campaignId },
        body: { mode, phones: ['01000000000'] },
        user: { id: 'test-campaign-actor', branchId: 'b1' },
    } as any, response as any);

    return response;
};

describe('campaign dispatch safety', () => {
    beforeAll(async () => {
        await db.delete(campaigns).where(eq(campaigns.id, campaignId));
        await db.insert(campaigns).values({
            id: campaignId,
            name: 'Safety campaign',
            type: 'SMS',
            status: 'SCHEDULED',
            content: 'Test message',
            reach: 7,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    });

    afterAll(async () => {
        await db.delete(campaigns).where(eq(campaigns.id, campaignId));
    });

    it('keeps reach unchanged during a dry run', async () => {
        const response = await invokeDispatch('DRY_RUN');
        const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));

        expect(response.statusCode).toBe(200);
        expect(response.body).toMatchObject({ sent: 0, failed: 0, simulated: 1, dryRun: true });
        expect(campaign.reach).toBe(7);
        expect(campaign.status).toBe('SCHEDULED');
    });

    it('rejects live SMS dispatch when no provider is configured', async () => {
        const response = await invokeDispatch();
        const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));

        expect(response.statusCode).toBe(503);
        expect(response.body).toEqual({ error: 'SMS_PROVIDER_NOT_CONFIGURED' });
        expect(campaign.reach).toBe(7);
    });
});
