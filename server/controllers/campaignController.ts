import { Request, Response } from 'express';
import { db } from '../db';
import { campaigns, campaignLogs, orders, customers, idempotencyKeys } from '../../src/db/schema';
import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { sendWhatsAppText } from '../services/whatsappService';
import { sendSmsText, smsService } from '../services/smsService';
import { nanoid } from 'nanoid';
import logger from '../utils/logger';
import { parseSettingJson, upsertSetting } from '../utils/settingsStore.js';

// Optional: keep dispatch logs in settings for now, or just don't log them extensively like before.
import { settings } from '../../src/db/schema';
const CAMPAIGN_DISPATCH_LOG_KEY = 'marketing_campaign_dispatches_v1';
const CAMPAIGN_AUTOMATION_CONFIG_KEY = 'marketing_campaign_automation_v1';
const DEFAULT_CAMPAIGN_AUTOMATION_CONFIG = {
    welcomeRegistration: true,
    dormantRecovery: true,
    birthdayOffer: false,
};
import { createSignedAuditLog } from '../services/auditService';
import { customerPhoneVariants, normalizeCustomerPhone } from '../utils/customerIdentityPolicy';
import { ensureCustomerConsentSchema } from '../services/customerConsentService';
import { buildRequestHash, getIdempotencyKeyFromRequest, sanitizeIdempotencyPayload } from '../services/idempotencyService';

const auditCampaignMutation = (req: Request, eventType: string, payload: Record<string, unknown>, after?: Record<string, unknown>) => createSignedAuditLog({
    eventType,
    userId: req.user?.id || 'system',
    userRole: req.user?.role,
    branchId: req.effectiveBranchId || req.user?.branchId || null,
    requestId: req.requestId,
    sourceDevice: req.headers?.['user-agent'],
    payload,
    after,
    reason: `Campaign mutation: ${eventType}`,
});

const campaignAutomationKey = (branchId?: string | null) => `${CAMPAIGN_AUTOMATION_CONFIG_KEY}:${branchId || 'global'}`;

const normalizeCampaignAutomationConfig = (value: unknown) => {
    const parsed = parseSettingJson<Partial<typeof DEFAULT_CAMPAIGN_AUTOMATION_CONFIG>>(value, {});
    return {
        welcomeRegistration: parsed?.welcomeRegistration !== false,
        dormantRecovery: parsed?.dormantRecovery !== false,
        birthdayOffer: parsed?.birthdayOffer === true,
    };
};

export const getCampaignAutomationConfig = async (req: Request, res: Response) => {
    try {
        const branchId = req.effectiveBranchId || req.user?.branchId || null;
        const [row] = await db.select().top(1).from(settings).where(eq(settings.key, campaignAutomationKey(branchId)));
        res.json({ ok: true, config: normalizeCampaignAutomationConfig(row?.value) });
    } catch (error: any) {
        logger.error({ err: error }, 'Error fetching campaign automation config');
        res.status(500).json({ error: 'CAMPAIGN_AUTOMATION_CONFIG_FAILED' });
    }
};

export const saveCampaignAutomationConfig = async (req: Request, res: Response) => {
    try {
        const branchId = req.effectiveBranchId || req.user?.branchId || null;
        const config = normalizeCampaignAutomationConfig(req.body?.config || req.body);
        await upsertSetting({
            key: campaignAutomationKey(branchId),
            value: config,
            category: 'marketing',
            updatedBy: req.user?.id || 'system',
        });
        await auditCampaignMutation(req, 'CAMPAIGN_AUTOMATION_CONFIG_UPDATED', { changedKeys: Object.keys(config).sort() }, { updated: true });
        res.json({ ok: true, config });
    } catch (error: any) {
        logger.error({ err: error }, 'Error saving campaign automation config');
        res.status(500).json({ error: 'CAMPAIGN_AUTOMATION_CONFIG_SAVE_FAILED' });
    }
};

