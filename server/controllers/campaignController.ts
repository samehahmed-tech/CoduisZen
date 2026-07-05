import { Request, Response } from 'express';
import { db } from '../db';
import { campaigns, orders, customers } from '../../src/db/schema';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { sendWhatsAppText } from '../services/whatsappService';
import { nanoid } from 'nanoid';
import logger from '../utils/logger';

// Optional: keep dispatch logs in settings for now, or just don't log them extensively like before.
import { settings } from '../../src/db/schema';
const CAMPAIGN_DISPATCH_LOG_KEY = 'marketing_campaign_dispatches_v1';

export const getCampaigns = async (_req: Request, res: Response) => {
    try {
        const result = await db.query.campaigns.findMany({
            orderBy: (campaigns, { desc }) => [desc(campaigns.createdAt)],
        });

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

        const [created] = await db.insert(campaigns).values({
            id: body.id || `CMP-${nanoid(8)}`,
            name: body.name || 'Untitled Campaign',
            type: body.method || body.type || 'SMS',
            status: body.status || 'SCHEDULED',
            targetAudience: body.targetAudience || 'ALL',
            content: body.content || body.message || '',
            scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
            budget: Number(body.spend || body.budget || 0),
        }).returning();

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
            .where(eq(campaigns.id, id))
            .returning();

        if (!updated) return res.status(404).json({ error: 'Campaign not found' });

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
        await db.delete(campaigns).where(eq(campaigns.id, id));
        res.json({ success: true });
    } catch (error: any) {
        logger.error({ err: error }, 'Error deleting campaign');
        res.status(500).json({ error: 'Failed to delete campaign' });
    }
};

export const getCampaignStats = async (req: Request, res: Response) => {
    try {
        const allCampaigns = await db.query.campaigns.findMany();

        const start = new Date();
        start.setDate(start.getDate() - 30);
        const recentOrders = await db.select().from(orders).where(gte(orders.createdAt, start)).orderBy(desc(orders.createdAt));

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
    return (row?.value as CampaignDispatchLog[]) || [];
};

const saveDispatchLogs = async (logs: CampaignDispatchLog[], updatedBy?: string) => {
    const payload = logs.slice(0, 200);
    await db.insert(settings).values({
        key: CAMPAIGN_DISPATCH_LOG_KEY,
        value: payload as any,
        category: 'marketing',
        updatedBy: updatedBy || 'system',
        updatedAt: new Date(),
    }).onConflictDoUpdate({
        target: settings.key,
        set: {
            value: payload as any,
            category: 'marketing',
            updatedBy: updatedBy || 'system',
            updatedAt: new Date(),
        },
    });
};

const normalizePhone = (value: string) => String(value || '').replace(/[^\d+]/g, '').trim();

const collectRecipientPhones = async (input: {
    customerIds?: string[];
    phones?: string[];
}) => {
    const direct = Array.isArray(input.phones) ? input.phones.map(normalizePhone).filter(Boolean) : [];
    const byCustomerIds = Array.isArray(input.customerIds) ? input.customerIds.map((id) => String(id).trim()).filter(Boolean) : [];
    let customerPhones: string[] = [];
    if (byCustomerIds.length > 0) {
        const rows = await db.select({ phone: customers.phone }).from(customers).where(inArray(customers.id, byCustomerIds));
        customerPhones = rows.map((r) => normalizePhone(String(r.phone || ''))).filter(Boolean);
    }
    const unique = Array.from(new Set([...direct, ...customerPhones]));
    return unique.slice(0, 500); // MAX_DISPATCH_RECIPIENTS
};

export const dispatchCampaign = async (req: Request, res: Response) => {
    try {
        const id = String(req.params?.id || '').trim();
        if (!id) return res.status(400).json({ error: 'CAMPAIGN_ID_REQUIRED' });

        const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.id, id) });
        if (!campaign) return res.status(404).json({ error: 'CAMPAIGN_NOT_FOUND' });

        const dryRun = String(req.body?.mode || '').toUpperCase() === 'DRY_RUN';
        const recipientPhones = await collectRecipientPhones({
            customerIds: Array.isArray(req.body?.customerIds) ? req.body.customerIds : [],
            phones: Array.isArray(req.body?.phones) ? req.body.phones : [],
        });

        if (recipientPhones.length === 0) {
            // IF no explicit recipients passed, default simulate targeting all customer DB (max 500)
            const allCust = await db.query.customers.findMany({ limit: 500 });
            allCust.forEach(c => {
                if (c.phone) recipientPhones.push(normalizePhone(c.phone));
            });
            if (recipientPhones.length === 0) return res.status(400).json({ error: 'CAMPAIGN_RECIPIENTS_REQUIRED' });
        }

        const message = String(req.body?.message || campaign.content || `Offer from ${campaign.name}`).trim();
        if (!message) return res.status(400).json({ error: 'CAMPAIGN_MESSAGE_REQUIRED' });

        let sent = 0;
        let failed = 0;
        const startedAt = new Date().toISOString();

        if (!dryRun) {
            if (campaign.type === 'WHATSAPP') {
                for (const phone of recipientPhones) {
                    try {
                        await sendWhatsAppText({ to: phone, text: message });
                        sent += 1;
                    } catch {
                        failed += 1;
                    }
                }
            } else {
                // Placeholder for SMS/Email/Push
                sent = recipientPhones.length;
            }
        } else {
            sent = recipientPhones.length;
        }

        const newReach = Number(campaign.reach || 0) + sent;
        const newStatus = campaign.status === 'SCHEDULED' ? 'ACTIVE' : campaign.status;

        await db.update(campaigns).set({
            reach: newReach,
            status: newStatus,
            updatedAt: new Date()
        }).where(eq(campaigns.id, campaign.id));

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

        return res.json({
            ok: true,
            campaignId: campaign.id,
            method: campaign.type,
            dryRun,
            recipients: recipientPhones.length,
            sent,
            failed,
            dispatchId: dispatchLog.id,
        });
    } catch (error: any) {
        logger.error({ err: error }, 'Campaign dispatch error');
        return res.status(500).json({ error: error.message || 'CAMPAIGN_DISPATCH_FAILED' });
    }
};
