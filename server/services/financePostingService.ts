import { GLService } from './glService';
import { db } from '../db';
import { financeExceptions, journalEntries, orders } from '../../src/db/schema';
import { and, eq } from 'drizzle-orm';
import logger from '../utils/logger';
import { randomUUID } from 'crypto';

const log = logger.child({ service: 'financePosting' });

type FinancePostingResult =
    | { status: 'posted'; entryId: string }
    | { status: 'failed'; exceptionId: string; reason: string }
    | { status: 'skipped'; reason: string };

const createFinanceException = async (input: {
    reference: string;
    referenceType: string;
    reason: string;
    payload: unknown;
}): Promise<FinancePostingResult> => {
    const id = randomUUID();
    await db.insert(financeExceptions).values({
        id,
        reference: input.reference,
        referenceType: input.referenceType,
        payload: input.payload,
        reason: input.reason,
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
    if (amount <= 0) return;
    try {
        await GLService.postJournalEntry({
            reference: data.poId,
            referenceType: 'GRN',
            description: `PO Receipt ${data.poId}`,
            createdBy: data.userId || 'system',
            branchId: data.branchId,
            lines: [
                { accountCode: '1210', debit: amount, credit: 0 }, // Inventory Asset
                { accountCode: '2100', debit: 0, credit: amount }, // Accounts Payable
            ]
        });
    } catch (err) {
        log.error({ poId: data.poId, err: (err as any)?.message }, 'GL Sync Failed (PO_RECEIPT)');
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
        const result = await GLService.postJournalEntry({
            reference: data.orderId,
            referenceType: 'COGS',
            description: `COGS for Order #${data.orderId}`,
            branchId: data.branchId,
            createdBy: data.userId || 'system',
            lines: [
                { accountCode: '5110', debit: amount, credit: 0 },
                { accountCode: '1210', debit: 0, credit: amount },
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

export const postInventoryAdjustmentEntry = async (data: {
    referenceId: string;
    amount: number;
    branchId?: string;
    userId?: string;
    reason?: string;
}) => {
    const amount = Number(data.amount || 0);
    if (amount <= 0) return;
    await GLService.postJournalEntry({
        reference: data.referenceId,
        referenceType: 'MANUAL',
        description: `Inventory Adjustment ${data.referenceId}`,
        branchId: data.branchId,
        createdBy: data.userId || 'system',
        lines: [
            { accountCode: '5110', debit: amount, credit: 0 },
            { accountCode: '1210', debit: 0, credit: amount }
        ]
    });
};

export const postInventoryAdjustmentReversalEntry = async (data: {
    referenceId: string;
    amount: number;
    branchId?: string;
    userId?: string;
    reason?: string;
}) => {
    const amount = Number(data.amount || 0);
    if (amount <= 0) return;
    await GLService.postJournalEntry({
        reference: data.referenceId,
        referenceType: 'MANUAL',
        description: `Inventory Adjustment Reversal ${data.referenceId}`,
        branchId: data.branchId,
        createdBy: data.userId || 'system',
        lines: [
            { accountCode: '1210', debit: amount, credit: 0 },
            { accountCode: '5110', debit: 0, credit: amount }
        ]
    });
};

export const postWastageEntry = async (data: { referenceId: string; amount: number; branchId?: string; userId?: string; reason?: string }) => {
    const amount = Number(data.amount || 0);
    if (amount <= 0) return;
    try {
        await GLService.postJournalEntry({
            reference: data.referenceId,
            referenceType: 'WASTE',
            description: `Wastage: ${data.reason || data.referenceId}`,
            createdBy: data.userId || 'system',
            branchId: data.branchId,
            lines: [
                { accountCode: '5110', debit: amount, credit: 0 }, // Wastage Expense
                { accountCode: '1210', debit: 0, credit: amount }, // Inventory Asset
            ]
        });
    } catch (err) {
        log.error({ referenceId: data.referenceId, err: (err as any)?.message }, 'GL Sync Failed (WASTAGE)');
    }
};

export const postProductionCompletionEntry = async (data: {
    productionOrderId: string;
    amount: number;
    branchId?: string;
    userId?: string;
}) => {
    const amount = Number(data.amount || 0);
    if (amount <= 0) return;
    await GLService.postJournalEntry({
        reference: data.productionOrderId,
        referenceType: 'MANUAL',
        description: `Production Completion ${data.productionOrderId}`,
        branchId: data.branchId,
        createdBy: data.userId || 'system',
        lines: [
            { accountCode: '1220', debit: amount, credit: 0 },
            { accountCode: '1210', debit: 0, credit: amount }
        ]
    });
};
