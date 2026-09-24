import { Request, Response } from 'express';
import { db } from '../db';
import {
    auditLogs,
    butcheryOperations,
    butcheryOutputs,
    butcheryTemplateLines,
    butcheryTemplates,
    inventoryBatches,
    inventoryItems,
    inventoryStock,
    stockMovements,
    warehouses,
} from '../../src/db/schema';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { inventoryService } from '../services/inventoryService';
import { postProductionCompletionEntry, postWastageEntry } from '../services/financePostingService';
import { createSignedAuditLog } from '../services/auditService';
import {
    allocateCost,
    calcUsableYieldPct,
    calcWastePct,
    calcYieldVariance,
    toSourceUnit,
    validateButcheryInput,
    type ButcheryOutputType,
} from '../services/butcheryService';
import { getStringParam } from '../utils/request';
import { getIO } from '../socket';

export const ensureButcheryTables = async () => {
    await db.execute(sql`
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'butchery_operations')
        CREATE TABLE butchery_operations (
            id nvarchar(255) PRIMARY KEY,
            reference nvarchar(255) NOT NULL,
            branch_id nvarchar(max),
            warehouse_id nvarchar(max) NOT NULL,
            source_item_id nvarchar(max) NOT NULL,
            source_qty real NOT NULL,
            source_unit nvarchar(max) NOT NULL,
            source_unit_cost real DEFAULT 0,
            source_total_cost real DEFAULT 0,
            template_id nvarchar(max),
            status nvarchar(max) DEFAULT 'DRAFT' NOT NULL,
            notes nvarchar(max),
            waste_reason nvarchar(max),
            created_by nvarchar(max),
            posted_by nvarchar(max),
            cancelled_by nvarchar(max),
            posted_at datetime2,
            cancelled_at datetime2,
            created_at datetime2 DEFAULT GETDATE(),
            updated_at datetime2 DEFAULT GETDATE()
        )
    `);
    await db.execute(sql`
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'butchery_outputs')
        CREATE TABLE butchery_outputs (
            id int IDENTITY(1,1) PRIMARY KEY,
            operation_id nvarchar(255) NOT NULL,
            item_id nvarchar(max),
            quantity real NOT NULL,
            unit nvarchar(max) NOT NULL,
            output_type nvarchar(max) DEFAULT 'USABLE' NOT NULL,
            yield_pct real DEFAULT 0,
            allocated_cost real DEFAULT 0,
            total_allocated_cost real DEFAULT 0,
            warehouse_id nvarchar(max),
            waste_reason nvarchar(max)
        )
    `);
    await db.execute(sql`
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'butchery_templates')
        CREATE TABLE butchery_templates (
            id nvarchar(255) PRIMARY KEY,
            name nvarchar(max) NOT NULL,
            branch_id nvarchar(max),
            source_item_id nvarchar(max) NOT NULL,
            is_active bit DEFAULT 1,
            created_by nvarchar(max),
            created_at datetime2 DEFAULT GETDATE(),
            updated_at datetime2 DEFAULT GETDATE()
        )
    `);
    await db.execute(sql`
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'butchery_template_lines')
        CREATE TABLE butchery_template_lines (
            id int IDENTITY(1,1) PRIMARY KEY,
            template_id nvarchar(255) NOT NULL,
            item_id nvarchar(max),
            expected_pct real NOT NULL,
            output_type nvarchar(max) DEFAULT 'USABLE' NOT NULL,
            unit nvarchar(max)
        )
    `);
    await db.execute(sql`
        IF COL_LENGTH('dbo.butchery_operations', 'reference') IS NOT NULL
        AND NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'butchery_operations_reference_uq')
        CREATE UNIQUE INDEX butchery_operations_reference_uq ON dbo.butchery_operations(reference)
    `);
};

const OUTPUT_TYPES: ButcheryOutputType[] = ['USABLE', 'BY_PRODUCT', 'WASTE'];

type NormalizedButcheryOutput = {
    itemId?: string;
    quantity: number;
    unit: string;
    outputType: ButcheryOutputType;
    warehouseId?: string;
    wasteReason?: string;
};

const normalizeOutputs = (raw: any): NormalizedButcheryOutput[] => {
    if (!Array.isArray(raw)) return [];
    return raw.map((o: any) => ({
        itemId: o?.itemId ? String(o.itemId) : undefined,
        quantity: Number(o?.quantity),
        unit: String(o?.unit || '').trim(),
        outputType: (OUTPUT_TYPES.includes(o?.outputType) ? o.outputType : 'USABLE') as ButcheryOutputType,
        warehouseId: o?.warehouseId ? String(o.warehouseId) : undefined,
        wasteReason: o?.wasteReason ? String(o.wasteReason).slice(0, 500) : undefined,
    }));
};

const summarize = (sourceQty: number, sourceUnit: string, outputs: { quantity: number; unit: string; outputType: ButcheryOutputType }[]) => {
    const converted = outputs.map((o) => {
        try {
            return { ...o, inSource: toSourceUnit(Number(o.quantity), o.unit, sourceUnit) };
        } catch {
            return { ...o, inSource: 0 };
        }
    });
    return {
        usableYieldPct: calcUsableYieldPct(converted.map((c) => ({ quantityInSourceUnit: c.inSource, outputType: c.outputType })), sourceQty),
        wastePct: calcWastePct(converted.map((c) => ({ quantityInSourceUnit: c.inSource, outputType: c.outputType })), sourceQty),
        totalOutputInSourceUnit: converted.reduce((s, c) => s + c.inSource, 0),
    };
};

