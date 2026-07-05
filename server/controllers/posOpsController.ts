import { Request, Response } from 'express';
import { db } from '../db';
import { orders, orderItems } from '../../src/db/schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import logger from '../utils/logger';

export const opsController = {
    // Advanced: Physically Split a Check
    async splitOrder(req: Request, res: Response) {
        try {
            const { parentOrderId, itemIdsToExtract } = req.body;
            
            if (!parentOrderId || !Array.isArray(itemIdsToExtract) || itemIdsToExtract.length === 0) {
                return res.status(400).json({ error: 'Valid parentOrderId and itemIdsToExtract are required.' });
            }

            // Fetch Parent Order
            const [parentOrder] = await db.select().from(orders).where(eq(orders.id, parentOrderId));
            if (!parentOrder) return res.status(404).json({ error: 'Parent order not found.' });
            if (parentOrder.isPaid) return res.status(400).json({ error: 'Cannot dynamically split an already paid checkout without full void.' });

            // Fetch Selected Items to Split
            const itemsToSplit = await db.select().from(orderItems).where(inArray(orderItems.id, itemIdsToExtract));
            if (itemsToSplit.length === 0) return res.status(400).json({ error: 'Selected items not found or already moved.' });

            // Calculate Split Totals
            const newSubtotal = itemsToSplit.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)), 0);
            const subtotalBase = Number(parentOrder.subtotal || 0);
            const taxRate = subtotalBase > 0 ? Number(parentOrder.tax || 0) / subtotalBase : 0;
            const newTax = Number((newSubtotal * taxRate).toFixed(2));
            const newTotal = Number((newSubtotal + newTax).toFixed(2));

            const childOrderId = `ORD-SPLIT-${nanoid(8)}`;

            await db.transaction(async (tx) => {
                // 1. Create Child Order referencing the parent
                await tx.insert(orders).values({
                    id: childOrderId,
                    parentOrderId: parentOrderId,
                    type: parentOrder.type,
                    source: parentOrder.source,
                    branchId: parentOrder.branchId,
                    tableId: parentOrder.tableId, // Stays at same table structurally
                    customerId: parentOrder.customerId,
                    status: parentOrder.status,
                    subtotal: newSubtotal,
                    tax: newTax,
                    total: newTotal,
                    createdAt: parentOrder.createdAt // Preserve original time for accurate SLA!
                });

                // 2. Re-assign item foreign keys
                await tx.update(orderItems)
                    .set({ orderId: childOrderId })
                    .where(inArray(orderItems.id, itemIdsToExtract));

                // 3. Deduct from Parent Order to prevent double inflation
                await tx.update(orders)
                    .set({
                        subtotal: sql`subtotal - ${newSubtotal}`,
                        tax: sql`tax - ${newTax}`,
                        total: sql`total - ${newTotal}`,
                    })
                    .where(eq(orders.id, parentOrderId));
            });

            logger.info({ parentOrderId, childOrderId, itemCount: itemsToSplit.length }, 'Check successfully split');
            res.json({ success: true, parentOrderId, childOrderId });
        } catch (error: any) {
            logger.error({ err: error }, 'Failed to split check');
            res.status(500).json({ error: error.message });
        }
    }
};
