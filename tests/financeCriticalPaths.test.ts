import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { branches, journalEntries, journalLines } from '../src/db/schema';
import { db } from '../server/db';
import { COASeedService } from '../server/services/coaSeedService';
import { GLService } from '../server/services/glService';
import { postPurchaseReceiptEntry } from '../server/services/financePostingService';

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const branchId = `test-finance-critical-${suffix}`;
const actorId = `test-finance-actor-${suffix}`;
const saleReference = `test-finance-sale-${suffix}`;
const purchaseReference = `test-finance-purchase-${suffix}`;
const expenseReference = `test-finance-expense-${suffix}`;

describe('finance critical paths', () => {
    beforeAll(async () => {
        await COASeedService.seed();
        await db.insert(branches).values({
            id: branchId,
            name: 'Finance Critical Path Branch',
            isActive: true,
        });
    });

    afterAll(async () => {
        const entries = await db.select({ id: journalEntries.id })
            .from(journalEntries)
            .where(and(
                eq(journalEntries.branchId, branchId),
            ));
        for (const entry of entries) {
            await db.delete(journalLines).where(eq(journalLines.journalEntryId, entry.id));
        }
        await db.delete(journalEntries).where(eq(journalEntries.branchId, branchId));
        await db.delete(branches).where(eq(branches.id, branchId));
    });

    it('posts a sale with complete provenance and idempotent retry behavior', async () => {
        const first = await GLService.postSalesOrder(
            saleReference,
            100,
            14,
            'CASH',
            114,
            branchId,
            'TAKEAWAY',
            { actorId, source: 'POS_ORDER', correlationId: `sale-correlation-${suffix}` },
        );
        const second = await GLService.postSalesOrder(
            saleReference,
            100,
            14,
            'CASH',
            114,
            branchId,
            'TAKEAWAY',
            { actorId, source: 'POS_ORDER', correlationId: `sale-correlation-${suffix}` },
        );

        expect(first).toMatchObject({ entryId: expect.any(String) });
        expect(second).toMatchObject({ entryId: (first as any).entryId, duplicate: true });
        const rows = await db.select().from(journalEntries).where(eq(journalEntries.reference, saleReference));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            branchId,
            source: 'POS_ORDER',
            actorId,
            correlationId: `sale-correlation-${suffix}`,
        });
    });

    it('posts procurement, operating expense, and a balanced refund reversal', async () => {
        const purchase = await postPurchaseReceiptEntry({
            poId: purchaseReference,
            amount: 50,
            branchId,
            userId: actorId,
        });
        expect(purchase.status).toBe('posted');

        const expense = await GLService.postJournalEntry({
            reference: expenseReference,
            referenceType: 'EXPENSE',
            description: 'Critical path operating expense',
            branchId,
            createdBy: actorId,
            source: 'EXPENSE_ENTRY',
            correlationId: `expense-correlation-${suffix}`,
            lines: [
                { accountCode: '6200', debit: 25, credit: 0 },
                { accountCode: '1110', debit: 0, credit: 25 },
            ],
        });
        expect(expense).toMatchObject({ entryId: expect.any(String) });

        const reversal = await GLService.reverseEntry(
            (expense as any).entryId,
            `test-finance-refund-${suffix}`,
            actorId,
        );
        expect(reversal).toMatchObject({ entryId: expect.any(String) });

        const rows = await db.select().from(journalEntries).where(eq(journalEntries.branchId, branchId));
        expect(rows.map((row) => row.referenceType)).toEqual(expect.arrayContaining(['GRN', 'EXPENSE', 'REFUND']));
        expect(rows.every((row) => row.branchId === branchId && row.actorId)).toBe(true);
    });
});
