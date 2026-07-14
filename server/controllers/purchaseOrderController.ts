import { Request, Response } from 'express';
import { db } from '../db';
import { purchaseOrders, purchaseOrderItems, inventoryStock, stockMovements, inventoryItems, auditLogs, inventoryBatches } from '../../src/db/schema';
import { eq, desc, sql, and } from 'drizzle-orm';
import { getStringParam } from '../utils/request';
import { postPurchaseReceiptEntry } from '../services/financePostingService';

/**
 * Create new Purchase Order
 */
export const createPO = async (req: Request, res: Response) => {
    try {
        const { id, supplierId, branchId, expectedDate, notes, items, createdBy } = req.body;

        if (!supplierId || !branchId || !items || items.length === 0) {
            return res.status(400).json({ error: 'supplierId, branchId, and items are required' });
        }

        const subtotal = items.reduce((sum: number, item: any) => sum + (item.orderedQty * item.unitPrice), 0);

        const savedPO = await db.transaction(async (tx) => {
            // 1. Create PO header
            const [po] = await tx.insert(purchaseOrders).output().values({
                id: id || `PO-${Date.now()}`,
                supplierId,
                branchId,
                status: 'DRAFT',
                expectedDate: expectedDate ? new Date(expectedDate) : null,
                subtotal,
                notes,
                createdBy,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            // 2. Create PO line items
            for (const item of items) {
                await tx.insert(purchaseOrderItems).values({
                    poId: po.id,
                    itemId: item.itemId,
                    orderedQty: item.orderedQty,
                    receivedQty: 0,
                    unitPrice: item.unitPrice,
                });
            }

            return po;
        });

        res.status(201).json(savedPO);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Receive goods against a PO (partial or full)
 */
export const receivePO = async (req: Request, res: Response) => {
    try {
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'PO_ID_REQUIRED' });
        const { warehouseId, items, receivedBy } = req.body;

        if (!warehouseId || !items || items.length === 0) {
            return res.status(400).json({ error: 'warehouseId and items are required' });
        }

        let totalReceivedCost = 0;
        let poBranchId: string | undefined = undefined;
        await db.transaction(async (tx) => {
            const [poHeader] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
            if (!poHeader) {
                throw new Error('Purchase Order not found');
            }
            const currentStatus = String(poHeader.status || 'DRAFT').toUpperCase();
            const receivableStatuses = ['SENT', 'PARTIAL', 'ORDERED'];
            if (!receivableStatuses.includes(currentStatus)) {
                throw new Error(`PO status ${currentStatus} is not receivable`);
            }
            poBranchId = poHeader?.branchId || undefined;
            for (const item of items) {
                const { itemId, receivedQty } = item;
                const [line] = await tx.select().from(purchaseOrderItems).where(
                    and(
                        eq(purchaseOrderItems.poId, id),
                        eq(purchaseOrderItems.itemId, itemId)
                    )
                );
                if (!line) {
                    throw new Error(`PO item ${itemId} not found`);
                }
                const qty = Number(receivedQty || 0);
                if (!Number.isFinite(qty) || qty <= 0) {
                    throw new Error(`Invalid received quantity for item ${itemId}`);
                }
                const orderedQty = Number(line.orderedQty || 0);
                const alreadyReceivedQty = Number(line.receivedQty || 0);
                const remainingQty = Math.max(0, orderedQty - alreadyReceivedQty);
                if (qty > remainingQty) {
                    throw new Error(`Received quantity exceeds remaining for item ${itemId}`);
                }
                const unitPrice = Number(line?.unitPrice || 0);
                totalReceivedCost += qty * unitPrice;

                // 1. Update PO item received quantity
                await tx.update(purchaseOrderItems)
                    .set({ receivedQty: sql`received_qty + ${qty}` })
                    .where(
                        and(
                            eq(purchaseOrderItems.poId, id),
                            eq(purchaseOrderItems.itemId, itemId)
                        )
                    );

                // 2. Add to inventory stock
                const existingStock = await tx.select()
                    .from(inventoryStock)
                    .where(
                        and(
                            eq(inventoryStock.itemId, itemId),
                            eq(inventoryStock.warehouseId, warehouseId)
                        )
                    );

                if (existingStock.length > 0) {
                    await tx.update(inventoryStock)
                        .set({
                            quantity: sql`quantity + ${qty}`,
                            lastUpdated: new Date(),
                        })
                        .where(
                            and(
                                eq(inventoryStock.itemId, itemId),
                                eq(inventoryStock.warehouseId, warehouseId)
                            )
                        );
                } else {
                    await tx.insert(inventoryStock).values({
                        itemId,
                        warehouseId,
                        quantity: qty,
                        lastUpdated: new Date(),
                    });
                }

                // 3. Dynamic Costing (Moving Average)
                const [invItem] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
                const allStock = await tx.select().from(inventoryStock).where(eq(inventoryStock.itemId, itemId));

                // We calculate old qty using the existing stock *before* we updated the quantity in step 2 (if it was an update).
                // Wait, in step 2 we already did sql`quantity + ${qty}`, so the current `allStock` reflects the NEW total quantity.
                // Let's calculate based on that.
                const newTotalQty = allStock.reduce((sum, s) => sum + Number(s.quantity || 0), 0);
                const oldTotalQty = Math.max(0, newTotalQty - qty); // Backtrack since we already updated stock table

                const oldTotalValue = oldTotalQty * Number(invItem?.costPrice || 0);
                const receivedValue = qty * unitPrice;

                const newAverageCost = newTotalQty > 0 ? (oldTotalValue + receivedValue) / newTotalQty : unitPrice;

                await tx.update(inventoryItems)
                    .set({
                        costPrice: newAverageCost,
                        purchasePrice: unitPrice,
                        updatedAt: new Date(),
                    })
                    .where(eq(inventoryItems.id, itemId));

                // 4. Create stock movement
                await tx.insert(stockMovements).values({
                    itemId,
                    toWarehouseId: warehouseId,
                    quantity: qty,
                    unitCost: unitPrice,
                    totalCost: receivedValue,
                    type: 'PURCHASE',
                    referenceId: id,
                    reason: 'Goods Receipt from PO',
                    performedBy: receivedBy || 'system',
                    createdAt: new Date(),
                });

                // 5. Create Inventory Batch (FEFO Support)
                const defaultExpiry = new Date();
                defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 1); // Default to +1 year without input

                const batchExpiry = item.expiryDate ? new Date(item.expiryDate) : defaultExpiry;
                const batchNumber = item.batchNumber || `SYS-BATCH-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

                await tx.insert(inventoryBatches).values({
                    id: `BATCH-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    itemId,
                    warehouseId,
                    batchNumber,
                    expiryDate: batchExpiry,
                    receivedDate: new Date(),
                    initialQty: qty,
                    currentQty: qty,
                    unitCost: unitPrice,
                    supplierId: poHeader.supplierId,
                    status: 'ACTIVE',
                    createdAt: new Date(),
                });
            }

            // 5. Update PO status
            const poItems = await tx.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.poId, id));
            const allReceived = poItems.every(item => Number(item.receivedQty) >= Number(item.orderedQty));
            const anyReceived = poItems.some(item => Number(item.receivedQty) > 0);

            await tx.update(purchaseOrders)
                .set({
                    status: allReceived ? 'RECEIVED' : (anyReceived ? 'PARTIAL' : 'SENT'),
                    updatedAt: new Date(),
                })
                .where(eq(purchaseOrders.id, id));
        });

        // Finance posting: inventory receipt vs accounts payable (non-blocking)
        postPurchaseReceiptEntry({
            poId: id,
            amount: totalReceivedCost,
            branchId: poBranchId,
            userId: receivedBy || 'system',
        }).catch(() => {
            // Keep PO receive flow resilient even if finance posting fails
        });

        await db.insert(auditLogs).values({
            eventType: 'PURCHASE_ORDER_RECEIPT',
            userId: receivedBy || null,
            branchId: poBranchId || null,
            payload: {
                poId: id,
                warehouseId,
                receivedItems: items,
                totalReceivedCost,
            },
            createdAt: new Date(),
        });

        res.json({ success: true, message: 'Goods received successfully' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Get all Purchase Orders
 */
export const getPOs = async (req: Request, res: Response) => {
    try {
        const status = getStringParam(req.query.status);
        const supplierId = getStringParam(req.query.supplierId);

        const conditions: any[] = [];
        if (status) conditions.push(eq(purchaseOrders.status, status));
        if (supplierId) conditions.push(eq(purchaseOrders.supplierId, supplierId));

        const query = conditions.length
            ? db.select().from(purchaseOrders).where(and(...conditions)).orderBy(desc(purchaseOrders.createdAt))
            : db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.createdAt));

        const pos = await query.offset(0).fetch(100);
        res.json(pos);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Get PO by ID with items
 */
export const getPOById = async (req: Request, res: Response) => {
    try {
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'PO_ID_REQUIRED' });

        const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
        if (!po) {
            return res.status(404).json({ error: 'Purchase Order not found' });
        }

        const items = await db.select({
            id: purchaseOrderItems.id,
            itemId: purchaseOrderItems.itemId,
            itemName: inventoryItems.name,
            orderedQty: purchaseOrderItems.orderedQty,
            receivedQty: purchaseOrderItems.receivedQty,
            unitPrice: purchaseOrderItems.unitPrice,
        })
            .from(purchaseOrderItems)
            .innerJoin(inventoryItems, eq(purchaseOrderItems.itemId, inventoryItems.id))
            .where(eq(purchaseOrderItems.poId, id));

        res.json({ ...po, items });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Update PO status (e.g., DRAFT -> SENT)
 */
export const updatePOStatus = async (req: Request, res: Response) => {
    try {
        const id = getStringParam((req.params as any).id);
        if (!id) return res.status(400).json({ error: 'PO_ID_REQUIRED' });
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'STATUS_REQUIRED' });

        const [current] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
        if (!current) {
            return res.status(404).json({ error: 'Purchase Order not found' });
        }

        const currentStatus = String(current.status || 'DRAFT').toUpperCase();
        const requestedStatus = String(status).toUpperCase();
        const allowedTransitions: Record<string, string[]> = {
            DRAFT: ['PENDING_APPROVAL', 'CANCELLED'],
            PENDING_APPROVAL: ['ORDERED', 'CANCELLED'],
            ORDERED: ['SENT', 'CANCELLED'],
            SENT: ['PARTIAL', 'RECEIVED', 'CANCELLED'],
            PARTIAL: ['RECEIVED', 'CANCELLED'],
            RECEIVED: ['CLOSED'],
            CLOSED: [],
            CANCELLED: [],
        };

        const allowed = allowedTransitions[currentStatus] || [];
        if (!allowed.includes(requestedStatus)) {
            return res.status(400).json({
                error: `Invalid status transition from ${currentStatus} to ${requestedStatus}`,
            });
        }

        const [updated] = await db.update(purchaseOrders)
            .set({ status: requestedStatus, updatedAt: new Date() })
            .output()
            .where(eq(purchaseOrders.id, id));

        if (!updated) {
            return res.status(404).json({ error: 'Purchase Order not found' });
        }

        res.json(updated);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
