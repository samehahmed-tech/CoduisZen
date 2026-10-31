import { and, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { campaigns, campaignLogs, customers, customerRfmMetrics, idempotencyKeys, settings } from '../../src/db/schema';
import { db } from '../db';
import { sendSmsText, smsService } from './smsService';
import { sendWhatsAppText } from './whatsappService';
import logger from '../utils/logger';
import { parseSettingJson } from '../utils/settingsStore.js';

const SCOPE = 'CAMPAIGN_SCHEDULED_DISPATCH';
const MAX_RECIPIENTS = 500;
const CAMPAIGN_AUTOMATION_CONFIG_KEY = 'marketing_campaign_automation_v1';

const isAutomationEnabled = async (campaign: typeof campaigns.$inferSelect) => {
    const audience = String(campaign.targetAudience || 'ALL').trim().toUpperCase();
    if (!['INACTIVE_30_DAYS', 'NEW_CUSTOMERS_7_DAYS', 'BIRTHDAY_TODAY'].includes(audience)) return true;
    const key = `${CAMPAIGN_AUTOMATION_CONFIG_KEY}:${campaign.branchId || 'global'}`;
    const [row] = await db.select().top(1).from(settings).where(eq(settings.key, key));
    const config = parseSettingJson<{ dormantRecovery?: boolean; welcomeRegistration?: boolean }>(row?.value, { dormantRecovery: true, welcomeRegistration: true });
    if (audience === 'INACTIVE_30_DAYS') return config.dormantRecovery !== false;
    if (audience === 'NEW_CUSTOMERS_7_DAYS') return config.welcomeRegistration !== false;
    return (config as { birthdayOffer?: boolean }).birthdayOffer === true;
};

const recordDelivery = async (campaignId: string, channel: string, delivered: boolean, errorMessage?: string) => {
    try {
        await db.insert(campaignLogs).values({
            campaignId,
            channel,
            delivered,
            errorMessage: errorMessage ? String(errorMessage).slice(0, 500) : null,
            sentAt: new Date(),
        });
    } catch (error: any) {
        logger.warn({ err: error?.message, campaignId }, 'Scheduled campaign delivery log write failed');
    }
};

const eligibleRecipients = async (campaign: typeof campaigns.$inferSelect) => {
    const channelField = campaign.type === 'WHATSAPP'
        ? customers.marketingWhatsappOptIn
        : campaign.type === 'SMS'
            ? customers.marketingSmsOptIn
            : null;
    if (!channelField) return [] as string[];
    const audience = String(campaign.targetAudience || 'ALL').trim().toUpperCase();
    const rfmSegments = new Set(['CHAMPIONS', 'LOYAL', 'AT_RISK', 'ABOUT_TO_SLEEP', 'NEED_ATTENTION', 'LOST']);
    if (!['ALL', 'VIP', 'INACTIVE_30_DAYS', 'NEW_CUSTOMERS_7_DAYS', 'BIRTHDAY_TODAY'].includes(audience) && !rfmSegments.has(audience)) {
        throw new Error('CAMPAIGN_AUDIENCE_NOT_SUPPORTED');
    }
    const conditions: any[] = [
        isNull(customers.deletedAt),
        sql`${customers.phone} IS NOT NULL AND ${customers.phone} <> ''`,
        or(eq(customers.marketingOptIn, true), isNull(customers.marketingOptIn)),
        or(eq(channelField, true), isNull(channelField)),
    ];
    if (campaign.branchId) {
        conditions.push(sql`EXISTS (
            SELECT 1 FROM orders campaign_branch_orders
            WHERE campaign_branch_orders.customer_id = ${customers.id}
              AND campaign_branch_orders.branch_id = ${campaign.branchId}
        )`);
    }
    if (audience === 'VIP') conditions.push(inArray(customers.loyaltyTier, ['Gold', 'Platinum']));
    if (audience === 'INACTIVE_30_DAYS') {
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        conditions.push(sql`NOT EXISTS (
            SELECT 1 FROM orders recent_orders
            WHERE recent_orders.customer_id = ${customers.id}
              AND recent_orders.status IN ('COMPLETED', 'DELIVERED')
              AND recent_orders.created_at >= ${cutoff}
        )`);
    }
    if (audience === 'NEW_CUSTOMERS_7_DAYS') {
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        conditions.push(sql`${customers.createdAt} >= ${cutoff}`);
    }
    if (audience === 'BIRTHDAY_TODAY') {
        conditions.push(sql`EXISTS (
            SELECT 1 FROM customers campaign_birthday
            WHERE campaign_birthday.id = ${customers.id}
              AND campaign_birthday.birth_date IS NOT NULL
              AND MONTH(campaign_birthday.birth_date) = MONTH(GETDATE())
              AND DAY(campaign_birthday.birth_date) = DAY(GETDATE())
        )`);
    }
    if (rfmSegments.has(audience)) {
        conditions.push(sql`EXISTS (
            SELECT 1 FROM customer_rfm_metrics campaign_rfm
            WHERE campaign_rfm.customer_id = ${customers.id}
              AND campaign_rfm.rfm_segment = ${audience}
              AND (campaign_rfm.branch_id = ${campaign.branchId || ''} OR campaign_rfm.branch_id IS NULL)
        )`);
    }
    const rows = await db.select({ phone: customers.phone }).top(MAX_RECIPIENTS).from(customers)
        .where(and(...conditions));
    return Array.from(new Set<string>(rows.map((row) => String(row.phone || '').trim()).filter(Boolean)));
};

const dispatchScheduledCampaign = async (campaign: typeof campaigns.$inferSelect) => {
    const scheduledKey = `${campaign.id}:${new Date(campaign.scheduledAt as Date).toISOString()}`;
    const campaignType = String(campaign.type).toUpperCase();
    const campaignContent = String(campaign.content || '');
    if (!(await isAutomationEnabled(campaign))) {
        return { skipped: true, sent: 0, failed: 0, reason: 'AUTOMATION_TRIGGER_DISABLED' };
    }
    const [existing] = await db.select({ id: idempotencyKeys.id }).top(1).from(idempotencyKeys).where(and(
        eq(idempotencyKeys.key, scheduledKey),
        eq(idempotencyKeys.scope, SCOPE),
    ));
    if (existing) return { skipped: true, sent: 0, failed: 0 };
    try {
        await db.insert(idempotencyKeys).values({
            key: scheduledKey,
            scope: SCOPE,
            requestHash: scheduledKey,
            resourceId: campaign.id,
            status: 'IN_PROGRESS',
            expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
            updatedAt: new Date(),
        });
    } catch {
        return { skipped: true, sent: 0, failed: 0 };
    }

    let sent = 0;
    let failed = 0;
    try {
        const phones = await eligibleRecipients(campaign);
        if (campaignType === 'SMS' && smsService.getStatus().status !== 'READY') {
            throw new Error('SMS_PROVIDER_NOT_CONFIGURED');
        }
        if (!['SMS', 'WHATSAPP'].includes(campaignType)) {
            throw new Error('CAMPAIGN_PROVIDER_NOT_CONFIGURED');
        }
        for (const phone of phones) {
            try {
                if (campaignType === 'SMS') await sendSmsText({ to: phone, text: campaignContent });
                else await sendWhatsAppText({ to: phone, text: campaignContent });
                sent += 1;
                await recordDelivery(String(campaign.id), campaignType, true);
            } catch (error: any) {
                failed += 1;
                await recordDelivery(String(campaign.id), campaignType, false, error?.message);
            }
        }
        await db.update(campaigns).set({
            reach: Number(campaign.reach || 0) + sent,
            status: 'ACTIVE',
            scheduledAt: null,
            updatedAt: new Date(),
        }).where(eq(campaigns.id, campaign.id));
        await db.update(idempotencyKeys).set({
            status: 'COMPLETED', responseCode: 200,
            responseBody: JSON.stringify({ sent, failed }), updatedAt: new Date(),
        }).where(and(eq(idempotencyKeys.key, scheduledKey), eq(idempotencyKeys.scope, SCOPE)));
        return { skipped: false, sent, failed };
    } catch (error: any) {
        await db.update(campaigns).set({ status: 'PAUSED', updatedAt: new Date() }).where(eq(campaigns.id, campaign.id)).catch(() => undefined);
        await db.update(idempotencyKeys).set({
            status: 'COMPLETED', responseCode: 503,
            responseBody: JSON.stringify({ error: error?.message || 'CAMPAIGN_SCHEDULED_DISPATCH_FAILED' }), updatedAt: new Date(),
        }).where(and(eq(idempotencyKeys.key, scheduledKey), eq(idempotencyKeys.scope, SCOPE))).catch(() => undefined);
        logger.error({ err: error?.message, campaignId: campaign.id }, 'Scheduled campaign dispatch failed');
        return { skipped: false, sent, failed, error: error?.message || 'CAMPAIGN_SCHEDULED_DISPATCH_FAILED' };
    }
};

export const campaignSchedulerService = {
    async runDueCampaigns() {
        const now = new Date();
        const due = await db.query.campaigns.findMany({
            where: and(eq(campaigns.status, 'SCHEDULED'), lte(campaigns.scheduledAt, now)),
            orderBy: (table, { asc }) => [asc(table.scheduledAt)],
        });
        const results = [];
        for (const campaign of due) results.push({ campaignId: campaign.id, ...(await dispatchScheduledCampaign(campaign)) });
        return results;
    },
    startCron(intervalMs = 60_000) {
        const timer = setInterval(() => this.runDueCampaigns().catch((error) => logger.error({ err: error }, 'Campaign scheduler tick failed')), intervalMs);
        timer.unref?.();
        return timer;
    },
};