const buildDetail = async (id: string) => {
    const [op] = await db.select().from(butcheryOperations).where(eq(butcheryOperations.id, id));
    if (!op) return null;
    const lines = await db.select().from(butcheryOutputs).where(eq(butcheryOutputs.operationId, id));
    const [source] = await db.select({ name: inventoryItems.name, nameAr: inventoryItems.nameAr }).from(inventoryItems).where(eq(inventoryItems.id, op.sourceItemId));
    const [warehouse] = await db.select({ name: warehouses.name, branchId: warehouses.branchId }).from(warehouses).where(eq(warehouses.id, op.warehouseId));
    let variance: { itemId?: string; expectedPct: number; actualPct: number; variancePct: number }[] | undefined;
    if (op.templateId) {
        const templateLines = await db.select().from(butcheryTemplateLines).where(eq(butcheryTemplateLines.templateId, op.templateId));
        if (templateLines.length > 0) {
            const byType = new Map<string, number>();
            for (const l of lines) {
                const key = `${l.itemId || 'WASTE'}|${l.outputType}`;
                byType.set(key, Number(l.yieldPct || 0));
            }
            variance = templateLines.map((t) => {
                const actual = byType.get(`${t.itemId || 'WASTE'}|${t.outputType}`) ?? 0;
                return {
                    itemId: t.itemId || undefined,
                    expectedPct: Number(t.expectedPct || 0),
                    actualPct: actual,
                    variancePct: calcYieldVariance(Number(t.expectedPct || 0), actual),
                };
            });
        }
    }
    const summary = summarize(Number(op.sourceQty || 0), String(op.sourceUnit || ''), lines.map((l) => ({
        quantity: Number(l.quantity || 0),
        unit: String(l.unit || ''),
        outputType: (l.outputType as ButcheryOutputType) || 'USABLE',
    })));
    const movements = await db.select({
        id: stockMovements.id,
        itemId: stockMovements.itemId,
        type: stockMovements.type,
        quantity: stockMovements.quantity,
        reason: stockMovements.reason,
        createdAt: stockMovements.createdAt,
    }).from(stockMovements).where(eq(stockMovements.referenceId, id)).orderBy(desc(stockMovements.createdAt));
    return {
        id: op.id,
        reference: op.reference,
        branchId: op.branchId || (warehouse as any)?.branchId || undefined,
        warehouseId: op.warehouseId,
        warehouseName: (warehouse as any)?.name || op.warehouseId,
        sourceItemId: op.sourceItemId,
        sourceItemName: (source as any)?.name || op.sourceItemId,
        sourceItemNameAr: (source as any)?.nameAr || (source as any)?.name || op.sourceItemId,
        sourceQty: Number(op.sourceQty || 0),
        sourceUnit: op.sourceUnit,
        sourceUnitCost: Number(op.sourceUnitCost || 0),
        sourceTotalCost: Number(op.sourceTotalCost || 0),
        templateId: op.templateId || undefined,
        status: op.status,
        notes: op.notes || undefined,
        wasteReason: op.wasteReason || undefined,
        createdBy: op.createdBy || 'system',
        postedBy: op.postedBy || undefined,
        cancelledBy: op.cancelledBy || undefined,
        postedAt: (op.postedAt as any)?.toISOString?.(),
        cancelledAt: (op.cancelledAt as any)?.toISOString?.(),
        createdAt: (op.createdAt as any)?.toISOString?.() || new Date().toISOString(),
        ...summary,
        outputs: lines.map((l) => ({
            id: l.id,
            itemId: l.itemId || undefined,
            quantity: Number(l.quantity || 0),
            unit: l.unit,
            outputType: l.outputType,
            yieldPct: Number(l.yieldPct || 0),
            allocatedCost: Number(l.allocatedCost || 0),
            totalAllocatedCost: Number(l.totalAllocatedCost || 0),
            warehouseId: l.warehouseId || undefined,
            wasteReason: l.wasteReason || undefined,
        })),
        variance,
        movements: movements.map((m) => ({
            id: m.id,
            itemId: m.itemId,
            type: m.type,
            quantity: Number(m.quantity || 0),
            reason: m.reason || '',
            createdAt: (m.createdAt as any)?.toISOString?.() || '',
        })),
    };
};