export const getCampaigns = async (_req: Request, res: Response) => {
    try {
        const branchId = _req.effectiveBranchId || _req.user?.branchId;
        const result = await db.select().from(campaigns)
            .where(branchId ? or(isNull(campaigns.branchId), eq(campaigns.branchId, branchId)) : undefined)
            .orderBy(desc(campaigns.createdAt));

        // Map to frontend expected shape
        const mapped = result.map(c => ({
            id: c.id,
            name: c.name,
            method: c.type,
            status: c.status,
            targetAudience: c.targetAudience,
            content: c.content,
            outreach: c.reach || 0,
            conversions: c.conversions || 0,
            spend: c.budget || 0,
            revenue: c.revenue || 0,
            scheduledAt: c.scheduledAt ? c.scheduledAt.toISOString() : null,
            createdAt: c.createdAt ? c.createdAt.toISOString() : new Date().toISOString(),
            updatedAt: c.updatedAt ? c.updatedAt.toISOString() : new Date().toISOString(),
        }));

        res.json(mapped);
    } catch (error: any) {
        logger.error({ err: error }, 'Error fetching campaigns');
        res.status(500).json({ error: 'Failed to fetch campaigns' });
    }
};

export const createCampaign = async (req: Request, res: Response) => {
    try {
        const body = req.body || {};

        const [created] = await db.insert(campaigns).output().values({
            id: body.id || `CMP-${nanoid(8)}`,
            name: body.name || 'Untitled Campaign',
            type: body.method || body.type || 'SMS',
            branchId: req.effectiveBranchId || null,
            status: body.status || 'SCHEDULED',
            targetAudience: body.targetAudience || 'ALL',
            content: body.content || body.message || '',
            scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
            budget: Number(body.spend || body.budget || 0),
        });

        await auditCampaignMutation(req, 'CAMPAIGN_CREATED', { campaignId: created.id, method: created.type, targetAudience: created.targetAudience, budget: created.budget || 0 }, { status: created.status });
        res.status(201).json({
            id: created.id,
            name: created.name,
            method: created.type,
            status: created.status,
            outreach: created.reach,
            conversions: created.conversions,
            spend: created.budget,
            targetAudience: created.targetAudience,
            content: created.content,
            createdAt: created.createdAt?.toISOString(),
            updatedAt: created.updatedAt?.toISOString()
        });
    } catch (error: any) {
        logger.error({ err: error }, 'Error creating campaign');
        res.status(500).json({ error: 'Failed to create campaign' });
    }
};

export const updateCampaign = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const body = req.body || {};

        const branchId = req.effectiveBranchId || req.user?.branchId;
        const [updated] = await db.update(campaigns).set({
            name: body.name,
            type: body.method || body.type,
            status: body.status,
            targetAudience: body.targetAudience,
            content: body.content || body.message,
            scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
            budget: body.spend !== undefined ? Number(body.spend) : undefined,
            updatedAt: new Date(),
        })
            .output()
            .where(and(
                eq(campaigns.id, id),
                branchId ? or(isNull(campaigns.branchId), eq(campaigns.branchId, branchId)) : undefined,
            ));

        if (!updated) return res.status(404).json({ error: 'Campaign not found' });

        await auditCampaignMutation(req, 'CAMPAIGN_UPDATED', { campaignId: updated.id, changedKeys: Object.keys(body).filter((key) => key !== 'content' && key !== 'message').sort() }, { status: updated.status });
        res.json({
            id: updated.id,
            name: updated.name,
            method: updated.type,
            status: updated.status,
            outreach: updated.reach,
            conversions: updated.conversions,
            spend: updated.budget,
            targetAudience: updated.targetAudience,
            content: updated.content,
            createdAt: updated.createdAt?.toISOString(),
            updatedAt: updated.updatedAt?.toISOString()
        });
    } catch (error: any) {
        logger.error({ err: error }, 'Error updating campaign');
        res.status(500).json({ error: 'Failed to update campaign' });
    }
};

export const deleteCampaign = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const branchId = req.effectiveBranchId || req.user?.branchId;
        const [current] = await db.select().from(campaigns).where(and(
            eq(campaigns.id, id),
            branchId ? or(isNull(campaigns.branchId), eq(campaigns.branchId, branchId)) : undefined,
        )).top(1);
        await db.delete(campaigns).where(and(
            eq(campaigns.id, id),
            branchId ? or(isNull(campaigns.branchId), eq(campaigns.branchId, branchId)) : undefined,
        ));
        await auditCampaignMutation(req, 'CAMPAIGN_DELETED', { campaignId: id }, { deleted: Boolean(current) });
        res.json({ success: true });
    } catch (error: any) {
        logger.error({ err: error }, 'Error deleting campaign');
        res.status(500).json({ error: 'Failed to delete campaign' });
    }
};

