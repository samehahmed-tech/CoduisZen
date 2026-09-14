import { Request, Response } from 'express';
import { db } from '../db';
import { stockMovements, inventoryItems, warehouses, auditLogs, inventoryStock, managerApprovals } from '../../src/db/schema';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { postWastageEntry } from '../services/financePostingService';
import { inventoryService } from '../services/inventoryService';
import { getIO } from '../socket';

/**
 * Execute approved wastage. Only approval flow calls this.
 */
export const executeApprovedWastage = async (input: {
    itemId: string;
    warehouseId: string;
    quantity: number;
    reason: string;
    notes?: string | null;
    requestedBy?: string;
    approvedBy?: string;
    approvalId?: number;
}) => {
    const qty = Number(input.quantity);
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, input.itemId));
    const [warehouse] = await db.select().from(warehouses).where(eq(warehouses.id, input.warehouseId));
    if (!item) throw new Error('ITEM_NOT_FOUND');
    if (!warehouse) throw new Error('WAREHOUSE_NOT_FOUND');

    const actorId = input.approvedBy || input.requestedBy || 'system';
    const deduction = await db.transaction(async (tx) => inventoryService.deductInventoryFEFO(
        tx,
        input.itemId,
        input.warehouseId,
        qty,
        input.approvalId ? `WASTE-APP-${input.approvalId}` : `WASTE-${Date.now()}`,
        input.reason,
        { performedBy: actorId, movementType: 'WASTE', allowExpired: true }
    ));
    const [movement] = await db.select().from(stockMovements).where(eq(stockMovements.id, deduction.movementId));

    const amount = Number(deduction.totalCostCalculated || qty * Number(item.costPrice || 0));
    if (amount > 0 && movement?.id) {
        await postWastageEntry({
            referenceId: String(movement.id),
            amount,
            branchId: warehouse?.branchId || undefined,
            userId: actorId,
            reason: input.reason,
        });
    }

    await db.insert(auditLogs).values({
        eventType: 'INVENTORY_WASTAGE_APPROVED',
        userId: actorId,
        branchId: warehouse?.branchId || null,
        payload: { ...input, quantity: qty, movementId: movement?.id, costImpact: amount },
        createdAt: new Date(),
    });

    try {
        const [finalStock] = await db.select().from(inventoryStock).where(
            and(eq(inventoryStock.itemId, input.itemId), eq(inventoryStock.warehouseId, input.warehouseId))
        );
        if (warehouse?.branchId) {
            getIO().to(`branch:${warehouse.branchId}`).emit('stock:updated', {
                itemId: input.itemId,
                warehouseId: input.warehouseId,
                quantity: Number(finalStock?.quantity || 0),
                type: 'WASTE'
            });
        }
    } catch (e) {
        console.warn('Failed to emit stock:updated for wastage', e);
    }

    return { movement, unit: item.unit, costImpact: amount };
};

/**
 * Record wastage (burnt, expired, damaged)
 */
export const recordWastage = async (req: Request, res: Response) => {
    try {
        const { itemId, warehouseId, quantity, reason, notes } = req.body;
        const qty = Number(quantity);

        if (!itemId || !warehouseId || !reason || !Number.isFinite(qty) || qty <= 0) {
            return res.status(400).json({ error: 'itemId, warehouseId, quantity, and reason are required' });
        }

        const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
        const [warehouse] = await db.select().from(warehouses).where(eq(warehouses.id, warehouseId));
        if (!item) return res.status(404).json({ error: 'ITEM_NOT_FOUND' });
        if (!warehouse) return res.status(404).json({ error: 'WAREHOUSE_NOT_FOUND' });
        if (req.effectiveBranchId && warehouse.branchId !== req.effectiveBranchId) return res.status(403).json({ error: 'BRANCH_MISMATCH' });
        const [stock] = await db.select({ quantity: inventoryStock.quantity }).from(inventoryStock).where(
            and(eq(inventoryStock.itemId, itemId), eq(inventoryStock.warehouseId, warehouseId))
        );
        if (Number(stock?.quantity || 0) < qty) return res.status(400).json({ error: 'INSUFFICIENT_STOCK' });
        const actorId = req.user?.id || 'system';
        const branchId = warehouse.branchId || req.effectiveBranchId;
        if (!branchId) return res.status(400).json({ error: 'BRANCH_REQUIRED_FOR_WASTAGE_APPROVAL' });
        const relatedId = `WASTE-REQ-${Date.now()}`;
        const [approval] = await db.insert(managerApprovals).output().values({
            managerId: actorId,
            branchId,
            actionType: 'WASTAGE',
            relatedId,
            reason: 'Wastage pending approval',
            details: {
                status: 'PENDING',
                itemId,
                itemName: item.name,
                warehouseId,
                warehouseName: warehouse.name,
                quantity: qty,
                unit: item.unit,
                reason,
                notes: notes || null,
                requestedBy: actorId,
                requestedByName: req.user?.name || null,
                requestedAt: new Date().toISOString(),
            },
            createdAt: new Date(),
        });

        await db.insert(auditLogs).values({
            eventType: 'INVENTORY_WASTAGE_REQUESTED',
            userId: actorId,
            branchId: warehouse?.branchId || null,
            payload: {
                itemId,
                warehouseId,
                quantity: qty,
                reason,
                notes: notes || null,
            },
            createdAt: new Date(),
        });

        res.status(202).json({
            success: true,
            pendingApproval: true,
            approvalId: String(approval.id),
            approval,
            unit: item.unit,
            message: 'WASTAGE_PENDING_APPROVAL'
        });
    } catch (error: any) {
        if (String(error?.message || '').startsWith('INSUFFICIENT_STOCK')) return res.status(400).json({ error: error.message });
        res.status(500).json({ error: error.message });
    }
};

