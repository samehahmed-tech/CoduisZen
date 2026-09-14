import { GLService } from './glService';
import { db } from '../db';
import { financeExceptions, journalEntries, journalLines, orders, postingRules, taxAccounts, chartOfAccounts } from '../../src/db/schema';
import { and, eq } from 'drizzle-orm';
import logger from '../utils/logger';
import { randomUUID } from 'crypto';

const log = logger.child({ service: 'financePosting' });

/** Resolve an operational account from the editable system mapping table. */
export const resolveSystemAccountCode = async (documentType: string, direction: 'DEBIT' | 'CREDIT', fallback?: string) => {
    const [rule] = await db.select({ accountCode: postingRules.accountCode })
        .from(postingRules)
        .where(and(
            eq(postingRules.documentType, documentType),
            eq(postingRules.amountSource, 'SYSTEM'),
            eq(postingRules.direction, direction),
            eq(postingRules.isActive, true),
        ))
        .top(1);
    return rule?.accountCode || fallback || '';
};

export const resolveTaxAccountCode = async (taxType: string, fallback?: string) => {
    const [row] = await db.select({ code: chartOfAccounts.code })
        .from(taxAccounts)
        .innerJoin(chartOfAccounts, and(eq(taxAccounts.accountId, chartOfAccounts.id), eq(chartOfAccounts.isActive, true)))
        .where(eq(taxAccounts.taxType, taxType))
        .top(1);
    return row?.code || fallback || '';
};

type FinancePostingResult =
    | { status: 'posted'; entryId: string }
    | { status: 'failed'; exceptionId: string; reason: string }
    | { status: 'skipped'; reason: string };

