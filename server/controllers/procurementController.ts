import { Request, Response } from 'express';
import { db } from '../db';
import { 
    purchaseOrders, 
    goodsReceiptNotes, 
    grnItems, 
    supplierInvoices, 
    supplierInvoiceItems,
    inventoryItems,
    inventoryStock,
    inventoryBatches,
    stockMovements,
    warehouses
} from '../../src/db/schema';
import { eq, inArray, and, sql, desc } from 'drizzle-orm';
import crypto from 'crypto';
import { GLService } from '../services/glService';
import { getStringParam } from '../utils/request';
import { getIO } from '../socket';
import { createSignedAuditLog } from '../services/auditService';

export const getGRNs = async (req: Request, res: Response) => {
    try {
        const supplierId = getStringParam(req.query.supplierId);
        const poId = getStringParam(req.query.poId);
        const conditions = [
            supplierId ? eq(goodsReceiptNotes.supplierId, supplierId) : undefined,
            poId ? eq(goodsReceiptNotes.poId, poId) : undefined,
        ].filter(Boolean) as any[];

        const rows = await db.select().from(goodsReceiptNotes)
            .where(conditions.length ? and(...conditions) : undefined)
            .orderBy(desc(goodsReceiptNotes.createdAt));

        const ids = rows.map((row) => row.id);
        const items = ids.length
            ? await db.select().from(grnItems).where(inArray(grnItems.grnId, ids))
            : [];

        res.json(rows.map((row) => ({
            ...row,
            items: items.filter((item) => item.grnId === row.id),
        })));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getSupplierInvoices = async (req: Request, res: Response) => {
    try {
        const supplierId = getStringParam(req.query.supplierId);
        const status = getStringParam(req.query.status);
        const conditions = [
            supplierId ? eq(supplierInvoices.supplierId, supplierId) : undefined,
            status ? eq(supplierInvoices.status, status) : undefined,
        ].filter(Boolean) as any[];

        const rows = await db.select().from(supplierInvoices)
            .where(conditions.length ? and(...conditions) : undefined)
            .orderBy(desc(supplierInvoices.createdAt));

        const ids = rows.map((row) => row.id);
        const items = ids.length
            ? await db.select().from(supplierInvoiceItems).where(inArray(supplierInvoiceItems.invoiceId, ids))
            : [];

        res.json(rows.map((row) => ({
            ...row,
            items: items.filter((item) => item.invoiceId === row.id),
        })));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Creates a Goods Receipt Note (GRN) from a PO
 */
export const createGRN = async (req: Request, res: Response) => {
    try {
        const { poId, supplierId, branchId, warehouseId, referenceNumber, items, userId, notes } = req.body;
        // items: { itemId, poItemId, receivedQty, unitPrice, batchNumber, expiryDate }[]

        if (!warehouseId || !items || items.length === 0) {
            return res.status(400).json({ error: 'warehouseId and items are required for GRN' });
        }

        const grnId = `GRN-${Date.now()}`;
        
        await db.transaction(async (tx) => {
            // 1. Create GRN Header
            await tx.insert(goodsReceiptNotes).values({
                id: grnId,
                poId,
                supplierId,
                branchId,
                receivedBy: userId,
                referenceNumber,
                notes,
                status: 'RECEIVED'
            });

            // 2. Insert GRN Items
            const itemsToInsert = items.map((item: any) => ({
                grnId,
                itemId: item.itemId,
                poItemId: item.poItemId,
                receivedQty: item.receivedQty,
                rejectedQty: item.rejectedQty || 0,
                unitPrice: item.unitPrice,
                batchNumber: item.batchNumber,
                expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
            }));
            
            await tx.insert(grnItems).values(itemsToInsert);
            
            // 3. Post to inventory ledger (batch transactions & moving average update)
            for (const item of itemsToInsert) {
                if (item.receivedQty > 0 && item.unitPrice > 0) {
                    
                    // A. Moving Average Cost Check
                    const iState = await tx.select({
                        costPrice: inventoryItems.costPrice,
                        stockRecordQty: inventoryStock.quantity
                    })
                    .from(inventoryItems)
                    .leftJoin(inventoryStock, and(eq(inventoryStock.itemId, inventoryItems.id), eq(inventoryStock.warehouseId, warehouseId)))
                    .where(eq(inventoryItems.id, item.itemId));

                    if (iState.length > 0) {
                        const currentCost = iState[0].costPrice || 0;
                        const totalQty = iState.reduce((sum, record) => sum + (record.stockRecordQty || 0), 0);
                        
                        const newTotalValue = (totalQty * currentCost) + (item.receivedQty * item.unitPrice);
                        const newTotalQty = totalQty + item.receivedQty;
                        const newMovingAverage = newTotalQty > 0 ? newTotalValue / newTotalQty : item.unitPrice;

                        await tx.update(inventoryItems)
                            .set({ costPrice: newMovingAverage, purchasePrice: item.unitPrice })
                            .where(eq(inventoryItems.id, item.itemId));
                    }

                    // B. Update Stock Levels
                    const existingStock = await tx.select().from(inventoryStock).where(and(eq(inventoryStock.itemId, item.itemId), eq(inventoryStock.warehouseId, warehouseId)));
                    if (existingStock.length > 0) {
                        await tx.update(inventoryStock).set({ quantity: sql`quantity + ${item.receivedQty}`, lastUpdated: new Date() }).where(and(eq(inventoryStock.itemId, item.itemId), eq(inventoryStock.warehouseId, warehouseId)));
                    } else {
                        await tx.insert(inventoryStock).values({ itemId: item.itemId, warehouseId, quantity: item.receivedQty, lastUpdated: new Date() });
                    }

                    // C. Create Stock Movement History
                    await tx.insert(stockMovements).values({
                        itemId: item.itemId,
                        toWarehouseId: warehouseId,
                        quantity: item.receivedQty,
                        unitCost: item.unitPrice,
                        totalCost: item.receivedQty * item.unitPrice,
                        type: 'PURCHASE',
                        referenceId: grnId,
                        reason: 'GRN Receipt',
                        performedBy: userId || 'system',
                        createdAt: new Date(),
                    });

                    // D. Create Batches for FEFO Engine
                    const defaultExpiry = new Date();
                    defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 1);

                    const batchExpiry = item.expiryDate || defaultExpiry;
                    const batchNum = item.batchNumber || `GRN-BATCH-${Date.now()}-${Math.floor(Math.random() * 100)}`;

                    await tx.insert(inventoryBatches).values({
                        id: `BATCH-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                        itemId: item.itemId,
                        warehouseId,
                        batchNumber: batchNum,
                        expiryDate: batchExpiry,
                        receivedDate: new Date(),
                        initialQty: item.receivedQty,
                        currentQty: item.receivedQty,
                        unitCost: item.unitPrice,
                        supplierId,
                        status: 'ACTIVE',
                        createdAt: new Date(),
                    });
                }
            }

            try {
                const [wh] = await tx.select({ branchId: warehouses.branchId }).from(warehouses).where(eq(warehouses.id, warehouseId));
                if (wh?.branchId) {
                    const branchRoom = `branch:${wh.branchId}`;
                    // We need the latest stock for all items received
                    const itemIds = itemsToInsert.map((i: any) => i.itemId);
                    const finalStocks = await tx.select().from(inventoryStock).where(
                        and(eq(inventoryStock.warehouseId, warehouseId), inArray(inventoryStock.itemId, itemIds))
                    );

                    for (const s of finalStocks) {
                        getIO().to(branchRoom).emit('stock:updated', {
                            itemId: s.itemId,
                            warehouseId: s.warehouseId,
                            quantity: Number(s.quantity || 0),
                            type: 'PURCHASE'
                        });
                    }
                }
            } catch (e) {
                console.warn('Failed to emit stock:updated for GRN', e);
            }
        });

        res.status(201).json({ id: grnId, status: 'RECEIVED' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Books an AP Bill (Supplier Invoice) and performs 3-Way Matching against GRN
 */
export const createSupplierInvoice = async (req: Request, res: Response) => {
    try {
        const { supplierId, grnId, invoiceNumber, date, dueDate, subtotal, tax, discount, total, items, userId, notes } = req.body;
        // items: { itemId, qty, unitPrice, total }[]

        // 3-WAY MATCHING LOGIC (Tolerance: 5%)
        let matchStatus = 'APPROVED'; // Assuming it matches or is within tolerance
        
        if (grnId) {
            // Fetch GRN items to compare
            const receivedItems = await db.select().from(grnItems).where(eq(grnItems.grnId, grnId));
            
            for (const invItem of items) {
                const matchedGrn = receivedItems.find(r => r.itemId === invItem.itemId);
                
                if (!matchedGrn) {
                    // Item billed but not received!
                    matchStatus = 'PENDING_APPROVAL';
                    break;
                }
                
                // Compare Qty
                if (invItem.qty > matchedGrn.receivedQty) {
                    matchStatus = 'PENDING_APPROVAL'; // Billing for more than received
                    break;
                }
                
                // Compare Price with 5% tolerance
                const expectedPrice = matchedGrn.unitPrice;
                const billedPrice = invItem.unitPrice;
                const difference = Math.abs(billedPrice - expectedPrice);
                const variancePercentage = (difference / expectedPrice) * 100;
                
                if (variancePercentage > 5) {
                    matchStatus = 'PENDING_APPROVAL'; // Price variance exceeds 5%
                    break;
                }
            }
        } else {
            // No GRN attached, needs manual approval
            matchStatus = 'PENDING_APPROVAL';
        }

        const invoiceId = `INV-${Date.now()}`;
        
        await db.transaction(async (tx) => {
            await tx.insert(supplierInvoices).values({
                id: invoiceId,
                supplierId,
                grnId,
                invoiceNumber,
                status: matchStatus,
                date: new Date(date),
                dueDate: dueDate ? new Date(dueDate) : null,
                subtotal,
                tax,
                discount,
                total,
                createdBy: userId,
                notes
            });

            const itemsToInsert = items.map((item: any) => ({
                invoiceId,
                itemId: item.itemId,
                qty: item.qty,
                unitPrice: item.unitPrice,
                total: item.total
            }));

            await tx.insert(supplierInvoiceItems).values(itemsToInsert);

            // Post to GL if Auto-Approved
            if (matchStatus === 'APPROVED') {
                const branchReq = grnId ? await tx.select().from(goodsReceiptNotes).where(eq(goodsReceiptNotes.id, grnId)).limit(1) : [];
                const branchId = branchReq[0]?.branchId || 'HQ';
                
                await GLService.postJournalEntry({
                    reference: invoiceId,
                    referenceType: 'MANUAL',
                    description: `AP Bill for Invoice ${invoiceNumber || invoiceId}`,
                    branchId,
                    createdBy: userId || 'system',
                    lines: [
                        { accountCode: '2100', debit: 0, credit: total }, // Accounts Payable
                        { accountCode: '2220', debit: tax, credit: 0 },   // Input VAT
                        { accountCode: '1300', debit: subtotal, credit: 0 } // Inventory Asset
                    ]
                });
            }
        });

        res.status(201).json({ id: invoiceId, matchStatus });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Approve PENDING_APPROVAL AP Bills
 */
export const approveSupplierInvoice = async (req: Request, res: Response) => {
    try {
        const id = getStringParam(req.params.id);
        if (!id) return res.status(400).json({ error: 'SUPPLIER_INVOICE_ID_REQUIRED' });
        const { userId } = req.body; // Approved by manager
        
        const invoice = await db.select().from(supplierInvoices).where(eq(supplierInvoices.id, id)).limit(1);
        if (!invoice.length) return res.status(404).json({ error: 'Not found' });
        
        if (invoice[0].status === 'APPROVED' || invoice[0].status === 'PAID') {
            return res.status(400).json({ error: 'Already processed' });
        }

        await db.update(supplierInvoices).set({ status: 'APPROVED' }).where(eq(supplierInvoices.id, id));
        
        // Post GL exactly like above...
        await GLService.postJournalEntry({
            reference: id,
            referenceType: 'MANUAL',
            description: `AP Bill (Manager Approved) ${invoice[0].invoiceNumber}`,
            createdBy: userId,
            lines: [
                { accountCode: '2100', debit: 0, credit: invoice[0].total! }, 
                { accountCode: '2220', debit: invoice[0].tax!, credit: 0 },   
                { accountCode: '1300', debit: invoice[0].subtotal!, credit: 0 } // Inventory Asset
            ]
        });

        await createSignedAuditLog({
            eventType: 'SUPPLIER_INVOICE_APPROVED',
            userId: userId || 'system',
            branchId: null, // HQ level approval usually
            payload: { invoiceId: id, total: invoice[0].total },
            reason: 'Manager approved supplier invoice variance (3-way match exception)',
            sourceDevice: req.headers['user-agent'] || 'unknown',
            requestId: req.headers['x-request-id'] as string || `req-${Date.now()}`
        });

        res.json({ success: true, status: 'APPROVED' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
