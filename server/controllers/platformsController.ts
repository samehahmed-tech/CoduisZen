import { Request, Response } from 'express';
import { db } from '../db';
import { deliveryPlatforms } from '../../src/db/schema';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import logger from '../utils/logger';
import { createSignedAuditLog } from '../services/auditService';

let apiKeyColumnReady: Promise<unknown> | null = null;
const ensureApiKeyColumn = () => {
    if (!apiKeyColumnReady) {
        apiKeyColumnReady = db.execute(sql`
            IF COL_LENGTH('delivery_platforms', 'api_key') IS NULL
                ALTER TABLE delivery_platforms ADD api_key nvarchar(500) NULL
        `).then(() => undefined).catch((err: any) => {
            apiKeyColumnReady = null;
            throw err;
        });
    }
    return apiKeyColumnReady;
};

const maskRow = (row: any) => {
    if (!row || typeof row !== 'object') return row;
    const { apiKey, ...rest } = row;
    return { ...rest, apiKeySet: Boolean(apiKey) };
};

const auditPlatformMutation = (req: Request, eventType: string, payload: Record<string, unknown>, after?: Record<string, unknown>) => createSignedAuditLog({
    eventType,
    userId: req.user?.id || 'system',
    userRole: req.user?.role,
    branchId: req.effectiveBranchId || req.user?.branchId || null,
    requestId: req.requestId,
    sourceDevice: req.headers['user-agent'],
    payload,
    after,
    reason: `Delivery platform mutation: ${eventType}`,
});

export const getPlatforms = async (_req: Request, res: Response) => {
    try {
        await ensureApiKeyColumn().catch(() => {});
        const platforms = await db.query.deliveryPlatforms.findMany({
            orderBy: (platforms, { desc }) => [desc(platforms.createdAt)],
        });
        res.json(platforms.map(maskRow));
    } catch (error: any) {
        logger.error({ err: error }, 'Error in delivery platforms operation');
        res.status(500).json({ error: 'Failed to fetch platforms' });
    }
};

export const createPlatform = async (req: Request, res: Response) => {
    try {
        const body = req.body || {};

        await ensureApiKeyColumn();
        const apiKey = String(body.apiKey || '').trim() || null;

        const [created] = await db.insert(deliveryPlatforms).output().values({
            id: body.id || `PLAT-${nanoid(8)}`,
            name: body.name || 'New Platform',
            isActive: body.isActive !== undefined ? body.isActive : true,
            feePercentage: Number(body.feePercentage || 0),
            applyFeesToMenuPrice: Boolean(body.applyFeesToMenuPrice),
            priceMarkupPercentage: Number(body.priceMarkupPercentage || 0),
            priceMarkupFixed: Number(body.priceMarkupFixed || 0),
            integrationType: body.integrationType || 'MANUAL',
            ...(apiKey ? { apiKey } : {}),
        });

        await auditPlatformMutation(req, 'DELIVERY_PLATFORM_CREATED', { platformId: created?.id || null, integrationType: created?.integrationType || null, apiKeySet: Boolean(apiKey) }, { active: created?.isActive !== false });
        res.status(201).json(maskRow(created));
    } catch (error: any) {
        logger.error({ err: error }, 'Error creating delivery platform');
        res.status(500).json({ error: 'Failed to create platform' });
    }
};

export const updatePlatform = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const body = req.body || {};

        await ensureApiKeyColumn();
        const patch: any = {
            updatedAt: new Date(),
        };
        if (body.name !== undefined) { patch.name = body.name; }
        if (body.isActive !== undefined) { patch.isActive = body.isActive; }
        if (body.feePercentage !== undefined) patch.feePercentage = Number(body.feePercentage);
        if (body.applyFeesToMenuPrice !== undefined) patch.applyFeesToMenuPrice = Boolean(body.applyFeesToMenuPrice);
        if (body.priceMarkupPercentage !== undefined) patch.priceMarkupPercentage = Number(body.priceMarkupPercentage);
        if (body.priceMarkupFixed !== undefined) patch.priceMarkupFixed = Number(body.priceMarkupFixed);
        if (body.integrationType !== undefined) patch.integrationType = body.integrationType;
        // Empty string clears the key; absent leaves it untouched.
        if (body.apiKey !== undefined) patch.apiKey = String(body.apiKey || '').trim() || null;

        const [updated] = await db.update(deliveryPlatforms).set(patch)
            .output()
            .where(eq(deliveryPlatforms.id, id));

        if (!updated) return res.status(404).json({ error: 'Platform not found' });

        await auditPlatformMutation(req, 'DELIVERY_PLATFORM_UPDATED', { platformId: updated.id, changedKeys: Object.keys(body).filter((key) => key !== 'apiKey').sort(), apiKeyChanged: body.apiKey !== undefined }, { active: updated.isActive !== false });
        res.json(maskRow(updated));
    } catch (error: any) {
        logger.error({ err: error }, 'Error updating delivery platform');
        res.status(500).json({ error: 'Failed to update platform' });
    }
};

export const deletePlatform = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;

        // Never hard-delete: past orders reference the platform by key, and
        // menu routing JSON may too. "Delete" deactivates (pausable, audited,
        // restorable) instead of destroying history.
        const [updated] = await db.update(deliveryPlatforms).set({
            isActive: false,
            updatedAt: new Date(),
        }).output().where(eq(deliveryPlatforms.id, id));
        if (!updated) return res.status(404).json({ error: 'Platform not found' });
        await auditPlatformMutation(req, 'DELIVERY_PLATFORM_DEACTIVATED', { platformId: updated.id }, { active: false });
        res.json({ success: true, deactivated: true, platform: maskRow(updated) });
    } catch (error: any) {
        logger.error({ err: error }, 'Error deleting delivery platform');
        res.status(500).json({ error: 'Failed to delete platform' });
    }
};
