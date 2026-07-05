import { db } from '../db';
import {
    journalEntries,
    journalLines,
    chartOfAccounts,
    costCenters,
    fiscalPeriods,
    paymentMethodAccounts,
    taxAccounts,
    financeExceptions
} from '../../src/db/schema';
import { eq, sql, sum } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export type ReferenceType = 'ORDER' | 'PAYMENT' | 'GRN' | 'WASTE' | 'MANUAL' | 'REFUND' | 'VOID' | 'SHIFT_CLOSE' | 'COGS' | 'PAYROLL' | 'WALLET_DEPOSIT' | 'WALLET_PAYMENT' | 'LOYALTY_REDEMPTION';

export interface JournalLineInput {
    accountCode?: string;
    accountId?: string;
    costCenterId?: string;
    debit: number;
    credit: number;
    description?: string;
}

export interface JournalEntryInput {
    reference: string;
    referenceType: ReferenceType;
    description: string;
    date?: Date | string;
    lines: JournalLineInput[];
    status?: string;
    createdBy?: string;
    branchId?: string; // Used to derive default cost center if not provided on lines
}

export class GLService {
    private static async ensureOpenFiscalPeriod(tx: any, currentDate: Date) {
        const periodRows = await tx.select()
            .from(fiscalPeriods)
            .where(sql`${fiscalPeriods.status} = 'OPEN' AND ${fiscalPeriods.startDate} <= ${currentDate} AND ${fiscalPeriods.endDate} >= ${currentDate}`);

        if (periodRows.length > 0) return periodRows[0].id;

        const start = new Date(currentDate);
        start.setHours(0, 0, 0, 0);
        start.setDate(1);

        const end = new Date(start);
        end.setMonth(end.getMonth() + 1);
        end.setMilliseconds(-1);

        const id = `fp-${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
        const name = start.toLocaleString('en-US', { month: 'short', year: 'numeric' });

        await tx.insert(fiscalPeriods).values({
            id,
            name,
            startDate: start,
            endDate: end,
            status: 'OPEN',
            createdAt: new Date(),
        }).onConflictDoNothing();

        const [createdOrExisting] = await tx.select()
            .from(fiscalPeriods)
            .where(eq(fiscalPeriods.id, id))
            .limit(1);

        return createdOrExisting?.id || id;
    }

    /**
     * Core method to post a balanced Journal Entry into the General Ledger.
     */
    static async postJournalEntry(input: JournalEntryInput) {
        return await db.transaction(async (tx) => {
            const pushToExceptionQueue = async (reason: string) => {
                const id = randomUUID();
                await tx.insert(financeExceptions).values({
                    id,
                    reference: input.reference,
                    referenceType: input.referenceType,
                    payload: input,
                    reason,
                });
                return id;
            };

            // 1. Verify Trial Balance Equilibrium
            const totalDebit = input.lines.reduce((acc, line) => acc + (line.debit || 0), 0);
            const totalCredit = input.lines.reduce((acc, line) => acc + (line.credit || 0), 0);

            if (totalDebit.toFixed(4) !== totalCredit.toFixed(4)) {
                return await pushToExceptionQueue(`UNBALANCED_LINES|Debit:${totalDebit}|Credit:${totalCredit}`);
            }

            // 2. Fetch or create Open Fiscal Period
            const currentDate = input.date instanceof Date
                ? input.date
                : input.date
                    ? new Date(input.date)
                    : new Date();
            const periodId = await this.ensureOpenFiscalPeriod(tx, currentDate);

            // 3. Resolve Account IDs from Codes if necessary
            for (const line of input.lines) {
                if (!line.accountId && line.accountCode) {
                    const accRow = await tx.select().from(chartOfAccounts).where(eq(chartOfAccounts.code, line.accountCode)).limit(1);
                    if (accRow.length === 0) {
                        return await pushToExceptionQueue(`ACCOUNT_NOT_FOUND|Code:${line.accountCode}`);
                    }
                    line.accountId = accRow[0].id;
                }
                if (!line.accountId) {
                    return await pushToExceptionQueue('MISSING_ACCOUNT_ID');
                }
            }

            // 4. Determine Global/Branch Cost Center
            let defaultCostCenterId: string | undefined = undefined;
            if (input.branchId) {
                const head = await tx.select().from(costCenters).where(eq(costCenters.branchId, input.branchId)).limit(1);
                if (head.length > 0) defaultCostCenterId = head[0].id;
            }

            // 5. Insert Entry
            const entryId = randomUUID();
            await tx.insert(journalEntries).values({
                id: entryId,
                date: currentDate,
                reference: input.reference,
                referenceType: input.referenceType,
                description: input.description,
                status: input.status || 'POSTED',
                fiscalPeriodId: periodId, // Allows nullable now based on schema fallback
                createdBy: input.createdBy,
            });

            // 6. Insert Lines
            const linesToInsert = input.lines.map((line) => ({
                journalEntryId: entryId,
                accountId: line.accountId!,
                costCenterId: line.costCenterId || defaultCostCenterId,
                debit: line.debit,
                credit: line.credit,
                description: line.description || input.description,
            }));

            await tx.insert(journalLines).values(linesToInsert);

            return { entryId, status: 'POSTED' };
        });
    }

    /**
     * Map Sales (Orders) to GL using PostingRuleEngine
     */
    static async postSalesOrder(orderId: string, subtotal: number, tax: number, paymentMethod: string, amountPaid: number, branchId: string, orderType: string = 'DINE_IN') {
        const { PostingRuleEngine } = await import('./postingRuleEngine');
        
        const linesData = await PostingRuleEngine.generateLines('POS_SALE', {
            TOTAL: amountPaid,
            SUBTOTAL: subtotal,
            TAX: tax,
            SERVICE_CHARGE: 0
        }, {
            paymentMethod,
            orderType
        });

        if (!linesData || linesData.length === 0) {
            const id = randomUUID();
            await db.insert(financeExceptions).values({
                id,
                reference: orderId,
                referenceType: 'ORDER',
                payload: {
                    orderId,
                    subtotal,
                    tax,
                    paymentMethod,
                    amountPaid,
                    branchId,
                    orderType,
                },
                reason: 'POSTING_RULES_NOT_CONFIGURED|POS_SALE',
                status: 'PENDING',
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            return id;
        }

        const lines: JournalLineInput[] = linesData.map(l => ({
            accountCode: l.accountCode,
            debit: l.debit,
            credit: l.credit
        }));

        return await this.postJournalEntry({
            reference: orderId,
            referenceType: 'ORDER',
            description: `Sales Order #${orderId}`,
            lines,
            branchId
        });
    }

    /**
     * Auto reverse an entry, useful for Voids/Refunds
     */
    static async reverseEntry(originalEntryId: string, reversalReference: string, createdBy?: string) {
        return await db.transaction(async (tx) => {
            const original = await tx.select().from(journalEntries).where(eq(journalEntries.id, originalEntryId)).limit(1);
            if (!original || original.length === 0) throw new Error('Original Journal Entry not found');

            const lines = await tx.select().from(journalLines).where(eq(journalLines.journalEntryId, originalEntryId));

            const newLines: JournalLineInput[] = lines.map(line => ({
                accountId: line.accountId,
                costCenterId: line.costCenterId || undefined,
                debit: line.credit, // SWAPPED
                credit: line.debit, // SWAPPED
                description: `Reversal of Entry #${original[0].entryNumber}`
            }));

            const reversal = await this.postJournalEntry({
                reference: reversalReference,
                referenceType: 'REFUND',
                description: `Reversal of Entry #${original[0].entryNumber}`,
                lines: newLines,
                createdBy,
            });

            // Mark original reversed
            await tx.update(journalEntries).set({ status: 'REVERSED' }).where(eq(journalEntries.id, originalEntryId));

            return reversal;
        });
    }
}