export const getButcheryOperations = async (req: Request, res: Response) => {
    try {
        await ensureButcheryTables();
        const status = getStringParam(req.query.status);
        const branchId = req.effectiveBranchId || getStringParam(req.query.branchId);
        const sourceItemId = getStringParam(req.query.sourceItemId);
        const rows = await db.select().from(butcheryOperations).orderBy(desc(butcheryOperations.createdAt));
        const filtered = rows.filter((o) => {
            if (status && o.status !== status) return false;
            if (branchId && o.branchId !== branchId) return false;
            if (sourceItemId && o.sourceItemId !== sourceItemId) return false;
            return true;
        });
        const details = await Promise.all(filtered.slice(0, 200).map((o) => buildDetail(o.id)));
        res.json(details.filter(Boolean));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getButcheryOperationById = async (req: Request, res: Response) => {
    try {
        await ensureButcheryTables();
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'BUTCHERY_ID_REQUIRED' });
        const detail = await buildDetail(id);
        if (!detail) return res.status(404).json({ error: 'Butchery operation not found' });
        if (req.effectiveBranchId && detail.branchId && detail.branchId !== req.effectiveBranchId) {
            return res.status(403).json({ error: 'BRANCH_MISMATCH' });
        }
        res.json(detail);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createButcheryOperation = async (req: Request, res: Response) => {
    try {
        await ensureButcheryTables();
        const actorId = req.user?.id || 'system';
        const { sourceItemId, sourceQty, sourceUnit, warehouseId, templateId, notes, wasteReason, outputs } = req.body || {};
        const qty = Number(sourceQty);
        if (!sourceItemId) return res.status(400).json({ error: 'SOURCE_ITEM_REQUIRED' });
        const [sourceItem] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, String(sourceItemId)));
        if (!sourceItem) return res.status(404).json({ error: 'SOURCE_ITEM_NOT_FOUND' });
        if (sourceItem.isActive === false) return res.status(409).json({ error: 'SOURCE_ITEM_INACTIVE' });
        // Source unit falls back to the item's own stock unit (clients may omit it).
        const effectiveSourceUnit = String(sourceUnit || (sourceItem as any).unit || '').trim();
        if (!effectiveSourceUnit) return res.status(400).json({ error: 'SOURCE_UNIT_REQUIRED' });
        const normalized = normalizeOutputs(outputs);
        const validationError = validateButcheryInput(qty, effectiveSourceUnit, normalized);
        if (validationError) {
            return res.status(400).json({ error: validationError });
        }
        const [warehouse] = await db.select().from(warehouses).where(eq(warehouses.id, String(warehouseId || '')));
        if (!warehouse) return res.status(400).json({ error: 'WAREHOUSE_NOT_FOUND' });
        if (warehouse.isActive === false) return res.status(409).json({ error: 'WAREHOUSE_INACTIVE' });
        if (req.effectiveBranchId && warehouse.branchId !== req.effectiveBranchId) {
            return res.status(403).json({ error: 'BRANCH_MISMATCH' });
        }
        // Validate output items + UOM convertibility up front (fail fast in DRAFT).
        for (const o of normalized) {
            if (o.outputType !== 'WASTE') {
                const [item] = await db.select({ isActive: inventoryItems.isActive }).from(inventoryItems).where(eq(inventoryItems.id, String(o.itemId)));
                if (!item) return res.status(404).json({ error: `OUTPUT_ITEM_NOT_FOUND|item=${o.itemId}` });
                if (item.isActive === false) return res.status(409).json({ error: `OUTPUT_ITEM_INACTIVE|item=${o.itemId}` });
            }
            try {
                toSourceUnit(Number(o.quantity), o.unit, effectiveSourceUnit);
            } catch {
                return res.status(400).json({ error: `INCOMPATIBLE_UNITS|unit=${o.unit}|source=${effectiveSourceUnit}` });
            }
            if (o.warehouseId) {
                const [outWh] = await db.select().from(warehouses).where(eq(warehouses.id, String(o.warehouseId)));
                if (!outWh) return res.status(400).json({ error: `OUTPUT_WAREHOUSE_NOT_FOUND|warehouse=${o.warehouseId}` });
                if (req.effectiveBranchId && outWh.branchId !== req.effectiveBranchId) {
                    return res.status(403).json({ error: 'BRANCH_MISMATCH' });
                }
            }
        }

        const unitCost = Number(sourceItem.costPrice || 0);
        const totalCost = Math.round(qty * unitCost * 100) / 100;
        const allocated = allocateCost(qty, effectiveSourceUnit, totalCost, normalized);
        const rand = Math.floor(Math.random() * 100000);
        const id = `BUTCH-${Date.now()}-${rand}`;
        const reference = `BUTCH-${Date.now()}-${rand}`;
        await db.transaction(async (tx) => {
            await tx.insert(butcheryOperations).values({
                id,
                reference,
                branchId: warehouse.branchId || undefined,
                warehouseId: warehouse.id,
                sourceItemId: String(sourceItemId),
                sourceQty: qty,
                sourceUnit: effectiveSourceUnit,
                sourceUnitCost: unitCost,
                sourceTotalCost: totalCost,
                templateId: templateId ? String(templateId) : undefined,
                status: 'DRAFT',
                notes: notes ? String(notes).slice(0, 2000) : undefined,
                wasteReason: wasteReason ? String(wasteReason).slice(0, 500) : undefined,
                createdBy: actorId,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            if (allocated.length > 0) {
                await tx.insert(butcheryOutputs).values(allocated.map((o) => ({
                    operationId: id,
                    itemId: o.outputType === 'WASTE' ? (o.itemId || undefined) : String(o.itemId),
                    quantity: Number(o.quantity),
                    unit: o.unit,
                    outputType: o.outputType,
                    yieldPct: o.yieldPct,
                    allocatedCost: o.allocatedUnitCost,
                    totalAllocatedCost: o.totalAllocatedCost,
                    warehouseId: o.warehouseId ? String(o.warehouseId) : warehouse.id,
                    wasteReason: o.wasteReason,
                })));
            }
        });
        await createSignedAuditLog({
            eventType: 'BUTCHERY_CREATED',
            userId: actorId,
            branchId: warehouse.branchId || null,
            payload: { operationId: id, reference, sourceItemId, sourceQty: qty },
            reason: 'Butchery operation created',
        });
        res.status(201).json(await buildDetail(id));
    } catch (error: any) {
        const message = String(error?.message || 'BUTCHERY_CREATE_FAILED');
        if (message.startsWith('INCOMPATIBLE_UNITS') || message.startsWith('INVALID_UNIT_QUANTITY')) {
            return res.status(400).json({ error: message });
        }
        res.status(500).json({ error: message });
    }
};

export const updateButcheryOperation = async (req: Request, res: Response) => {
    try {
        await ensureButcheryTables();
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'BUTCHERY_ID_REQUIRED' });
        const actorId = req.user?.id || 'system';
        const [op] = await db.select().from(butcheryOperations).where(eq(butcheryOperations.id, id));
        if (!op) return res.status(404).json({ error: 'Butchery operation not found' });
        if (req.effectiveBranchId && op.branchId && op.branchId !== req.effectiveBranchId) {
            return res.status(403).json({ error: 'BRANCH_MISMATCH' });
        }
        if (op.status === 'CANCELLED') return res.status(400).json({ error: 'OPERATION_CANCELLED' });
        const body = req.body || {};
        const existingLines = await db.select().from(butcheryOutputs).where(eq(butcheryOutputs.operationId, id));

        // ---------- DRAFT: no stock moved yet — edit header/lines freely ----------
        if (op.status === 'DRAFT') {
            let sourceItemId = String(op.sourceItemId);
            let sourceUnit = String(op.sourceUnit);
            if (body.sourceItemId !== undefined && String(body.sourceItemId) !== sourceItemId) {
                const [nextSource] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, String(body.sourceItemId)));
                if (!nextSource) return res.status(404).json({ error: 'SOURCE_ITEM_NOT_FOUND' });
                if (nextSource.isActive === false) return res.status(409).json({ error: 'SOURCE_ITEM_INACTIVE' });
                sourceItemId = String(body.sourceItemId);
                sourceUnit = String((nextSource as any).unit || sourceUnit);
            }
            const newSourceQty = body.sourceQty !== undefined ? Number(body.sourceQty) : Number(op.sourceQty);
            if (!Number.isFinite(newSourceQty) || newSourceQty <= 0) return res.status(400).json({ error: 'INVALID_SOURCE_QTY' });
            const [sourceItem] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, sourceItemId));
            if (!sourceItem) return res.status(404).json({ error: 'SOURCE_ITEM_NOT_FOUND' });
            const newTotal = Math.round(newSourceQty * Number(sourceItem.costPrice || 0) * 100) / 100;
            const baseLines = body.outputs !== undefined
                ? normalizeOutputs(body.outputs)
                : existingLines.map((l) => ({
                    itemId: l.itemId || undefined,
                    quantity: Number(l.quantity || 0),
                    unit: String(l.unit || ''),
                    outputType: ((l.outputType as ButcheryOutputType) || 'USABLE'),
                    warehouseId: l.warehouseId || undefined,
                    wasteReason: l.wasteReason || undefined,
                }));
            const validationError = validateButcheryInput(newSourceQty, sourceUnit, baseLines);
            if (validationError) return res.status(400).json({ error: validationError });
            try {
                await validateOutputLines(baseLines, sourceUnit, req.effectiveBranchId);
            } catch (e: any) {
                return sendButcheryError(res, String(e?.message || 'OUTPUT_VALIDATION_FAILED'));
            }
            const allocated = allocateCost(newSourceQty, sourceUnit, newTotal, baseLines);
            const updates: Record<string, any> = {
                sourceItemId, sourceUnit, sourceQty: newSourceQty,
                sourceUnitCost: Number(sourceItem.costPrice || 0), sourceTotalCost: newTotal,
                updatedAt: new Date(),
            };
            if (body.notes !== undefined) updates.notes = body.notes === null ? null : String(body.notes).slice(0, 2000);
            if (body.wasteReason !== undefined) updates.wasteReason = body.wasteReason === null ? null : String(body.wasteReason).slice(0, 500);
            await db.transaction(async (tx) => {
                await tx.update(butcheryOperations).set(updates).where(eq(butcheryOperations.id, id));
                await tx.delete(butcheryOutputs).where(eq(butcheryOutputs.operationId, id));
                if (allocated.length > 0) {
                    await tx.insert(butcheryOutputs).values(allocated.map((o) => ({
                        operationId: id,
                        itemId: o.outputType === 'WASTE' ? (o.itemId || undefined) : String(o.itemId),
                        quantity: Number(o.quantity),
                        unit: o.unit,
                        outputType: o.outputType,
                        yieldPct: o.yieldPct,
                        allocatedCost: o.allocatedUnitCost,
                        totalAllocatedCost: o.totalAllocatedCost,
                        warehouseId: o.warehouseId ? String(o.warehouseId) : op.warehouseId,
                        wasteReason: o.wasteReason,
                    })));
                }
            });
            res.json(await buildDetail(id));
            return;
        }

        // ---------- POSTED: atomic reverse + re-post with corrected values ----------
        // Stock already moved, so a correction reverses the old posting and
        // applies the new one in ONE transaction: either everything (old
        // effects undone, new effects applied) commits, or nothing changes.
        // Fails with INSUFFICIENT_STOCK when outputs were already consumed.
        if (op.status !== 'POSTED') return res.status(400).json({ error: 'ONLY_DRAFT_OR_POSTED_EDITABLE' });
        if (body.sourceItemId !== undefined && String(body.sourceItemId) !== String(op.sourceItemId)) {
            return res.status(400).json({ error: 'SOURCE_ITEM_LOCKED_AFTER_POST' });
        }
        const newSourceQty = body.sourceQty !== undefined ? Number(body.sourceQty) : Number(op.sourceQty);
        if (!Number.isFinite(newSourceQty) || newSourceQty <= 0) return res.status(400).json({ error: 'INVALID_SOURCE_QTY' });
        const normalized = body.outputs !== undefined
            ? normalizeOutputs(body.outputs)
            : existingLines.map((l) => ({
                itemId: l.itemId || undefined,
                quantity: Number(l.quantity || 0),
                unit: String(l.unit || ''),
                outputType: ((l.outputType as ButcheryOutputType) || 'USABLE'),
                warehouseId: l.warehouseId || undefined,
                wasteReason: l.wasteReason || undefined,
            }));
        const validationError = validateButcheryInput(newSourceQty, String(op.sourceUnit), normalized);
        if (validationError) return res.status(400).json({ error: validationError });
        try {
            await validateOutputLines(normalized, String(op.sourceUnit), req.effectiveBranchId);
        } catch (e: any) {
            return sendButcheryError(res, String(e?.message || 'OUTPUT_VALIDATION_FAILED'));
        }
        const before = {
            sourceQty: Number(op.sourceQty || 0),
            sourceTotalCost: Number(op.sourceTotalCost || 0),
            outputs: existingLines.map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity || 0), unit: l.unit, outputType: l.outputType })),
        };
        let newTotal = 0;
        let financeStatus = 'skipped';
        let financeNote: string | undefined;
        try {
            await db.transaction(async (tx) => {
                const txLines = await tx.select().from(butcheryOutputs).where(eq(butcheryOutputs.operationId, id));
                await reversePostingTx(tx, op, txLines, actorId);
                const [src] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, op.sourceItemId));
                if (!src || src.isActive === false) throw new Error('SOURCE_ITEM_INACTIVE');
                const unitCost = Number((src as any).costPrice || 0);
                newTotal = Math.round(newSourceQty * unitCost * 100) / 100;
                const { allocated } = await applyPostingTx(tx, op, {
                    sourceQty: newSourceQty,
                    sourceUnit: String(op.sourceUnit),
                    sourceUnitCost: unitCost,
                    sourceTotalCost: newTotal,
                }, normalized, actorId);
                await tx.delete(butcheryOutputs).where(eq(butcheryOutputs.operationId, id));
                await tx.insert(butcheryOutputs).values(allocated.map((o) => ({
                    operationId: id,
                    itemId: o.outputType === 'WASTE' ? (o.itemId || undefined) : String(o.itemId),
                    quantity: Number(o.quantity),
                    unit: o.unit,
                    outputType: o.outputType,
                    yieldPct: o.yieldPct,
                    allocatedCost: o.allocatedUnitCost,
                    totalAllocatedCost: o.totalAllocatedCost,
                    warehouseId: o.warehouseId ? String(o.warehouseId) : op.warehouseId,
                    wasteReason: o.wasteReason,
                })));
                const headerUpdates: Record<string, any> = {
                    sourceQty: newSourceQty, sourceUnitCost: unitCost, sourceTotalCost: newTotal,
                    updatedAt: new Date(),
                };
                if (body.notes !== undefined) headerUpdates.notes = body.notes === null ? null : String(body.notes).slice(0, 2000);
                if (body.wasteReason !== undefined) headerUpdates.wasteReason = body.wasteReason === null ? null : String(body.wasteReason).slice(0, 500);
                await tx.update(butcheryOperations).set(headerUpdates).where(eq(butcheryOperations.id, id));
                await tx.insert(auditLogs).values({
                    eventType: 'BUTCHERY_EDITED',
                    userId: actorId,
                    branchId: op.branchId || null,
                    payload: {
                        operationId: id, reference: op.reference, before,
                        after: { sourceQty: newSourceQty, sourceTotalCost: newTotal },
                    },
                    reason: `Butchery corrected ${op.reference}`,
                    createdAt: new Date(),
                });
            });
        } catch (e: any) {
            return sendButcheryError(res, String(e?.message || 'BUTCHERY_EDIT_FAILED'));
        }
        // GL top-up for added value only; a reduced input value keeps the
        // original entry and is flagged for manual adjustment (no silent reversal).
        const delta = newTotal - Number(op.sourceTotalCost || 0);
        if (delta > 0.005) {
            const finance = await postProductionCompletionEntry({
                productionOrderId: id,
                amount: Math.round(delta * 100) / 100,
                branchId: op.branchId || undefined,
                userId: actorId,
            });
            financeStatus = (finance as any)?.status || 'skipped';
        } else if (delta < -0.005) {
            financeNote = 'INPUT_VALUE_REDUCED|MANUAL_GL_ADJUSTMENT_MAY_BE_NEEDED';
        }
        try {
            const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, op.warehouseId));
            if ((wh as any)?.branchId) getIO().to(`branch:${(wh as any).branchId}`).emit('stock:updated', { referenceId: id, type: 'BUTCHERY_EDITED' });
        } catch (e) {
            console.warn('Failed to emit stock:updated for butchery edit', e);
        }
        res.json({ ...(await buildDetail(id)), financeStatus, financeNote });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