export const getCampaignStats = async (req: Request, res: Response) => {
    try {
        const branchId = req.effectiveBranchId || req.user?.branchId;
        const allCampaigns = await db.select().from(campaigns)
            .where(branchId ? or(isNull(campaigns.branchId), eq(campaigns.branchId, branchId)) : undefined);

        const start = new Date();
        start.setDate(start.getDate() - 30);
        const recentOrders = await db.select().from(orders).where(and(
            gte(orders.createdAt, start),
            branchId ? eq(orders.branchId, branchId) : undefined,
        )).orderBy(desc(orders.createdAt));

        const totalReach = allCampaigns.reduce((s: number, c) => s + (Number(c.reach) || 0), 0);
        const totalConversions = allCampaigns.reduce((s: number, c) => s + (Number(c.conversions) || 0), 0);
        const campaignRevenueEstimate = allCampaigns.reduce((s: number, c) => s + ((Number(c.conversions) || 0) * 120), 0);
        const conversionRate = totalReach > 0 ? (totalConversions / totalReach) * 100 : 0;
        const recentRevenue = recentOrders.reduce((s: number, o) => s + (Number(o.total) || 0), 0);
        const channelCounts = allCampaigns.reduce((acc, campaign) => {
            const type = String(campaign.type || '').toUpperCase();
            if (type === 'SMS') acc.SMS += 1;
            if (type === 'EMAIL') acc.Email += 1;
            if (type === 'PUSH') acc.Push += 1;
            if (type === 'WHATSAPP') acc.WHATSAPP += 1;
            return acc;
        }, { SMS: 0, Email: 0, Push: 0, WHATSAPP: 0 });

        res.json({
            totalReach,
            totalConversions,
            conversionRate,
            campaignRevenueEstimate,
            recentRevenue,
            activeCoupons: allCampaigns.filter(c => String(c.status || '').toUpperCase() === 'ACTIVE').length,
            channels: channelCounts,
        });
    } catch (error: any) {
        logger.error({ err: error }, 'Error calculating campaign stats');
        res.status(500).json({ error: 'Failed to calculate stats' });
    }
};

type CampaignDispatchLog = {
    id: string;
    campaignId: string;
    method: string;
    sent: number;
    failed: number;
    dryRun: boolean;
    branchId?: string | null;
    startedAt: string;
    finishedAt: string;
    actorId?: string | null;
};

const loadDispatchLogs = async (): Promise<CampaignDispatchLog[]> => {
    const [row] = await db.select().from(settings).where(eq(settings.key, CAMPAIGN_DISPATCH_LOG_KEY));
    return parseSettingJson<CampaignDispatchLog[]>(row?.value, []);
};

const saveDispatchLogs = async (logs: CampaignDispatchLog[], updatedBy?: string) => {
    const payload = logs.slice(0, 200);
    await upsertSetting({
        key: CAMPAIGN_DISPATCH_LOG_KEY,
        value: payload,
        category: 'marketing',
        updatedBy: updatedBy || 'system',
    });
};

export const getCampaignDeliveryLogs = async (req: Request, res: Response) => {
    try {
        const campaignId = String(req.params?.id || '').trim();
        if (!campaignId) return res.status(400).json({ error: 'CAMPAIGN_ID_REQUIRED' });
        const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
        const branchId = req.effectiveBranchId || req.user?.branchId;
        const [campaign] = await db.select({ id: campaigns.id }).top(1).from(campaigns).where(and(
            eq(campaigns.id, campaignId),
            branchId ? or(isNull(campaigns.branchId), eq(campaigns.branchId, branchId)) : undefined,
        ));
        if (!campaign) return res.status(404).json({ error: 'CAMPAIGN_NOT_FOUND' });

        const rows = await db.select({
            id: campaignLogs.id,
            channel: campaignLogs.channel,
            sentAt: campaignLogs.sentAt,
            delivered: campaignLogs.delivered,
            opened: campaignLogs.opened,
            clicked: campaignLogs.clicked,
            errorMessage: campaignLogs.errorMessage,
        }).from(campaignLogs)
            .where(eq(campaignLogs.campaignId, campaignId))
            .orderBy(desc(campaignLogs.sentAt))
            .offset(0).fetch(limit);

        return res.json({
            campaignId,
            data: rows,
            summary: {
                total: rows.length,
                delivered: rows.filter((row) => row.delivered === true).length,
                failed: rows.filter((row) => row.delivered === false).length,
                opened: rows.filter((row) => row.opened === true).length,
                clicked: rows.filter((row) => row.clicked === true).length,
            },
        });
    } catch (error: any) {
        logger.error({ err: error }, 'Error fetching campaign delivery logs');
        return res.status(500).json({ error: 'CAMPAIGN_DELIVERY_LOGS_FAILED' });
    }
};

