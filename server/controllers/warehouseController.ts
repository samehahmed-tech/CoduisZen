import { Request, Response } from 'express';
import { db } from '../db';
import { warehouses } from '../../src/db/schema';
import { asc } from 'drizzle-orm';

export const getWarehouses = async (req: Request, res: Response) => {
    try {
        const all = await db.select().from(warehouses).orderBy(asc(warehouses.name));

        const result = all.map(w => ({
            id: w.id,
            name: w.name,
            name_ar: w.nameAr ?? null,
            branch_id: w.branchId,
            type: w.type,
            is_active: w.isActive !== false,
            parent_id: w.parentId ?? null,
        }));

        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createWarehouse = async (req: Request, res: Response) => {
    try {
        const body = req.body || {};

        if (!body.name) {
            return res.status(400).json({ error: 'name is required' });
        }

        const [created] = await db.insert(warehouses).values({
            id: body.id || `WH-${Date.now()}`,
            name: body.name,
            nameAr: body.name_ar,
            branchId: body.branch_id,
            type: body.type || 'MAIN',
            parentId: body.parent_id,
            isActive: body.is_active !== false,
            createdAt: new Date(),
        }).returning();

        res.status(201).json(created);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