const applyMacForInbound = async (tx: any, itemId: string, warehouseId: string, qty: number, unitCost: number, actorId: string, referenceId: string, reason: string) => {
    const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
    if (!item) throw new Error(`OUTPUT_ITEM_NOT_FOUND|item=${itemId}`);
    const stockRows = await tx.select().from(inventoryStock).where(eq(inventoryStock.itemId, itemId));
    const oldTotalQty = stockRows.reduce((s: number, r: any) => s + Number(r.quantity || 0), 0);
    const oldCost = Number((item as any).costPrice || 0);
    const newTotal = oldTotalQty + qty;
    const newAvg = newTotal > 0 ? (oldTotalQty * oldCost + qty * unitCost) / newTotal : unitCost;
    await tx.update(inventoryItems).set({ costPrice: newAvg, purchasePrice: (item as any).purchasePrice }).where(eq(inventoryItems.id, itemId));
    const [existing] = await tx.select().from(inventoryStock).where(and(eq(inventoryStock.itemId, itemId), eq(inventoryStock.warehouseId, warehouseId)));
    if (existing) {
        await tx.update(inventoryStock).set({ quantity: Number((existing as any).quantity || 0) + qty, lastUpdated: new Date() }).where(eq(inventoryStock.id, (existing as any).id));
    } else {
        await tx.insert(inventoryStock).values({ itemId, warehouseId, quantity: qty, lastUpdated: new Date() });
    }
    const [movement] = await tx.insert(stockMovements).output().values({
        itemId,
        toWarehouseId: warehouseId,
        quantity: qty,
        unitCost,
        totalCost: Math.round(qty * unitCost * 100) / 100,
        type: 'PRODUCTION',
        referenceId,
        reason,
        performedBy: actorId,
        createdAt: new Date(),
    });
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 1);
    await tx.insert(inventoryBatches).values({
        id: `BATCH-BUTCH-${referenceId}-${itemId}-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        itemId,
        warehouseId,
        batchNumber: `BUTCH-${referenceId}`,
        expiryDate: expiry,
        receivedDate: new Date(),
        initialQty: qty,
        currentQty: qty,
        unitCost,
        status: 'ACTIVE',
        createdAt: new Date(),
    });
    return { movement, newAvg };
};

/** Map internal butchery error codes to HTTP statuses (shared by post/edit/delete). */
const sendButcheryError = (res: Response, message: string) => {
    if (message.startsWith('OUTPUT_ITEM_NOT_FOUND') || message.startsWith('SOURCE_ITEM_NOT_FOUND')) {
        return res.status(404).json({ error: message });
    }
    if (message.includes('BRANCH_MISMATCH')) return res.status(403).json({ error: message });
    if (message.includes('INACTIVE')) return res.status(409).json({ error: message });
    if (
        message.includes('INSUFFICIENT_STOCK') || message.startsWith('INCOMPATIBLE_UNITS') ||
        message.startsWith('INVALID_') || message.startsWith('COST_') || message.startsWith('OUTPUT_') ||
        message === 'OUTPUTS_REQUIRED' || message === 'SOURCE_UNIT_REQUIRED' ||
        message === 'SOURCE_ITEM_LOCKED_AFTER_POST' || message === 'ALREADY_POSTED' ||
        message === 'OPERATION_CANCELLED' || message === 'ONLY_DRAFT_POSTABLE'
    ) return res.status(400).json({ error: message });
    return res.status(500).json({ error: message });
};

/** Validate output lines against live items/warehouses/UOMs before any stock moves. */
const validateOutputLines = async (lines: NormalizedButcheryOutput[], sourceUnit: string, branchId?: string) => {
    for (const o of lines) {
        if (o.outputType !== 'WASTE') {
            const [item] = await db.select({ isActive: inventoryItems.isActive }).from(inventoryItems).where(eq(inventoryItems.id, String(o.itemId)));
            if (!item) throw new Error(`OUTPUT_ITEM_NOT_FOUND|item=${o.itemId}`);
            if (item.isActive === false) throw new Error(`OUTPUT_ITEM_INACTIVE|item=${o.itemId}`);
        }
        try {
            toSourceUnit(Number(o.quantity), o.unit, sourceUnit);
        } catch {
            throw new Error(`INCOMPATIBLE_UNITS|unit=${o.unit}|source=${sourceUnit}`);
        }
        if (o.warehouseId) {
            const [outWh] = await db.select().from(warehouses).where(eq(warehouses.id, String(o.warehouseId)));
            if (!outWh) throw new Error(`OUTPUT_WAREHOUSE_NOT_FOUND|warehouse=${o.warehouseId}`);
            if (branchId && outWh.branchId !== branchId) throw new Error('BRANCH_MISMATCH');
        }
    }
};

/**
 * Reverse a POSTED operation's stock effects inside the caller's transaction.
 * Takes back every stockable output via FEFO (throws INSUFFICIENT_STOCK if
 * already consumed — the transaction rolls back and nothing changes), then
 * returns the source quantity. Status/audit are left to the caller so the
 * same helper serves cancel, edit (reverse + re-post) and delete.
 */
const reversePostingTx = async (tx: any, op: any, lines: any[], actorId: string) => {
    for (const l of lines) {
        if (String(l.outputType) === 'WASTE' || !l.itemId) continue;
        await inventoryService.deductInventoryFEFO(
            tx, String(l.itemId), String(l.warehouseId || op.warehouseId), Number(l.quantity || 0), op.id,
            `Butchery reversal ${op.reference}`,
            { performedBy: actorId, movementType: 'ADJUSTMENT' },
        );
    }
    const [stock] = await tx.select().from(inventoryStock).where(and(eq(inventoryStock.itemId, op.sourceItemId), eq(inventoryStock.warehouseId, op.warehouseId)));
    if (stock) {
        await tx.update(inventoryStock).set({ quantity: Number((stock as any).quantity || 0) + Number(op.sourceQty || 0), lastUpdated: new Date() }).where(eq(inventoryStock.id, (stock as any).id));
    } else {
        await tx.insert(inventoryStock).values({ itemId: op.sourceItemId, warehouseId: op.warehouseId, quantity: Number(op.sourceQty || 0), lastUpdated: new Date() });
    }
    await tx.insert(stockMovements).values({
        itemId: op.sourceItemId,
        toWarehouseId: op.warehouseId,
        quantity: Number(op.sourceQty || 0),
        unitCost: Number(op.sourceUnitCost || 0),
        totalCost: Number(op.sourceTotalCost || 0),
        type: 'ADJUSTMENT',
        referenceId: op.id,
        reason: `Butchery reversal ${op.reference}`,
        performedBy: actorId,
        createdAt: new Date(),
    });
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 1);
    await tx.insert(inventoryBatches).values({
        id: `BATCH-BUTCH-RELEASE-${op.id}-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        itemId: op.sourceItemId,
        warehouseId: op.warehouseId,
        batchNumber: `BUTCH-RELEASE-${op.reference}`,
        expiryDate: expiry,
        receivedDate: new Date(),
        initialQty: Number(op.sourceQty || 0),
        currentQty: Number(op.sourceQty || 0),
        unitCost: Number(op.sourceUnitCost || 0),
        status: 'ACTIVE',
        createdAt: new Date(),
    });
};