const recordCampaignDelivery = async (campaignId: string, channel: string, delivered: boolean, errorMessage?: string) => {
    try {
        await db.insert(campaignLogs).values({
            campaignId,
            channel: String(channel || '').toUpperCase(),
            delivered,
            errorMessage: errorMessage ? String(errorMessage).slice(0, 500) : null,
            sentAt: new Date(),
        });
    } catch (error: any) {
        // Delivery must not be retried merely because observability storage is
        // temporarily unavailable; the aggregate dispatch result remains true.
        logger.warn({ err: error?.message, campaignId }, 'Campaign delivery log write failed');
    }
};

const normalizePhone = (value: string) => String(value || '').replace(/[^\d+]/g, '').trim();

const collectRecipientPhones = async (input: {
    customerIds?: string[];
    phones?: string[];
}, branchId?: string | null) => {
    await ensureCustomerConsentSchema();
    const direct = Array.isArray(input.phones) ? input.phones.map(normalizePhone).filter(Boolean) : [];
    // A direct phone list must not bypass a known customer's opt-out. Unknown
    // numbers remain explicit operator-provided recipients, but known opted-out
    // identities are always excluded before any provider is called.
    const directIdentityConditions = direct.flatMap((phone) => customerPhoneVariants(phone).map((variant) => eq(customers.phone, variant)));
    const branchCustomerCondition = branchId
        ? sql`EXISTS (SELECT 1 FROM orders campaign_branch_orders WHERE campaign_branch_orders.customer_id = ${customers.id} AND campaign_branch_orders.branch_id = ${branchId})`
        : undefined;
    const knownDirectRows = directIdentityConditions.length
        ? await db.select({ phone: customers.phone, marketingOptIn: customers.marketingOptIn, channelOptIn: customers.marketingWhatsappOptIn })
            .from(customers)
            .where(or(...directIdentityConditions))
        : [];
    const optedOutPhones = new Set(knownDirectRows
        .filter((row) => row.marketingOptIn === false || row.channelOptIn === false)
        .map((row) => normalizeCustomerPhone(row.phone)));
    // Explicit phone recipients are operator-provided targets and may not have
    // a branch-linked customer record yet. Consent still wins when the number
    // is known; customerIds and audience segments remain branch-scoped below.
    const consentedDirect = direct.filter((phone) => !optedOutPhones.has(normalizeCustomerPhone(phone)));
    const byCustomerIds = Array.isArray(input.customerIds) ? input.customerIds.map((id) => String(id).trim()).filter(Boolean) : [];
    let customerPhones: string[] = [];
    if (byCustomerIds.length > 0) {
        // Consent gate: only customers who did not opt out.
        const rows = await db.select({ phone: customers.phone }).from(customers).where(and(
            inArray(customers.id, byCustomerIds),
            or(eq(customers.marketingOptIn, true), isNull(customers.marketingOptIn)),
            or(eq(customers.marketingWhatsappOptIn, true), isNull(customers.marketingWhatsappOptIn)),
            branchCustomerCondition,
        ));
        customerPhones = rows.map((r) => normalizePhone(String(r.phone || ''))).filter(Boolean);
    }
    const unique = Array.from(new Set([...consentedDirect, ...customerPhones]));
    return unique.slice(0, 500); // MAX_DISPATCH_RECIPIENTS
};

const countConsentedAudience = async (branchId?: string | null): Promise<number> => {
    await ensureCustomerConsentSchema();
    const rows = await db.select({ phone: customers.phone }).from(customers).where(and(
        or(eq(customers.marketingOptIn, true), isNull(customers.marketingOptIn)),
        or(eq(customers.marketingWhatsappOptIn, true), isNull(customers.marketingWhatsappOptIn)),
        sql`${customers.phone} IS NOT NULL AND ${customers.phone} <> ''`,
        branchId
            ? sql`EXISTS (SELECT 1 FROM orders campaign_branch_orders WHERE campaign_branch_orders.customer_id = ${customers.id} AND campaign_branch_orders.branch_id = ${branchId})`
            : undefined,
    ));
    return rows.length;
};

