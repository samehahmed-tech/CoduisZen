import { Request, Response } from 'express';
import { db } from '../db';
import { 
    purchaseOrders, 
    purchaseOrderItems,
    goodsReceiptNotes, 
    grnItems, 
    supplierInvoices, 
    supplierInvoiceItems,
    inventoryItems,
    inventoryStock,
    inventoryBatches,
    stockMovements,
    warehouses,
    idempotencyKeys,
} from '../../src/db/schema';
import { eq, inArray, and, sql, desc, gt } from 'drizzle-orm';
import crypto from 'crypto';
import { GLService } from '../services/glService';
import { getStringParam } from '../utils/request';
import { getIO } from '../socket';
import { createSignedAuditLog } from '../services/auditService';
import { buildRequestHash } from '../services/idempotencyService';
import { resolveSystemAccountCode, resolveTaxAccountCode } from '../services/financePostingService';

const PO_RECEIPT_SCOPE = 'PURCHASE_ORDER_GRN';
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Supplier purchase return (spoiled / short / wrong delivery): decrements
 * aggregate stock, records a PURCHASE_RETURN movement, and posts a supplier
 * credit note (debit AP 2100 / credit inventory 1210). Batch rows are left
 * untouched (aggregate-level return, reconciled by stock count).
 */
export const createPurchaseReturn = async (req: Request, res: Response) => {
    try {
        const body = req.body || {};
        const warehouseId = String(body.warehouseId || '').trim();
        const supplierId = String(body.supplierId || '').trim() || null;
        const items = Array.isArray(body.items) ? body.items : [];
        const reason = String(body.reason || '').trim();
        const creditNoteRef = String(body.creditNoteRef || body.referenceNumber || '').trim();
        const userId = String((req as any)?.user?.id || body.createdBy || 'system');
        if (!warehouseId || items.length === 0 || reason.length < 3) {
            return res.status(400).json({ error: 'WAREHOUSE_ITEMS_REASON_REQUIRED', code: 'WAREHOUSE_ITEMS_REASON_REQUIRED' });
        }
        const [warehouse] = await db.select({ id: warehouses.id, branchId: warehouses.branchId })
            .top(1).from(warehouses).where(eq(warehouses.id, warehouseId));
        if (!warehouse) return res.status(404).json({ error: 'WAREHOUSE_NOT_FOUND', code: 'WAREHOUSE_NOT_FOUND' });

        const returnId = `PRET-${Date.now().toString(36).toUpperCase()}`;
        let totalValue = 0;
        const returned: Array<{ itemId: string; quantity: number; unitPrice: number }> = [];
        const skipped: Array<{ itemId: string; reason: string }> = [];

        await db.transaction(async (tx) => {
            for (const line of items) {
                const itemId = String(line.itemId || line.inventoryItemId || '').trim();
                const qty = Number(line.quantity || line.qty || 0);
                const unitPrice = Number(line.unitPrice ?? line.price ?? 0);
                if (!itemId || !(qty > 0)) {
                    skipped.push({ itemId: itemId || '?', reason: 'INVALID_LINE' });
                    continue;
                }
                const [stock] = await tx.select({ quantity: inventoryStock.quantity }).from(inventoryStock)
                    .where(and(eq(inventoryStock.itemId, itemId), eq(inventoryStock.warehouseId, warehouseId)));
                if (Number(stock?.quantity || 0) + 1e-6 < qty) {
                    skipped.push({ itemId, reason: 'INSUFFICIENT_STOCK' });
                    continue;
                }
                await tx.update(inventoryStock)
                    .set({ quantity: sql`${inventoryStock.quantity} - ${qty}`, lastUpdated: new Date() })
                    .where(and(
                        eq(inventoryStock.itemId, itemId),
                        eq(inventoryStock.warehouseId, warehouseId),
                        sql`${inventoryStock.quantity} >= ${qty}`,
                    ));
                await tx.insert(stockMovements).values({
                    itemId,
                    fromWarehouseId: warehouseId,
                    quantity: qty,
                    unitCost: unitPrice,
                    totalCost: qty * unitPrice,
                    type: 'PURCHASE_RETURN',
                    referenceId: returnId,
                    reason: `Supplier return${supplierId ? ` / ${supplierId}` : ''}: ${reason}`,
                    performedBy: userId,
                    createdAt: new Date(),
                });
                totalValue += qty * unitPrice;
                returned.push({ itemId, quantity: qty, unitPrice });
            }
            if (returned.length === 0) {
                throw Object.assign(new Error('NOTHING_RETURNABLE'), { status: 409 });
            }
        });

        // Supplier credit note (best-effort GL, audited on failure).
        let glEntryId: string | null = null;
        try {
            const [apAccount, invAccount] = await Promise.all([
                resolveSystemAccountCode('PURCHASE_RETURN', 'DEBIT', '2100'),
                resolveSystemAccountCode('PURCHASE_RETURN', 'CREDIT', '1210'),
            ]);
            const result = await GLService.postJournalEntry({
                reference: returnId,
                referenceType: 'MANUAL',
                description: `Supplier return ${returnId}${creditNoteRef ? ` / ${creditNoteRef}` : ''} — ${reason}`.slice(0, 200),
                branchId: (warehouse as any).branchId,
                createdBy: userId,
                lines: [
                    { accountCode: apAccount, debit: totalValue, credit: 0 },
                    { accountCode: invAccount, debit: 0, credit: totalValue },
                ],
            });
            glEntryId = typeof result === 'string' ? null : (result as any)?.entryId || null;
        } catch (error: any) {
            await createSignedAuditLog({
                eventType: 'PURCHASE_RETURN_GL_FAILED',
                userId,
                branchId: (warehouse as any).branchId,
                payload: { returnId, totalValue, error: String(error?.message || error) },
            }).catch(() => undefined);
        }

        try {
            getIO().to(`branch:${(warehouse as any).branchId}`).emit('stock:updated', { reason: 'PURCHASE_RETURN', referenceId: returnId });
        } catch { /* socket optional */ }
        await createSignedAuditLog({
            eventType: 'PURCHASE_RETURN_CREATED',
            userId,
            branchId: (warehouse as any).branchId,
            payload: { returnId, supplierId, totalValue, lines: returned.length, creditNoteRef, reason },
        }).catch(() => undefined);

        res.status(201).json({ id: returnId, totalValue, returned, skipped, glEntryId });
    } catch (error: any) {
        const status = Number((error as any)?.status) || 500;
        res.status(status).json({ error: (error as any)?.message || 'PURCHASE_RETURN_FAILED', code: (error as any)?.message || 'PURCHASE_RETURN_FAILED' });
    }
};

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
    const idempotencyKey = String(req.body?.referenceNumber || '').trim() || undefined;
    const requestHash = idempotencyKey
        ? buildRequestHash({
            poId: req.body?.poId,
            warehouseId: req.body?.warehouseId,
            items: req.body?.items,
        })
        : undefined;
    const idempotencyExpiry = new Date(Date.now() + IDEMPOTENCY_TTL_MS);
    let ownsIdempotencyClaim = false;

    const replayIdempotentReceipt = async () => {
        if (!idempotencyKey || !requestHash) return null;
        const [claim] = await db.select().top(1).from(idempotencyKeys).where(and(
            eq(idempotencyKeys.key, idempotencyKey),
            eq(idempotencyKeys.scope, PO_RECEIPT_SCOPE),
            gt(idempotencyKeys.expiresAt, new Date()),
        ));
        if (!claim) return null;
        if (claim.requestHash !== requestHash) {
            return res.status(409).json({ error: 'IDEMPOTENCY_KEY_PAYLOAD_CONFLICT' });
        }
        if (claim.responseBody) {
            const storedResponse = typeof claim.responseBody === 'string'
                ? JSON.parse(claim.responseBody)
                : claim.responseBody;
            return res.status(200).json({
                ...storedResponse,
                idempotentReplay: true,
            });
        }
        return res.status(409).json({ error: 'IDEMPOTENCY_KEY_IN_PROGRESS' });
    };

    try {
        const { poId, supplierId, branchId, warehouseId, referenceNumber, items, userId, notes } = req.body;
        // items: { itemId, poItemId, receivedQty, unitPrice, batchNumber, expiryDate }[]

        if (!warehouseId || !items || items.length === 0) {
            return res.status(400).json({ error: 'warehouseId and items are required for GRN' });
        }
        if (poId && !referenceNumber) {
            return res.status(400).json({ error: 'referenceNumber is required for PO receipts' });
        }

        if (idempotencyKey && requestHash) {
            const replay = await replayIdempotentReceipt();
            if (replay) return replay;
            try {
                await db.insert(idempotencyKeys).values({
                    key: idempotencyKey,
                    scope: PO_RECEIPT_SCOPE,
                    requestHash,
                    status: 'IN_PROGRESS',
                    expiresAt: idempotencyExpiry,
                    updatedAt: new Date(),
                });
                ownsIdempotencyClaim = true;
            } catch {
                const concurrentReplay = await replayIdempotentReceipt();
                if (concurrentReplay) return concurrentReplay;
                throw new Error('IDEMPOTENCY_CLAIM_FAILED');
            }
        }

        if (poId && referenceNumber) {
            const [existingReceipt] = await db.select().top(1).from(goodsReceiptNotes).where(and(
                eq(goodsReceiptNotes.poId, poId),
                eq(goodsReceiptNotes.referenceNumber, referenceNumber),
            ));
            if (existingReceipt) {
                const responseBody = { id: existingReceipt.id, status: existingReceipt.status, idempotentReplay: true };
                if (ownsIdempotencyClaim && idempotencyKey) {
                    await db.update(idempotencyKeys).set({
                        status: 'COMPLETED',
                        responseCode: 200,
                        resourceId: existingReceipt.id,
                        responseBody: JSON.stringify(responseBody),
                        expiresAt: idempotencyExpiry,
                        updatedAt: new Date(),
                    }).where(and(
                        eq(idempotencyKeys.key, idempotencyKey),
                        eq(idempotencyKeys.scope, PO_RECEIPT_SCOPE),
                    ));
                }
                return res.status(200).json(responseBody);
            }
        }

        const grnId = `GRN-${crypto.randomUUID()}`;
        
        await db.transaction(async (tx) => {
            const [poHeader] = poId
                ? await tx.select().top(1).from(purchaseOrders).where(eq(purchaseOrders.id, poId))
                : [null];
            if (poId && !poHeader) throw new Error('PURCHASE_ORDER_NOT_FOUND');
            if (poHeader && !['SENT', 'PARTIAL', 'ORDERED'].includes(String(poHeader.status || '').toUpperCase())) {
                throw new Error(`PO_STATUS_NOT_RECEIVABLE:${poHeader.status}`);
            }

            const [warehouse] = await tx.select().top(1).from(warehouses).where(eq(warehouses.id, warehouseId));
            if (!warehouse) throw new Error('WAREHOUSE_NOT_FOUND');
            if (poHeader?.targetWarehouseId && poHeader.targetWarehouseId !== warehouseId) {
                throw new Error('PO_TARGET_WAREHOUSE_MISMATCH');
            }
            const authoritativeBranchId = poHeader?.branchId || branchId;
            if (authoritativeBranchId && warehouse.branchId && warehouse.branchId !== authoritativeBranchId) {
                throw new Error('WAREHOUSE_BRANCH_MISMATCH');
            }

            const itemsToInsert = [];
            for (const item of items) {
                const receivedQty = Number(item.receivedQty);
                if (!Number.isFinite(receivedQty) || receivedQty <= 0) {
                    throw new Error(`INVALID_RECEIVED_QUANTITY:${item.itemId}`);
                }

                let poLine: typeof purchaseOrderItems.$inferSelect | undefined;
                if (poHeader) {
                    const [matchedLine] = await tx.select().top(1).from(purchaseOrderItems).where(and(
                        eq(purchaseOrderItems.poId, poHeader.id),
                        item.poItemId
                            ? eq(purchaseOrderItems.id, Number(item.poItemId))
                            : eq(purchaseOrderItems.itemId, item.itemId),
                    ));
                    if (!matchedLine || matchedLine.itemId !== item.itemId) {
                        throw new Error(`PO_ITEM_NOT_FOUND:${item.itemId}`);
                    }

                    const [updatedLine] = await tx.update(purchaseOrderItems)
                        .set({ receivedQty: sql`COALESCE(${purchaseOrderItems.receivedQty}, 0) + ${receivedQty}` })
                        .output()
                        .where(and(
                            eq(purchaseOrderItems.id, matchedLine.id),
                            sql`COALESCE(${purchaseOrderItems.receivedQty}, 0) + ${receivedQty} <= ${purchaseOrderItems.orderedQty}`,
                        ));
                    if (!updatedLine) throw new Error(`RECEIVED_QUANTITY_EXCEEDS_REMAINING:${item.itemId}`);
                    poLine = matchedLine;
                }

                const unitPrice = Number(poLine?.unitPrice ?? item.unitPrice);
                if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
                    throw new Error(`INVALID_UNIT_PRICE:${item.itemId}`);
                }

                itemsToInsert.push({
                    grnId,
                    itemId: item.itemId,
                    poItemId: poLine?.id || item.poItemId,
                    receivedQty,
                    rejectedQty: Number(item.rejectedQty || 0),
                    unitPrice,
                    batchNumber: item.batchNumber,
                    expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
                });
            }

            // 1. Create GRN Header
            await tx.insert(goodsReceiptNotes).values({
                id: grnId,
                poId,
                supplierId: poHeader?.supplierId || supplierId,
                branchId: authoritativeBranchId,
                receivedBy: userId,
                referenceNumber,
                notes,
                status: 'RECEIVED'
            });

            // 2. Insert GRN Items
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
                        supplierId: poHeader?.supplierId || supplierId,
                        status: 'ACTIVE',
                        createdAt: new Date(),
                    });
                }
            }

            if (poHeader) {
                const updatedLines = await tx.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.poId, poHeader.id));
                const allReceived = updatedLines.every(line => Number(line.receivedQty || 0) >= Number(line.orderedQty || 0));
                const anyReceived = updatedLines.some(line => Number(line.receivedQty || 0) > 0);
                await tx.update(purchaseOrders).set({
                    status: allReceived ? 'RECEIVED' : anyReceived ? 'PARTIAL' : poHeader.status,
                    updatedAt: new Date(),
                }).where(eq(purchaseOrders.id, poHeader.id));
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

        const responseBody = { id: grnId, status: 'RECEIVED' };
        if (ownsIdempotencyClaim && idempotencyKey) {
            await db.update(idempotencyKeys).set({
                status: 'COMPLETED',
                responseCode: 201,
                resourceId: grnId,
                responseBody: JSON.stringify(responseBody),
                expiresAt: idempotencyExpiry,
                updatedAt: new Date(),
            }).where(and(
                eq(idempotencyKeys.key, idempotencyKey),
                eq(idempotencyKeys.scope, PO_RECEIPT_SCOPE),
            ));
        }
        res.status(201).json(responseBody);
    } catch (error: any) {
        if (ownsIdempotencyClaim && idempotencyKey) {
            await db.delete(idempotencyKeys).where(and(
                eq(idempotencyKeys.key, idempotencyKey),
                eq(idempotencyKeys.scope, PO_RECEIPT_SCOPE),
            ));
        } else {
            const replay = await replayIdempotentReceipt();
            if (replay) return replay;
        }
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
                const branchReq = grnId ? await tx.select().top(1).from(goodsReceiptNotes).where(eq(goodsReceiptNotes.id, grnId)) : [];
                const branchId = branchReq[0]?.branchId;
                if (!branchId) throw new Error('SUPPLIER_INVOICE_BRANCH_REQUIRED');
                // A GRN already posted the inventory value. The invoice only
                // adds input VAT and the tax portion of the payable, avoiding
                // a second inventory and AP posting.
                const [inventoryAccount, payableAccount, inputTaxAccount] = await Promise.all([
                    resolveSystemAccountCode('SUPPLIER_INVOICE', 'DEBIT', '1210'),
                    resolveSystemAccountCode('SUPPLIER_INVOICE', 'CREDIT', '2100'),
                    resolveTaxAccountCode('INPUT_VAT', '2220'),
                ]);
                const lines = grnId
                    ? [
                        { accountCode: inputTaxAccount, debit: Number(tax || 0), credit: 0 },
                        { accountCode: payableAccount, debit: 0, credit: Number(tax || 0) },
                    ]
                    : [
                        { accountCode: inventoryAccount, debit: Number(subtotal || 0), credit: 0 },
                        { accountCode: inputTaxAccount, debit: Number(tax || 0), credit: 0 },
                        { accountCode: payableAccount, debit: 0, credit: Number(total || 0) },
                    ];
                
                await GLService.postJournalEntry({
                    reference: invoiceId,
                    referenceType: 'SUPPLIER_INVOICE',
                    description: `AP Bill for Invoice ${invoiceNumber || invoiceId}`,
                    branchId,
                    createdBy: userId || 'system',
                    lines,
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
        
        const invoice = await db.select().top(1).from(supplierInvoices).where(eq(supplierInvoices.id, id));
        if (!invoice.length) return res.status(404).json({ error: 'Not found' });
        
        if (invoice[0].status === 'APPROVED' || invoice[0].status === 'PAID') {
            return res.status(400).json({ error: 'Already processed' });
        }

        const branchReq = invoice[0].grnId
            ? await db.select().top(1).from(goodsReceiptNotes).where(eq(goodsReceiptNotes.id, invoice[0].grnId))
            : [];
        const branchId = branchReq[0]?.branchId;
        if (!branchId) return res.status(409).json({ error: 'SUPPLIER_INVOICE_BRANCH_REQUIRED' });

        await db.update(supplierInvoices).set({ status: 'APPROVED' }).where(eq(supplierInvoices.id, id));
        
        // Post GL exactly like above...
        const [inventoryAccount, payableAccount, inputTaxAccount] = await Promise.all([
            resolveSystemAccountCode('SUPPLIER_INVOICE', 'DEBIT', '1210'),
            resolveSystemAccountCode('SUPPLIER_INVOICE', 'CREDIT', '2100'),
            resolveTaxAccountCode('INPUT_VAT', '2220'),
        ]);
        const invoiceLines = invoice[0].grnId
            ? [
                { accountCode: inputTaxAccount, debit: Number(invoice[0].tax || 0), credit: 0 },
                { accountCode: payableAccount, debit: 0, credit: Number(invoice[0].tax || 0) },
            ]
            : [
                { accountCode: inventoryAccount, debit: Number(invoice[0].subtotal || 0), credit: 0 },
                { accountCode: inputTaxAccount, debit: Number(invoice[0].tax || 0), credit: 0 },
                { accountCode: payableAccount, debit: 0, credit: Number(invoice[0].total || 0) },
            ];
        await GLService.postJournalEntry({
            reference: id,
            referenceType: 'SUPPLIER_INVOICE',
            description: `AP Bill (Manager Approved) ${invoice[0].invoiceNumber}`,
            branchId,
            createdBy: userId || req.user?.id || 'system',
            lines: invoiceLines,
        });

        await createSignedAuditLog({
            eventType: 'SUPPLIER_INVOICE_APPROVED',
            userId: userId || 'system',
            branchId,
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
