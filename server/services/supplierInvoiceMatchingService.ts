/**
 * Supplier Invoice 3-Way Matching Service — P1 Financial Backbone
 *
 * Compares three documents before an invoice is allowed to be paid:
 * 1. Purchase Order (what we asked for) — purchaseOrderItems.orderedQty / unitPrice
 * 2. Goods Receipt Note (what actually arrived) — grnItems.receivedQty / unitPrice
 * 3. Supplier Invoice (what the supplier bills) — supplierInvoiceItems.qty / unitPrice
 *
 * matchStatus:
 * - MATCHED        : all three agree (quantity & price within 2% tolerance)
 * - VARIANCE       : quantities/prices disagree beyond tolerance → requires manual review
 * - MANUAL_REVIEW  : forced by an accountant (notes why)
 *
 * Day close / payment flows should gate approval on matchStatus = MATCHED.
 */

import { db } from '../db';
import {
    supplierInvoices,
    supplierInvoiceItems,
    supplierInvoiceMatches,
    goodsReceiptNotes,
    grnItems,
    purchaseOrders,
    purchaseOrderItems,
    suppliers,
} from '../../src/db/schema';
import { eq, sql, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import logger from '../utils/logger';

const QUANTITY_TOLERANCE = 0.02; // 2%
const PRICE_TOLERANCE = 0.02;

export const matchingService = {
    /** Compute a fresh 3-way match for a supplier invoice that has a GRN. */
    computeMatch: async (supplierInvoiceId: string) => {
        const [invoice] = await db.select().from(supplierInvoices)
            .where(eq(supplierInvoices.id, supplierInvoiceId));
        if (!invoice) throw Object.assign(new Error('SUPPLIER_INVOICE_NOT_FOUND'), { status: 404, code: 'SUPPLIER_INVOICE_NOT_FOUND' });

        let poTotal: number | null = null;
        let grnTotal: number | null = null;
        let poId: string | null = null;
        let grnId: string | null = null;
        let quantityVariance = 0;
        let priceVariance = 0;

        const [grn] = await db.select().from(goodsReceiptNotes)
            .where(eq(goodsReceiptNotes.id, invoice.grnId || '')).limit(1);
        if (grn) {
            grnId = grn.id;
            poId = grn.poId;
            const grnRows = await db.select({ qty: grnItems.receivedQty, price: grnItems.unitPrice })
                .from(grnItems).where(eq(grnItems.grnId, grn.id));
            grnTotal = grnRows.reduce((s, r) => s + Number(r.qty) * Number(r.price), 0);
        }

        if (poId) {
            const poRows = await db.select({ qty: purchaseOrderItems.orderedQty, price: purchaseOrderItems.unitPrice })
                .from(purchaseOrderItems).where(eq(purchaseOrderItems.poId, poId));
            poTotal = poRows.reduce((s, r) => s + Number(r.qty) * Number(r.price), 0);
        }

        const invRows = await db.select({ qty: supplierInvoiceItems.qty, price: supplierInvoiceItems.unitPrice })
            .from(supplierInvoiceItems).where(eq(supplierInvoiceItems.invoiceId, supplierInvoiceId));
        const invoiceTotal = invRows.reduce((s, r) => s + Number(r.qty) * Number(r.price), 0) || Number(invoice.total);

        // Line-level variance detection: invoice qty vs GRN qty, invoice price vs PO price.
        const invTotalQty = invRows.reduce((s, r) => s + Number(r.qty), 0);
        let grnQtySum = 0;
        let poQtySum = 0;
        let poPriceSum = 0;
        let poCount = 0;
        if (grnId) {
            const grnRows = await db.select({ qty: grnItems.receivedQty }).from(grnItems).where(eq(grnItems.grnId, grnId));
            grnQtySum = grnRows.reduce((s, r) => s + Number(r.qty), 0);
        }
        if (poId) {
            const poRows = await db.select({ qty: purchaseOrderItems.orderedQty, price: purchaseOrderItems.unitPrice })
                .from(purchaseOrderItems).where(eq(purchaseOrderItems.poId, poId));
            poQtySum = poRows.reduce((s, r) => s + Number(r.qty), 0);
            poPriceSum = poRows.reduce((s, r) => s + Number(r.price), 0);
            poCount = poRows.length;
        }
        if (grnQtySum > 0) {
            quantityVariance = Math.round(((invTotalQty - grnQtySum) / grnQtySum) * 10000) / 100;
        }
        if (poCount > 0) {
            const invPriceAvg = invoiceTotal / (invTotalQty || 1);
            const avgPoPrice = poPriceSum / poCount;
            priceVariance = Math.round(((invPriceAvg - avgPoPrice) / (avgPoPrice || 1)) * 10000) / 100;
        }

        let matchStatus = 'MATCHED';
        if (Math.abs(quantityVariance) > QUANTITY_TOLERANCE * 100 || Math.abs(priceVariance) > PRICE_TOLERANCE * 100) {
            matchStatus = 'VARIANCE';
        }

        const id = randomUUID();
        await db.insert(supplierInvoiceMatches).values({
            id,
            supplierInvoiceId,
            purchaseOrderId: poId,
            grnId,
            expectedTotal: String(poTotal ?? 0),
            grnTotal: String(grnTotal ?? 0),
            invoiceTotal: String(invoiceTotal ?? 0),
            quantityVariance: String(quantityVariance),
            priceVariance: String(priceVariance),
            matchStatus,
        });
        const [match] = await db.select().from(supplierInvoiceMatches).where(eq(supplierInvoiceMatches.id, id));
        return match;
    },

    /** Force a manual review outcome (accountant overrides the automatic result). */
    updateMatch: async (matchId: string, override: { matchStatus: 'MATCHED' | 'VARIANCE' | 'MANUAL_REVIEW'; notes?: string }, reviewedBy: string) => {
        const [match] = await db.select().from(supplierInvoiceMatches)
            .where(eq(supplierInvoiceMatches.id, matchId));
        if (!match) throw Object.assign(new Error('MATCH_NOT_FOUND'), { status: 404, code: 'MATCH_NOT_FOUND' });
        await db.update(supplierInvoiceMatches).set({
            matchStatus: override.matchStatus,
            notes: [match.notes, override.notes].filter(Boolean).join(' | ') || null,
            reviewedBy,
            reviewedAt: new Date(),
            updatedAt: new Date(),
        }).where(eq(supplierInvoiceMatches.id, matchId));
        const [updated] = await db.select().from(supplierInvoiceMatches).where(eq(supplierInvoiceMatches.id, matchId));
        return updated;
    },

    latestMatchForInvoice: async (supplierInvoiceId: string) => {
        const rows = await db.select().from(supplierInvoiceMatches)
            .where(eq(supplierInvoiceMatches.supplierInvoiceId, supplierInvoiceId))
            .orderBy(sql`${supplierInvoiceMatches.createdAt} DESC`).limit(1);
        return rows[0] || null;
    },

    listMatches: async (supplierId: string) => {
        const invoices = await db.select({ id: supplierInvoices.id }).from(supplierInvoices)
            .where(eq(supplierInvoices.supplierId, supplierId));
        if (invoices.length === 0) return [];
        return db.select().from(supplierInvoiceMatches)
            .where(inArray(supplierInvoiceMatches.supplierInvoiceId, invoices.map(i => i.id)))
            .orderBy(sql`${supplierInvoiceMatches.createdAt} DESC`);
    },

    /** Blocking check: approve-payment should require MATCHED (or MANUAL_REVIEW with sign-off). */
    isMatchBlockingPayment: async (supplierInvoiceId: string) => {
        const match = await matchingService.latestMatchForInvoice(supplierInvoiceId);
        return match && match.matchStatus !== 'MATCHED';
    },
};

export default matchingService;