export const dispatchCampaign = async (req: Request, res: Response) => {
    const idempotencyKey = getIdempotencyKeyFromRequest(req);
    let claimedIdempotencyKey: string | undefined;
    const idempotencyScope = 'CAMPAIGN_DISPATCH';
    try {
        const id = String(req.params?.id || '').trim();
        if (!id) return res.status(400).json({ error: 'CAMPAIGN_ID_REQUIRED' });

        const branchId = req.effectiveBranchId || req.user?.branchId;
        const campaign = await db.query.campaigns.findFirst({ where: and(
            eq(campaigns.id, id),
            branchId ? or(isNull(campaigns.branchId), eq(campaigns.branchId, branchId)) : undefined,
        ) });
        if (!campaign) return res.status(404).json({ error: 'CAMPAIGN_NOT_FOUND' });

        const dryRun = String(req.body?.mode || '').toUpperCase() === 'DRY_RUN';
        const recipientPhones = await collectRecipientPhones({
            customerIds: Array.isArray(req.body?.customerIds) ? req.body.customerIds : [],
            phones: Array.isArray(req.body?.phones) ? req.body.phones : [],
        }, campaign.branchId || branchId);

        if (recipientPhones.length === 0) {
            if (dryRun) {
                // Preview mode without recipients: report the consented
                // audience size instead of blasting anyone.
                const audience = await countConsentedAudience(campaign.branchId || branchId);
                return res.json({
                    ok: true, campaignId: campaign.id, method: campaign.type,
                    dryRun: true, recipients: 0, sent: 0, failed: 0,
                    simulated: Math.min(audience, 500), consentedAudience: audience,
                    dispatchId: null,
                });
            }
            // No silent fallback blast: SEND requires an explicit list.
            return res.status(400).json({
                error: 'CAMPAIGN_RECIPIENTS_REQUIRED',
                code: 'CAMPAIGN_RECIPIENTS_REQUIRED',
                message: 'Provide phones/customerIds explicitly — bulk fallback is disabled. Use DRY_RUN to preview the consented audience.',
            });
        }

        const message = String(req.body?.message || campaign.content || `Offer from ${campaign.name}`).trim();
        if (!message) return res.status(400).json({ error: 'CAMPAIGN_MESSAGE_REQUIRED' });
        if (!dryRun && campaign.type === 'SMS' && smsService.getStatus().status !== 'READY') {
            return res.status(503).json({ error: 'SMS_PROVIDER_NOT_CONFIGURED' });
        }
        if (!dryRun && campaign.type !== 'WHATSAPP' && campaign.type !== 'SMS') {
            return res.status(503).json({ error: 'CAMPAIGN_PROVIDER_NOT_CONFIGURED', method: campaign.type });
        }

        if (idempotencyKey) {
            const requestHash = buildRequestHash({
                campaignId: campaign.id,
                payload: sanitizeIdempotencyPayload({
                    ...req.body,
                    message,
                    customerIds: Array.isArray(req.body?.customerIds) ? req.body.customerIds : [],
                    phones: Array.isArray(req.body?.phones) ? req.body.phones : [],
                }),
            });
            const now = new Date();
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const [existing] = await db.select().top(1).from(idempotencyKeys).where(and(
                eq(idempotencyKeys.key, idempotencyKey),
                eq(idempotencyKeys.scope, idempotencyScope),
            ));
            if (existing && existing.expiresAt <= now) {
                await db.delete(idempotencyKeys).where(and(
                    eq(idempotencyKeys.key, idempotencyKey),
                    eq(idempotencyKeys.scope, idempotencyScope),
                    lt(idempotencyKeys.expiresAt, now),
                ));
            } else if (existing) {
                if (existing.requestHash !== requestHash) {
                    return res.status(409).json({ error: 'IDEMPOTENCY_KEY_PAYLOAD_CONFLICT' });
                }
                if (existing.status === 'COMPLETED') {
                    const replay = typeof existing.responseBody === 'string' ? JSON.parse(existing.responseBody) : existing.responseBody;
                    return res.status(existing.responseCode || 200).json({ ...replay, idempotentReplay: true });
                }
                return res.status(409).json({ error: 'IDEMPOTENCY_KEY_IN_PROGRESS' });
            }
            try {
                await db.insert(idempotencyKeys).values({
                    key: idempotencyKey,
                    scope: idempotencyScope,
                    requestHash,
                    status: 'IN_PROGRESS',
                    expiresAt,
                    updatedAt: new Date(),
                });
                claimedIdempotencyKey = idempotencyKey;
            } catch {
                return res.status(409).json({ error: 'IDEMPOTENCY_KEY_IN_PROGRESS' });
            }
        }

        let sent = 0;
        let failed = 0;
        let simulated = 0;
        const startedAt = new Date().toISOString();

        if (dryRun) {
            simulated = recipientPhones.length;
        } else {
            if (campaign.type === 'WHATSAPP') {
                for (const phone of recipientPhones) {
                    try {
                        await sendWhatsAppText({ to: phone, text: message });
                        sent += 1;
                        await recordCampaignDelivery(campaign.id, campaign.type, true);
                    } catch (error: any) {
                        failed += 1;
                        await recordCampaignDelivery(campaign.id, campaign.type, false, error?.message);
                    }
                }
            } else if (campaign.type === 'SMS') {
                if (smsService.getStatus().status !== 'READY') {
                    return res.status(503).json({ error: 'SMS_PROVIDER_NOT_CONFIGURED' });
                }
                for (const phone of recipientPhones) {
                    try {
                        await sendSmsText({ to: phone, text: message });
                        sent += 1;
                        await recordCampaignDelivery(campaign.id, campaign.type, true);
                    } catch (error: any) {
                        failed += 1;
                        await recordCampaignDelivery(campaign.id, campaign.type, false, error?.message);
                    }
                }
            } else {
                return res.status(503).json({ error: 'CAMPAIGN_PROVIDER_NOT_CONFIGURED', method: campaign.type });
            }
        }

        if (!dryRun && sent > 0) {
            await db.update(campaigns).set({
                reach: Number(campaign.reach || 0) + sent,
                status: campaign.status === 'SCHEDULED' ? 'ACTIVE' : campaign.status,
                updatedAt: new Date()
            }).where(eq(campaigns.id, campaign.id));
        }

        const dispatchLog: CampaignDispatchLog = {
            id: `CMP-DISPATCH-${Date.now()}`,
            campaignId: campaign.id,
            method: campaign.type,
            sent,
            failed,
            dryRun,
            branchId: req.user?.branchId || null,
            startedAt,
            finishedAt: new Date().toISOString(),
            actorId: req.user?.id || null,
        };
        const logs = await loadDispatchLogs();
        await saveDispatchLogs([dispatchLog, ...logs], req.user?.id);

        await auditCampaignMutation(req, 'CAMPAIGN_DISPATCH_COMPLETED', { campaignId: campaign.id, dryRun, recipientCount: recipientPhones.length, sent, failed, simulated }, { completed: true });
        const responseBody = {
            ok: true,
            campaignId: campaign.id,
            method: campaign.type,
            dryRun,
            recipients: recipientPhones.length,
            sent,
            failed,
            simulated,
            dispatchId: dispatchLog.id,
        };
        if (claimedIdempotencyKey) {
            await db.update(idempotencyKeys).set({
                status: 'COMPLETED', responseCode: 200, responseBody: JSON.stringify(responseBody), updatedAt: new Date(),
            }).where(and(eq(idempotencyKeys.key, claimedIdempotencyKey), eq(idempotencyKeys.scope, idempotencyScope)));
        }
        return res.json(responseBody);
    } catch (error: any) {
        if (claimedIdempotencyKey) {
            await db.update(idempotencyKeys).set({
                status: 'COMPLETED', responseCode: 500, responseBody: JSON.stringify({ error: error.message || 'CAMPAIGN_DISPATCH_FAILED' }), updatedAt: new Date(),
            }).where(and(eq(idempotencyKeys.key, claimedIdempotencyKey), eq(idempotencyKeys.scope, idempotencyScope))).catch(() => undefined);
        }
        logger.error({ err: error }, 'Campaign dispatch error');
        return res.status(500).json({ error: error.message || 'CAMPAIGN_DISPATCH_FAILED' });
    }
};