/**
 * Apply posting stock effects inside the caller's transaction: consume the
 * source via FEFO, allocate cost across outputs (throws
 * COST_ALLOCATION_IMBALANCED when conservation breaks), credit stockable
 * outputs via MAC, record WASTE movements. Line-row persistence is left to
 * the caller (post updates rows in place, edit replaces them).
 */
const applyPostingTx = async (
    tx: any,
    op: any,
    costing: { sourceQty: number; sourceUnit: string; sourceUnitCost: number; sourceTotalCost: number },
    rawOutputs: NormalizedButcheryOutput[],
    actorId: string,
) => {
    await inventoryService.deductInventoryFEFO(
        tx, op.sourceItemId, op.warehouseId, costing.sourceQty, op.id,
        `Butchery consumption ${op.reference}`,
        { performedBy: actorId, movementType: 'PRODUCTION_CONSUMPTION' },
    );
    const allocated = allocateCost(costing.sourceQty, String(costing.sourceUnit), costing.sourceTotalCost, rawOutputs);
    const allocatedSum = allocated.reduce((s, o) => s + o.totalAllocatedCost, 0);
    if (Math.abs(allocatedSum - costing.sourceTotalCost) > 0.05) {
        throw new Error(`COST_ALLOCATION_IMBALANCED|allocated=${allocatedSum}|input=${costing.sourceTotalCost}`);
    }
    let wasteShare = 0;
    for (const o of allocated) {
        if (o.outputType === 'WASTE') {
            wasteShare = Math.round((wasteShare + o.totalAllocatedCost) * 100) / 100;
            await tx.insert(stockMovements).values({
                itemId: op.sourceItemId,
                fromWarehouseId: op.warehouseId,
                quantity: toSourceUnit(Number(o.quantity), o.unit, String(costing.sourceUnit)),
                unitCost: costing.sourceUnitCost,
                totalCost: o.totalAllocatedCost,
                type: 'WASTE',
                referenceId: op.id,
                reason: `Butchery waste ${op.reference}${o.wasteReason ? `: ${o.wasteReason}` : ''}`,
                performedBy: actorId,
                createdAt: new Date(),
            });
            continue;
        }
        await applyMacForInbound(tx, String(o.itemId), String(o.warehouseId || op.warehouseId), Number(o.quantity), o.allocatedUnitCost, actorId, op.id, `Butchery output ${op.reference}`);
    }
    return { allocated, wasteShare };
};

