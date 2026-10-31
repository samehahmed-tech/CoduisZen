import { Request, Response } from 'express';
import { db, pool } from '../db';
import { suppliers } from '../../src/db/schema';
import { and, eq, desc, isNull, or } from 'drizzle-orm';
import { getStringParam } from '../utils/request';
import { createSignedAuditLog } from '../services/auditService';

let supplierSchemaPromise: Promise<void> | undefined;
export const ensureSupplierSchema = async () => {
    if (!supplierSchemaPromise) {
        supplierSchemaPromise = pool.query(`
            IF OBJECT_ID(N'dbo.suppliers', N'U') IS NOT NULL
               AND COL_LENGTH(N'dbo.suppliers', N'branch_id') IS NULL
                ALTER TABLE dbo.suppliers ADD branch_id nvarchar(255) NULL;
        `).then(() => undefined).catch((error) => {
            supplierSchemaPromise = undefined;
            throw error;
        });
    }
    await supplierSchemaPromise;
};

const isHeadOffice = (req: Request) => ['SUPER_ADMIN', 'OWNER', 'CEO', 'COO', 'GENERAL_MANAGER'].includes(String(req.user?.role || ''));
const visibleSupplierScope = (req: Request) => req.effectiveBranchId
    ? or(isNull(suppliers.branchId), eq(suppliers.branchId, req.effectiveBranchId))
    : undefined;
const writableSupplierScope = (req: Request) => {
    if (!req.effectiveBranchId || isHeadOffice(req)) return undefined;
    return eq(suppliers.branchId, req.effectiveBranchId);
};

/**
 * Get all suppliers
 */
export const getSuppliers = async (req: Request, res: Response) => {
    try {
        await ensureSupplierSchema();
        const active = getStringParam(req.query.active);

        const conditions: any[] = [];
        const scope = visibleSupplierScope(req);
        if (scope) conditions.push(scope);
        if (active === 'true') conditions.push(eq(suppliers.isActive, true));

        const base = db.select().from(suppliers);
        const query = conditions.length ? base.where(and(...conditions)) : base;
        const allSuppliers = await query.orderBy(desc(suppliers.createdAt));
        res.json(allSuppliers);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Get single supplier by ID
 */
export const getSupplierById = async (req: Request, res: Response) => {
    try {
        await ensureSupplierSchema();
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'SUPPLIER_ID_REQUIRED' });
        const scope = visibleSupplierScope(req);
        const [supplier] = await db.select().from(suppliers).where(scope ? and(eq(suppliers.id, id), scope) : eq(suppliers.id, id));

        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found' });
        }

        res.json(supplier);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Create new supplier
 */
export const createSupplier = async (req: Request, res: Response) => {
    try {
        await ensureSupplierSchema();
        const { id, name, contactPerson, phone, email, address, category, paymentTerms, notes } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Supplier name is required' });
        }

        const [newSupplier] = await db.insert(suppliers).output().values({
            id: id || `SUP-${Date.now()}`,
            branchId: req.effectiveBranchId || null,
            name,
            contactPerson,
            phone,
            email,
            address,
            category,
            paymentTerms,
            notes,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        await createSignedAuditLog({
            eventType: 'SUPPLIER_CREATED',
            userId: req.user?.id || 'system',
            userRole: req.user?.role,
            branchId: req.effectiveBranchId,
            requestId: req.requestId,
            sourceDevice: req.headers['user-agent'],
            payload: { supplierId: newSupplier.id, category, hasPaymentTerms: Boolean(paymentTerms) },
            after: { supplierId: newSupplier.id, active: true },
            reason: 'Supplier created',
        });

        res.status(201).json(newSupplier);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Update supplier
 */
export const updateSupplier = async (req: Request, res: Response) => {
    try {
        await ensureSupplierSchema();
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'SUPPLIER_ID_REQUIRED' });
        const updates = req.body;
        const scope = writableSupplierScope(req);
        const currentWhere = scope ? and(eq(suppliers.id, id), scope) : eq(suppliers.id, id);
        const [current] = await db.select().top(1).from(suppliers).where(currentWhere);
        if (!current) return res.status(404).json({ error: 'Supplier not found' });
        const changedFields = Object.keys(updates).filter((key) => key !== 'id' && updates[key] !== undefined);
        delete updates.id;
        delete updates.branchId;
        delete updates.branch_id;

        const [updated] = await db.update(suppliers)
            .set({
                ...updates,
                updatedAt: new Date(),
            })
            .output()
            .where(currentWhere);

        if (!updated) return res.status(404).json({ error: 'Supplier not found' });

        await createSignedAuditLog({
            eventType: 'SUPPLIER_UPDATED',
            userId: req.user?.id || 'system',
            userRole: req.user?.role,
            branchId: req.effectiveBranchId,
            requestId: req.requestId,
            sourceDevice: req.headers['user-agent'],
            payload: { supplierId: id, changedFields },
            reason: 'Supplier updated',
        });

        res.json(updated);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Deactivate supplier (soft delete)
 */
export const deactivateSupplier = async (req: Request, res: Response) => {
    try {
        await ensureSupplierSchema();
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'SUPPLIER_ID_REQUIRED' });
        const scope = writableSupplierScope(req);
        const where = scope ? and(eq(suppliers.id, id), scope) : eq(suppliers.id, id);

        const [updated] = await db.update(suppliers)
            .set({ isActive: false, updatedAt: new Date() })
            .output()
            .where(where);

        if (!updated) {
            return res.status(404).json({ error: 'Supplier not found' });
        }

        await createSignedAuditLog({
            eventType: 'SUPPLIER_DEACTIVATED',
            userId: req.user?.id || 'system',
            userRole: req.user?.role,
            branchId: req.effectiveBranchId,
            requestId: req.requestId,
            sourceDevice: req.headers['user-agent'],
            payload: { supplierId: id },
            before: { active: true },
            after: { active: false },
            reason: 'Supplier deactivated',
        });
        res.json({ success: true, message: 'Supplier deactivated' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