const createFinanceException = async (input: {
    reference: string;
    referenceType: string;
    reason: string;
    payload: unknown;
    branchId?: string;
}): Promise<FinancePostingResult> => {
    const id = randomUUID();
    await db.insert(financeExceptions).values({
        id,
        reference: input.reference,
        referenceType: input.referenceType,
        payload: input.payload,
        reason: input.reason,
        branchId: input.branchId,
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    return { status: 'failed', exceptionId: id, reason: input.reason };
};

export const postPosOrderEntry = async (data: { orderId: string; amount: number; branchId?: string; userId?: string }) => {
    try {
        const [order] = await db.select().top(1).from(orders).where(eq(orders.id, data.orderId));
        if (!order) {
            return await createFinanceException({
                reference: data.orderId,
                referenceType: 'ORDER',
                reason: 'ORDER_NOT_FOUND_FOR_POS_POSTING',
                payload: data,
            });
        }

        const result = await GLService.postSalesOrder(
            order.id,
            order.subtotal || 0,
            order.tax || 0,
            order.paymentMethod || 'CASH',
            data.amount,
            order.branchId || '',
            order.type || 'DINE_IN'
        );

        if (typeof result === 'string') {
            return { status: 'failed', exceptionId: result, reason: 'GL_EXCEPTION_CREATED' } satisfies FinancePostingResult;
        }

        if (result?.entryId) {
            return { status: 'posted', entryId: result.entryId } satisfies FinancePostingResult;
        }

        return await createFinanceException({
            reference: order.id,
            referenceType: 'ORDER',
            reason: 'POS_POSTING_RETURNED_NO_STATUS',
            payload: { ...data, order },
        });
    } catch (err) {
        log.error({ orderId: data.orderId, err: (err as any)?.message }, 'GL Sync Failed (POS_ORDER)');
        return await createFinanceException({
            reference: data.orderId,
            referenceType: 'ORDER',
            reason: `POS_POSTING_THROWN|${(err as any)?.message || 'Unknown error'}`,
            payload: data,
        });
    }
};

export const postPurchaseReceiptEntry = async (data: { poId: string; amount: number; branchId?: string; userId?: string }) => {
    const amount = Number(data.amount || 0);
    if (amount <= 0) return { status: 'skipped', reason: 'NO_RECEIPT_VALUE' } satisfies FinancePostingResult;
    try {
        const [inventoryAccount, payableAccount] = await Promise.all([
            resolveSystemAccountCode('PURCHASE_RECEIPT', 'DEBIT', '1210'),
            resolveSystemAccountCode('PURCHASE_RECEIPT', 'CREDIT', '2100'),
        ]);
        const result = await GLService.postJournalEntry({
            reference: data.poId,
            referenceType: 'GRN',
            description: `PO Receipt ${data.poId}`,
            createdBy: data.userId || 'system',
            branchId: data.branchId,
            lines: [
                { accountCode: inventoryAccount, debit: amount, credit: 0 }, // Inventory Asset
                { accountCode: payableAccount, debit: 0, credit: amount }, // Accounts Payable
            ]
        });
        if (typeof result === 'string') return { status: 'failed', exceptionId: result, reason: 'GL_EXCEPTION_CREATED' } satisfies FinancePostingResult;
        return { status: 'posted', entryId: result.entryId } satisfies FinancePostingResult;
    } catch (err) {
        log.error({ poId: data.poId, err: (err as any)?.message }, 'GL Sync Failed (PO_RECEIPT)');
        return await createFinanceException({
            reference: data.poId,
            referenceType: 'GRN',
            reason: `PO_RECEIPT_POSTING_THROWN|${(err as any)?.message || 'Unknown error'}`,
            payload: data,
            branchId: data.branchId,
        });
    }
};

export const postCogsForOrderEntry = async (data: { orderId: string; amount: number; branchId?: string; userId?: string }) => {
    const amount = Number(data.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
        return { status: 'skipped', reason: 'NO_COGS_AMOUNT' } satisfies FinancePostingResult;
    }

    const [existing] = await db
        .select({ id: journalEntries.id })
        .from(journalEntries)
        .where(and(
            eq(journalEntries.reference, data.orderId),
            eq(journalEntries.referenceType, 'COGS'),
        ))
        .top(1);

    if (existing) {
        return { status: 'skipped', reason: 'COGS_ALREADY_POSTED' } satisfies FinancePostingResult;
    }

    try {
        const [cogsAccount, inventoryAccount] = await Promise.all([
            resolveSystemAccountCode('COGS', 'DEBIT', '5110'),
            resolveSystemAccountCode('COGS', 'CREDIT', '1210'),
        ]);
        const result = await GLService.postJournalEntry({
            reference: data.orderId,
            referenceType: 'COGS',
            description: `COGS for Order #${data.orderId}`,
            branchId: data.branchId,
            createdBy: data.userId || 'system',
            lines: [
                { accountCode: cogsAccount, debit: amount, credit: 0 },
                { accountCode: inventoryAccount, debit: 0, credit: amount },
            ],
        });

        if (typeof result === 'string') {
            return { status: 'failed', exceptionId: result, reason: 'GL_EXCEPTION_CREATED' } satisfies FinancePostingResult;
        }

        if (result?.entryId) {
            return { status: 'posted', entryId: result.entryId } satisfies FinancePostingResult;
        }

        return await createFinanceException({
            reference: data.orderId,
            referenceType: 'COGS',
            reason: 'COGS_POSTING_RETURNED_NO_STATUS',
            payload: data,
        });
    } catch (err) {
        log.error({ orderId: data.orderId, err: (err as any)?.message }, 'GL Sync Failed (COGS)');
        return await createFinanceException({
            reference: data.orderId,
            referenceType: 'COGS',
            reason: `COGS_POSTING_THROWN|${(err as any)?.message || 'Unknown error'}`,
            payload: data,
        });
    }
};

/**
 * Reverse a posted COGS entry when its order is cancelled: the sale never
 * happened, so cogsCost must not linger in profit reports. Idempotent —
 * skips when no COGS was posted or a reversal already exists.
 */
export const reverseCogsForOrderEntry = async (data: { orderId: string; branchId?: string; userId?: string }) => {
    try {
        const [original] = await db
            .select({ id: journalEntries.id })
            .from(journalEntries)
            .where(and(
                eq(journalEntries.reference, data.orderId),
                eq(journalEntries.referenceType, 'COGS'),
            ))
            .top(1);
        if (!original) {
            return { status: 'skipped', reason: 'NO_COGS_POSTED' } satisfies FinancePostingResult;
        }
        const [existing] = await db
            .select({ id: journalEntries.id })
            .from(journalEntries)
            .where(and(
                eq(journalEntries.reference, data.orderId),
                eq(journalEntries.referenceType, 'COGS_REVERSAL'),
            ))
            .top(1);
        if (existing) {
            return { status: 'skipped', reason: 'COGS_REVERSAL_ALREADY_POSTED' } satisfies FinancePostingResult;
        }
        const lines = await db
            .select({ debit: journalLines.debit, credit: journalLines.credit })
            .from(journalLines)
            .where(eq(journalLines.journalEntryId, (original as any).id));
        const debitTotal = lines.reduce((sum, line) => sum + Number((line as any).debit || 0), 0);
        const creditTotal = lines.reduce((sum, line) => sum + Number((line as any).credit || 0), 0);
        const amount = Math.max(debitTotal, creditTotal);
        if (!(amount > 0) || lines.length === 0) {
            return { status: 'skipped', reason: 'NO_COGS_AMOUNT' } satisfies FinancePostingResult;
        }
        // Same COGS accounts, swapped directions (inventory back up, COGS down).
        const [cogsAccount, inventoryAccount] = await Promise.all([
            resolveSystemAccountCode('COGS', 'DEBIT', '5110'),
            resolveSystemAccountCode('COGS', 'CREDIT', '1210'),
        ]);
        const result = await GLService.postJournalEntry({
            reference: data.orderId,
            referenceType: 'COGS_REVERSAL',
            description: `COGS reversal for cancelled Order #${data.orderId}`,
            branchId: data.branchId,
            createdBy: data.userId || 'system',
            lines: [
                { accountCode: inventoryAccount, debit: amount, credit: 0 },
                { accountCode: cogsAccount, debit: 0, credit: amount },
            ],
        });
        if (typeof result === 'string') {
            return { status: 'failed', exceptionId: result, reason: 'GL_EXCEPTION_CREATED' } satisfies FinancePostingResult;
        }
        return { status: 'posted', entryId: result.entryId } satisfies FinancePostingResult;
    } catch (err) {
        log.error({ orderId: data.orderId, err: (err as any)?.message }, 'GL Sync Failed (COGS_REVERSAL)');
        return await createFinanceException({
            reference: data.orderId,
            referenceType: 'COGS_REVERSAL',
            reason: `COGS_REVERSAL_THROWN|${(err as any)?.message || 'Unknown error'}`,
            payload: data,
            branchId: data.branchId,
        });
    }
};

export const postInventoryAdjustmentEntry = async (data: {
    referenceId: string;
    amount: number;
    branchId?: string;
    userId?: string;
    reason?: string;
}) => {
    const amount = Number(data.amount || 0);
    if (amount <= 0) return { status: 'skipped', reason: 'NO_ADJUSTMENT_VALUE' } satisfies FinancePostingResult;
    const [expenseAccount, inventoryAccount] = await Promise.all([
        resolveSystemAccountCode('INVENTORY_ADJUSTMENT_DECREASE', 'DEBIT', '5110'),
        resolveSystemAccountCode('INVENTORY_ADJUSTMENT_DECREASE', 'CREDIT', '1210'),
    ]);
    const result = await GLService.postJournalEntry({
        reference: data.referenceId,
        referenceType: 'MANUAL',
        description: `Inventory Adjustment ${data.referenceId}`,
        branchId: data.branchId,
        createdBy: data.userId || 'system',
        lines: [
            { accountCode: expenseAccount, debit: amount, credit: 0 },
            { accountCode: inventoryAccount, debit: 0, credit: amount }
        ]
    });
    if (typeof result === 'string') return { status: 'failed', exceptionId: result, reason: 'GL_EXCEPTION_CREATED' } satisfies FinancePostingResult;
    return { status: 'posted', entryId: result.entryId } satisfies FinancePostingResult;
};

export const postInventoryAdjustmentReversalEntry = async (data: {
    referenceId: string;
    amount: number;
    branchId?: string;
    userId?: string;
    reason?: string;
}) => {
    const amount = Number(data.amount || 0);
    if (amount <= 0) return { status: 'skipped', reason: 'NO_ADJUSTMENT_VALUE' } satisfies FinancePostingResult;
    const [inventoryAccount, gainAccount] = await Promise.all([
        resolveSystemAccountCode('INVENTORY_ADJUSTMENT_INCREASE', 'DEBIT', '1210'),
        resolveSystemAccountCode('INVENTORY_ADJUSTMENT_INCREASE', 'CREDIT', '4200'),
    ]);
    const result = await GLService.postJournalEntry({
        reference: data.referenceId,
        referenceType: 'MANUAL',
        description: `Inventory Adjustment Reversal ${data.referenceId}`,
        branchId: data.branchId,
        createdBy: data.userId || 'system',
        lines: [
            { accountCode: inventoryAccount, debit: amount, credit: 0 },
            { accountCode: gainAccount, debit: 0, credit: amount }
        ]
    });
    if (typeof result === 'string') return { status: 'failed', exceptionId: result, reason: 'GL_EXCEPTION_CREATED' } satisfies FinancePostingResult;
    return { status: 'posted', entryId: result.entryId } satisfies FinancePostingResult;
};

export const postWastageEntry = async (data: { referenceId: string; amount: number; branchId?: string; userId?: string; reason?: string }) => {
    const amount = Number(data.amount || 0);
    if (amount <= 0) return { status: 'skipped', reason: 'NO_WASTAGE_VALUE' } satisfies FinancePostingResult;
    try {
        const [wastageAccount, inventoryAccount] = await Promise.all([
            resolveSystemAccountCode('WASTAGE', 'DEBIT', '5140'),
            resolveSystemAccountCode('WASTAGE', 'CREDIT', '1210'),
        ]);
        const result = await GLService.postJournalEntry({
            reference: data.referenceId,
            referenceType: 'WASTE',
            description: `Wastage: ${data.reason || data.referenceId}`,
            createdBy: data.userId || 'system',
            branchId: data.branchId,
            lines: [
                { accountCode: wastageAccount, debit: amount, credit: 0 }, // Wastage Expense
                { accountCode: inventoryAccount, debit: 0, credit: amount }, // Inventory Asset
            ]
        });
        if (typeof result === 'string') return { status: 'failed', exceptionId: result, reason: 'GL_EXCEPTION_CREATED' } satisfies FinancePostingResult;
        return { status: 'posted', entryId: result.entryId } satisfies FinancePostingResult;
    } catch (err) {
        log.error({ referenceId: data.referenceId, err: (err as any)?.message }, 'GL Sync Failed (WASTAGE)');
        return await createFinanceException({
            reference: data.referenceId,
            referenceType: 'WASTE',
            reason: `WASTAGE_POSTING_THROWN|${(err as any)?.message || 'Unknown error'}`,
            payload: data,
            branchId: data.branchId,
        });
    }
};

export const postProductionCompletionEntry = async (data: {
    productionOrderId: string;
    amount: number;
    branchId?: string;
    userId?: string;
}) => {
    const amount = Number(data.amount || 0);
    if (amount <= 0) return { status: 'skipped', reason: 'NO_PRODUCTION_VALUE' } satisfies FinancePostingResult;
    try {
        const [finishedGoodsAccount, inventoryAccount] = await Promise.all([
            resolveSystemAccountCode('PRODUCTION_COMPLETION', 'DEBIT', '1220'),
            resolveSystemAccountCode('PRODUCTION_COMPLETION', 'CREDIT', '1210'),
        ]);
        const result = await GLService.postJournalEntry({
            reference: data.productionOrderId,
            referenceType: 'MANUAL',
            description: `Production Completion ${data.productionOrderId}`,
            branchId: data.branchId,
            createdBy: data.userId || 'system',
            lines: [
                { accountCode: finishedGoodsAccount, debit: amount, credit: 0 },
                { accountCode: inventoryAccount, debit: 0, credit: amount }
            ]
        });
        if (typeof result === 'string') return { status: 'failed', exceptionId: result, reason: 'GL_EXCEPTION_CREATED' } satisfies FinancePostingResult;
        return { status: 'posted', entryId: result.entryId } satisfies FinancePostingResult;
    } catch (err) {
        return await createFinanceException({
            reference: data.productionOrderId,
            referenceType: 'PRODUCTION',
            reason: `PRODUCTION_POSTING_THROWN|${(err as any)?.message || 'Unknown error'}`,
            payload: data,
            branchId: data.branchId,
        });
    }
};