export const postButcheryOperation = async (req: Request, res: Response) => {
    try {
        await ensureButcheryTables();
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'BUTCHERY_ID_REQUIRED' });
        const actorId = req.user?.id || 'system';
        const [op] = await db.select().from(butcheryOperations).where(eq(butcheryOperations.id, id));
        if (!op) return res.status(404).json({ error: 'Butchery operation not found' });
        if (req.effectiveBranchId && op.branchId && op.branchId !== req.effectiveBranchId) {
            return res.status(403).json({ error: 'BRANCH_MISMATCH' });
        }
        if (op.status === 'POSTED') return res.status(400).json({ error: 'ALREADY_POSTED' });
        if (op.status === 'CANCELLED') return res.status(400).json({ error: 'OPERATION_CANCELLED' });
        if (op.status !== 'DRAFT') return res.status(400).json({ error: 'ONLY_DRAFT_POSTABLE' });
        const lines = await db.select().from(butcheryOutputs).where(eq(butcheryOutputs.operationId, id));
        if (lines.length === 0) return res.status(400).json({ error: 'OUTPUTS_REQUIRED' });
        const [warehouse] = await db.select().from(warehouses).where(eq(warehouses.id, op.warehouseId));
        if (!warehouse || warehouse.isActive === false) return res.status(409).json({ error: 'WAREHOUSE_INACTIVE' });
        const [sourceItem] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, op.sourceItemId));
        if (!sourceItem || sourceItem.isActive === false) return res.status(409).json({ error: 'SOURCE_ITEM_INACTIVE' });

        // Re-lock source cost at post time (purchase price may have moved since DRAFT).
        const sourceQty = Number(op.sourceQty || 0);
        const sourceUnitCost = Number(sourceItem.costPrice || 0);
        const sourceTotalCost = Math.round(sourceQty * sourceUnitCost * 100) / 100;
        const allocated = allocateCost(sourceQty, String(op.sourceUnit), sourceTotalCost, lines.map((l) => ({
            itemId: l.itemId || undefined,
            quantity: Number(l.quantity || 0),
            unit: String(l.unit || ''),
            outputType: ((l.outputType as ButcheryOutputType) || 'USABLE'),
            warehouseId: l.warehouseId || undefined,
            wasteReason: l.wasteReason || undefined,
        })));
        const allocatedSum = allocated.reduce((s, o) => s + o.totalAllocatedCost, 0);
        if (Math.abs(allocatedSum - sourceTotalCost) > 0.05) {
            return res.status(400).json({ error: `COST_ALLOCATION_IMBALANCED|allocated=${allocatedSum}|input=${sourceTotalCost}` });
        }

        let wasteShare = 0;
        await db.transaction(async (tx) => {
            const { allocated, wasteShare: ws } = await applyPostingTx(tx, op, {
                sourceQty,
                sourceUnit: String(op.sourceUnit),
                sourceUnitCost,
                sourceTotalCost,
            }, lines.map((l) => ({
                itemId: l.itemId || undefined,
                quantity: Number(l.quantity || 0),
                unit: String(l.unit || ''),
                outputType: ((l.outputType as ButcheryOutputType) || 'USABLE'),
                warehouseId: l.warehouseId || undefined,
                wasteReason: l.wasteReason || undefined,
            })), actorId);
            wasteShare = ws;
            // Persist re-locked allocation on the lines.
            for (const o of allocated) {
                const line = lines.find((l) => l.itemId === (o.itemId || null) && Number(l.quantity) === Number(o.quantity) && l.unit === o.unit && l.outputType === o.outputType);
                if (line) {
                    await tx.update(butcheryOutputs).set({
                        yieldPct: o.yieldPct,
                        allocatedCost: o.allocatedUnitCost,
                        totalAllocatedCost: o.totalAllocatedCost,
                    }).where(eq(butcheryOutputs.id, line.id));
                }
            }
            await tx.update(butcheryOperations).set({
                status: 'POSTED',
                sourceUnitCost,
                sourceTotalCost,
                postedBy: actorId,
                postedAt: new Date(),
                updatedAt: new Date(),
            }).where(eq(butcheryOperations.id, id));
            await tx.insert(auditLogs).values({
                eventType: 'BUTCHERY_POSTED',
                userId: actorId,
                branchId: op.branchId || null,
                payload: { operationId: id, reference: op.reference, sourceTotalCost, allocatedSum, wasteShare },
                reason: `Butchery posted ${op.reference}`,
                createdAt: new Date(),
            });
        });

        // GL mirrors production: finished-goods value in, raw-material value out.
        const finance = await postProductionCompletionEntry({
            productionOrderId: id,
            amount: sourceTotalCost,
            branchId: op.branchId || undefined,
            userId: actorId,
        });
        if (wasteShare > 0) {
            await postWastageEntry({
                referenceId: id,
                amount: wasteShare,
                branchId: op.branchId || undefined,
                userId: actorId,
                reason: `Butchery waste ${op.reference}`,
            });
        }
        try {
            if (warehouse?.branchId) {
                getIO().to(`branch:${warehouse.branchId}`).emit('stock:updated', { referenceId: id, type: 'BUTCHERY_POSTED' });
            }
        } catch (e) {
            console.warn('Failed to emit stock:updated for butchery', e);
        }
        res.json({ ...(await buildDetail(id)), financeStatus: (finance as any)?.status || 'skipped' });
    } catch (error: any) {
        return sendButcheryError(res, String(error?.message || 'BUTCHERY_POST_FAILED'));
    }
};

