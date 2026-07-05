import { Request, Response } from 'express';
import { db } from '../db';
import { deliveryPlatforms } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import logger from '../utils/logger';

export const getPlatforms = async (_req: Request, res: Response) => {
    try {
        const platforms = await db.query.deliveryPlatforms.findMany({
            orderBy: (platforms, { desc }) => [desc(platforms.createdAt)],
        });
        res.json(platforms);
    } catch (error: any) {
        logger.error({ err: error }, 'Error in delivery platforms operation');
        res.status(500).json({ error: 'Failed to fetch platforms' });
    }
};

export const createPlatform = async (req: Request, res: Response) => {
    try {
        const body = req.body || {};

        const [created] = await db.insert(deliveryPlatforms).values({
            id: body.id || `PLAT-${nanoid(8)}`,
            name: body.name || 'New Platform',
            isActive: body.isActive !== undefined ? body.isActive : true,
            feePercentage: Number(body.feePercentage || 0),
            applyFeesToMenuPrice: Boolean(body.applyFeesToMenuPrice),
            priceMarkupPercentage: Number(body.priceMarkupPercentage || 0),
            priceMarkupFixed: Number(body.priceMarkupFixed || 0),
            integrationType: body.integrationType || 'MANUAL',
        }).returning();

        res.status(201).json(created);
    } catch (error: any) {
        logger.error({ err: error }, 'Error creating delivery platform');
        res.status(500).json({ error: 'Failed to create platform' });
    }
};

export const updatePlatform = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const body = req.body || {};

        const [updated] = await db.update(deliveryPlatforms).set({
            name: body.name,
            isActive: body.isActive,
            feePercentage: body.feePercentage !== undefined ? Number(body.feePercentage) : undefined,
            applyFeesToMenuPrice: body.applyFeesToMenuPrice !== undefined ? Boolean(body.applyFeesToMenuPrice) : undefined,
            priceMarkupPercentage: body.priceMarkupPercentage !== undefined ? Number(body.priceMarkupPercentage) : undefined,
            priceMarkupFixed: body.priceMarkupFixed !== undefined ? Number(body.priceMarkupFixed) : undefined,
            integrationType: body.integrationType,
            updatedAt: new Date(),
        })
            .where(eq(deliveryPlatforms.id, id))
            .returning();

        if (!updated) return res.status(404).json({ error: 'Platform not found' });

        res.json(updated);
    } catch (error: any) {
        logger.error({ err: error }, 'Error updating delivery platform');
        res.status(500).json({ error: 'Failed to update platform' });
    }
};

export const deletePlatform = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;

        // Check if there are active menu items targeting this platform? Not strictly enforced at DB level now, 
        // as targetPlatforms are in JSON arrays on menu categories/items. 
        // We'll just softly delete it or actually delete it since it's configuration.
        await db.delete(deliveryPlatforms).where(eq(deliveryPlatforms.id, id));
        res.json({ success: true });
    } catch (error: any) {
        logger.error({ err: error }, 'Error deleting delivery platform');
        res.status(500).json({ error: 'Failed to delete platform' });
    }
};