/**
 * Get wastage report (aggregated by date, item, reason)
 */
export const getWastageReport = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, warehouseId, itemId, reason } = req.query;
        const filters: any[] = [eq(stockMovements.type, 'WASTE')];
        if (startDate) filters.push(gte(stockMovements.createdAt, new Date(String(startDate))));
        if (endDate) filters.push(lte(stockMovements.createdAt, new Date(`${String(endDate)}T23:59:59.999Z`)));
        if (warehouseId) filters.push(eq(stockMovements.fromWarehouseId, String(warehouseId)));
        if (itemId) filters.push(eq(stockMovements.itemId, String(itemId)));
        if (reason) filters.push(eq(stockMovements.reason, String(reason)));

        let query = db.select({
            itemId: stockMovements.itemId,
            itemName: inventoryItems.name,
            warehouseId: stockMovements.fromWarehouseId,
            warehouseName: warehouses.name,
            reason: stockMovements.reason,
            totalQty: sql<number>`sum(${stockMovements.quantity})`,
            count: sql<number>`count(*)`,
            costImpact: sql<number>`coalesce(sum(${stockMovements.totalCost}), 0)`,
        })
            .from(stockMovements)
            .innerJoin(inventoryItems, eq(stockMovements.itemId, inventoryItems.id))
            .leftJoin(warehouses, eq(stockMovements.fromWarehouseId, warehouses.id))
            .where(and(...filters))
            .groupBy(stockMovements.itemId, inventoryItems.name, stockMovements.fromWarehouseId, warehouses.name, stockMovements.reason)
            .orderBy(desc(sql`sum(${stockMovements.quantity})`));

        const report = await query;

        // Get totals
        const totalsQuery = await db.select({
totalItems: sql<number>`count(distinct ${stockMovements.itemId})`,
            totalIncidents: sql<number>`count(*)`,
            totalQty: sql<number>`coalesce(sum(${stockMovements.quantity}), 0)`,
            totalCost: sql<number>`coalesce(sum(${stockMovements.totalCost}), 0)`,
        })
            .from(stockMovements)
            .leftJoin(inventoryItems, eq(stockMovements.itemId, inventoryItems.id))
            .leftJoin(warehouses, eq(stockMovements.fromWarehouseId, warehouses.id))
            .where(and(...filters));

        const summary = totalsQuery[0] || { totalItems: 0, totalIncidents: 0, totalQty: 0 };
        res.json({
            items: report,
            summary,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Get recent wastage entries
 */
export const getRecentWastage = async (req: Request, res: Response) => {
    try {
        const { limit = 50 } = req.query;

        const entries = await db.select({
            id: stockMovements.id,
            itemId: stockMovements.itemId,
            itemName: inventoryItems.name,
            quantity: stockMovements.quantity,
            unit: inventoryItems.unit,
            warehouseId: stockMovements.fromWarehouseId,
            warehouseName: warehouses.name,
            costImpact: stockMovements.totalCost,
            reason: stockMovements.reason,
            performedBy: stockMovements.performedBy,
            createdAt: stockMovements.createdAt,
        })
            .from(stockMovements)
            .innerJoin(inventoryItems, eq(stockMovements.itemId, inventoryItems.id))
            .leftJoin(warehouses, eq(stockMovements.fromWarehouseId, warehouses.id))
            .where(eq(stockMovements.type, 'WASTE'))
            .orderBy(desc(stockMovements.createdAt))
            .offset(0).fetch(Number(limit));

        res.json(entries);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