export const cancelButcheryOperation = async (req: Request, res: Response) => {
    try {
        await ensureButcheryTables();
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'BUTCHERY_ID_REQUIRED' });
        const actorId = req.user?.id || 'system';
        const [op] = await db.select().from(butcheryOperations).where(eq(butcheryOperations.id, id));
        if (!op) return res.status(404).json({ error: 'Butchery operation not found' });
        if (req.effectiveBranchId && op.branchId && op.branchId !== req.effectiveBranchId) {
            return res.status(403).json({ error: 'BRANCH_MISMATCH' });
        }
        if (op.status === 'CANCELLED') return res.status(400).json({ error: 'ALREADY_CANCELLED' });
        if (op.status === 'DRAFT') {
            await db.update(butcheryOperations).set({ status: 'CANCELLED', cancelledBy: actorId, cancelledAt: new Date(), updatedAt: new Date() }).where(eq(butcheryOperations.id, id));
            res.json({ id, status: 'CANCELLED' });
            return;
        }
        if (op.status !== 'POSTED') return res.status(400).json({ error: 'ONLY_DRAFT_OR_POSTED_CANCELLABLE' });
        // Reversal of a POSTED operation: take back every stockable output
        // (fails loudly if already consumed — never drives stock negative
        // silently), then return the source quantity.
        const lines = await db.select().from(butcheryOutputs).where(eq(butcheryOutputs.operationId, id));
        await db.transaction(async (tx) => {
            await reversePostingTx(tx, op, lines, actorId);
            await tx.update(butcheryOperations).set({ status: 'CANCELLED', cancelledBy: actorId, cancelledAt: new Date(), updatedAt: new Date() }).where(eq(butcheryOperations.id, id));
            await tx.insert(auditLogs).values({
                eventType: 'BUTCHERY_CANCELLED',
                userId: actorId,
                branchId: op.branchId || null,
                payload: { operationId: id, reference: op.reference },
                reason: `Butchery reversed ${op.reference}`,
                createdAt: new Date(),
            });
        });
        res.json({ id, status: 'CANCELLED' });
    } catch (error: any) {
        return sendButcheryError(res, String(error?.message || 'BUTCHERY_CANCEL_FAILED'));
    }
};

export const deleteButcheryOperation = async (req: Request, res: Response) => {
    try {
        await ensureButcheryTables();
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'BUTCHERY_ID_REQUIRED' });
        const actorId = req.user?.id || 'system';
        const [op] = await db.select().from(butcheryOperations).where(eq(butcheryOperations.id, id));
        if (!op) return res.status(404).json({ error: 'Butchery operation not found' });
        if (req.effectiveBranchId && op.branchId && op.branchId !== req.effectiveBranchId) {
            return res.status(403).json({ error: 'BRANCH_MISMATCH' });
        }
        // POSTED rows hold live stock effects, so deletion reverses them first
        // in the same transaction (refused with INSUFFICIENT_STOCK when the
        // outputs were already consumed). The signed audit trail and the
        // stock_movements history are append-only and are kept.
        const snapshot = {
            reference: op.reference, status: op.status, sourceItemId: op.sourceItemId,
            sourceQty: Number(op.sourceQty || 0), sourceTotalCost: Number(op.sourceTotalCost || 0),
        };
        try {
            await db.transaction(async (tx) => {
                if (op.status === 'POSTED') {
                    const txLines = await tx.select().from(butcheryOutputs).where(eq(butcheryOutputs.operationId, id));
                    await reversePostingTx(tx, op, txLines, actorId);
                }
                await tx.delete(butcheryOutputs).where(eq(butcheryOutputs.operationId, id));
                await tx.delete(butcheryOperations).where(eq(butcheryOperations.id, id));
                await tx.insert(auditLogs).values({
                    eventType: 'BUTCHERY_DELETED',
                    userId: actorId,
                    branchId: op.branchId || null,
                    payload: { operationId: id, ...snapshot },
                    reason: `Butchery deleted ${op.reference}`,
                    createdAt: new Date(),
                });
            });
        } catch (e: any) {
            return sendButcheryError(res, String(e?.message || 'BUTCHERY_DELETE_FAILED'));
        }
        res.json({ success: true, id });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// ---- Templates (expected yields; actuals are always recorded on the operation) ----

