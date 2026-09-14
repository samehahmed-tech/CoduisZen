import { Request, Response } from 'express';
import { db } from '../db';
import { warehouses, inventoryStock } from '../../src/db/schema';
import { asc, eq } from 'drizzle-orm';
import { createSignedAuditLog } from '../services/auditService';

export const getWarehouses = async (req: Request, res: Response) => {
    try {
        const all = await db.select().from(warehouses).where(req.effectiveBranchId ? eq(warehouses.branchId, req.effectiveBranchId) : undefined).orderBy(asc(warehouses.name));

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

        const branchId = body.branch_id ?? body.branchId ?? req.effectiveBranchId;
        if (!branchId && req.user?.role !== 'SUPER_ADMIN') return res.status(400).json({ error: 'BRANCH_ID_REQUIRED' });
        const [created] = await db.insert(warehouses).output().values({
            id: body.id || `WH-${Date.now()}`,
            name: body.name,
            nameAr: body.name_ar ?? body.nameAr,
            branchId,
            type: body.type || 'MAIN',
            parentId: body.parent_id ?? body.parentId,
            isActive: (body.is_active ?? body.isActive) !== false,
            createdAt: new Date(),
        });

        await createSignedAuditLog({ eventType: 'WAREHOUSE_CREATED', userId: req.user?.id || 'system', branchId: branchId || null, payload: { warehouseId: created.id, name: created.name }, reason: 'Warehouse created', sourceDevice: req.headers['user-agent'] || 'unknown', requestId: req.headers['x-request-id'] as string || `req-${Date.now()}` });
        res.status(201).json(created);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateWarehouse = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ error: 'WAREHOUSE_ID_REQUIRED' });
        const body = req.body || {};
        const [current] = await db.select().from(warehouses).where(eq(warehouses.id, id));
        if (!current) return res.status(404).json({ error: 'WAREHOUSE_NOT_FOUND' });
        if (req.effectiveBranchId && current.branchId !== req.effectiveBranchId) return res.status(403).json({ error: 'BRANCH_MISMATCH' });
        const name = body.name !== undefined ? String(body.name).trim() : current.name;
        if (!name) return res.status(400).json({ error: 'WAREHOUSE_NAME_REQUIRED' });

        const [updated] = await db.update(warehouses).set({
            name,
            nameAr: body.name_ar ?? body.nameAr ?? current.nameAr,
            branchId: body.branch_id ?? body.branchId ?? current.branchId,
            type: body.type ?? current.type,
            parentId: body.parent_id ?? body.parentId ?? current.parentId,
            isActive: body.is_active ?? body.isActive ?? current.isActive,
        }).output().where(eq(warehouses.id, id));
        await createSignedAuditLog({ eventType: 'WAREHOUSE_UPDATED', userId: req.user?.id || 'system', branchId: updated?.branchId || current.branchId || null, payload: { warehouseId: id, before: current, after: updated }, reason: 'Warehouse details updated', sourceDevice: req.headers['user-agent'] || 'unknown', requestId: req.headers['x-request-id'] as string || `req-${Date.now()}` });
        res.json(updated);
    } catch (error: any) {
        res.status(400).json({ error: error.message || 'WAREHOUSE_UPDATE_FAILED' });
    }
};

// Warehouse removal is deliberately a soft delete. Stock movements, batches,
// purchases and production records can reference the warehouse historically.
export const deactivateWarehouse = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ error: 'WAREHOUSE_ID_REQUIRED' });
        const [current] = await db.select().from(warehouses).where(eq(warehouses.id, id));
        if (!current) return res.status(404).json({ error: 'WAREHOUSE_NOT_FOUND' });
        if (req.effectiveBranchId && current.branchId !== req.effectiveBranchId) return res.status(403).json({ error: 'BRANCH_MISMATCH' });
        const stockRows = await db.select({ quantity: inventoryStock.quantity }).from(inventoryStock).where(eq(inventoryStock.warehouseId, id));
        if (stockRows.some(row => Number(row.quantity || 0) !== 0)) return res.status(409).json({ error: 'WAREHOUSE_STOCK_NOT_EMPTY' });
        await db.update(warehouses).set({ isActive: false }).where(eq(warehouses.id, id));
        await createSignedAuditLog({ eventType: 'WAREHOUSE_ARCHIVED', userId: req.user?.id || 'system', branchId: current.branchId || null, payload: { warehouseId: id, name: current.name }, reason: 'Warehouse archived after stock validation', sourceDevice: req.headers['user-agent'] || 'unknown', requestId: req.headers['x-request-id'] as string || `req-${Date.now()}` });
        res.json({ success: true, id, isActive: false });
    } catch (error: any) {
        res.status(400).json({ error: error.message || 'WAREHOUSE_DELETE_FAILED' });
    }
};