export const getButcheryTemplates = async (req: Request, res: Response) => {
    try {
        await ensureButcheryTables();
        const branchId = req.effectiveBranchId || getStringParam(req.query.branchId);
        const rows = await db.select().from(butcheryTemplates).orderBy(desc(butcheryTemplates.createdAt));
        const filtered = rows.filter((t) => !branchId || !t.branchId || t.branchId === branchId);
        const allLines = await db.select().from(butcheryTemplateLines);
        res.json(filtered.map((t) => ({
            id: t.id,
            name: t.name,
            branchId: t.branchId || undefined,
            sourceItemId: t.sourceItemId,
            isActive: t.isActive !== false,
            lines: allLines.filter((l) => l.templateId === t.id).map((l) => ({
                id: l.id,
                itemId: l.itemId || undefined,
                expectedPct: Number(l.expectedPct || 0),
                outputType: l.outputType,
                unit: l.unit || undefined,
            })),
        })));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createButcheryTemplate = async (req: Request, res: Response) => {
    try {
        await ensureButcheryTables();
        const actorId = req.user?.id || 'system';
        const { name, sourceItemId, branchId, lines } = req.body || {};
        if (!name || !sourceItemId || !Array.isArray(lines) || lines.length === 0) {
            return res.status(400).json({ error: 'TEMPLATE_NAME_SOURCE_LINES_REQUIRED' });
        }
        const [source] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, String(sourceItemId)));
        if (!source) return res.status(404).json({ error: 'SOURCE_ITEM_NOT_FOUND' });
        let total = 0;
        for (const l of lines) {
            const pct = Number(l?.expectedPct);
            if (!Number.isFinite(pct) || pct < 0 || pct > 100) return res.status(400).json({ error: 'INVALID_EXPECTED_PCT' });
            if (!OUTPUT_TYPES.includes(l?.outputType)) return res.status(400).json({ error: 'INVALID_OUTPUT_TYPE' });
            total += pct;
        }
        if (Math.abs(total - 100) > 0.5) return res.status(400).json({ error: `TEMPLATE_PCT_MUST_SUM_100|total=${total}` });
        const id = `BUTCH-TPL-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
        await db.transaction(async (tx) => {
            await tx.insert(butcheryTemplates).values({
                id,
                name: String(name).slice(0, 200),
                branchId: (branchId ? String(branchId) : req.effectiveBranchId) || undefined,
                sourceItemId: String(sourceItemId),
                isActive: true,
                createdBy: actorId,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            await tx.insert(butcheryTemplateLines).values(lines.map((l: any) => ({
                templateId: id,
                itemId: l?.itemId ? String(l.itemId) : undefined,
                expectedPct: Number(l.expectedPct),
                outputType: String(l.outputType),
                unit: l?.unit ? String(l.unit) : undefined,
            })));
        });
        res.status(201).json({ id });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteButcheryTemplate = async (req: Request, res: Response) => {
    try {
        await ensureButcheryTables();
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'TEMPLATE_ID_REQUIRED' });
        await db.transaction(async (tx) => {
            await tx.delete(butcheryTemplateLines).where(eq(butcheryTemplateLines.templateId, id));
            await tx.delete(butcheryTemplates).where(eq(butcheryTemplates.id, id));
        });
        res.json({ success: true, id });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// ---- Yield report: posted operations aggregated with input/output/yield/waste/cost ----

export const getButcheryYieldReport = async (req: Request, res: Response) => {
    try {
        await ensureButcheryTables();
        const branchId = req.effectiveBranchId || getStringParam(req.query.branchId);
        const sourceItemId = getStringParam(req.query.sourceItemId);
        const startDate = getStringParam(req.query.startDate);
        const endDate = getStringParam(req.query.endDate);
        const conditions: any[] = [eq(butcheryOperations.status, 'POSTED')];
        if (branchId) conditions.push(eq(butcheryOperations.branchId, branchId));
        if (sourceItemId) conditions.push(eq(butcheryOperations.sourceItemId, sourceItemId));
        if (startDate) conditions.push(gte(butcheryOperations.postedAt, new Date(startDate)));
        if (endDate) conditions.push(lte(butcheryOperations.postedAt, new Date(endDate)));
        const rows = await db.select().from(butcheryOperations).where(and(...conditions)).orderBy(desc(butcheryOperations.postedAt));
        const report = await Promise.all(rows.slice(0, 500).map(async (o) => {
            const detail = await buildDetail(o.id);
            return {
                id: o.id,
                reference: o.reference,
                postedAt: (o.postedAt as any)?.toISOString?.(),
                sourceItemId: o.sourceItemId,
                sourceQty: Number(o.sourceQty || 0),
                sourceUnit: o.sourceUnit,
                sourceTotalCost: Number(o.sourceTotalCost || 0),
                usableYieldPct: detail?.usableYieldPct || 0,
                wastePct: detail?.wastePct || 0,
                totalOutputInSourceUnit: detail?.totalOutputInSourceUnit || 0,
                outputCount: detail?.outputs?.length || 0,
            };
        }));
        const totals = report.reduce((s, r) => ({
            inputQty: s.inputQty + r.sourceQty,
            inputCost: Math.round((s.inputCost + r.sourceTotalCost) * 100) / 100,
            outputQty: s.outputQty + r.totalOutputInSourceUnit,
            count: s.count + 1,
        }), { inputQty: 0, inputCost: 0, outputQty: 0, count: 0 });
        res.json({ rows: report, totals });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
