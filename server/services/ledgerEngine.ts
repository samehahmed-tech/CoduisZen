import { db } from '../db';
import { ledgerEntries } from '../../src/db/schema';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';

export interface LedgerEntryInput {
    account: string;
    direction: 'debit' | 'credit';
    amount: number;
    currency?: string;
}

export class LedgerEngine {
    /**
     * Records a balanced set of ledger entries.
     * Enforces Double-Entry Accounting Rule: sum(debit) == sum(credit)
     */
    static async recordTransaction(
        orderId: string | null,
        paymentSessionId: string | null,
        entries: LedgerEntryInput[]
    ) {
        if (!entries || entries.length < 2) {
            throw new Error('Ledger transaction requires at least 2 entries to balance.');
        }

        let totalDebit = 0;
        let totalCredit = 0;

        for (const entry of entries) {
            if (entry.amount <= 0) {
                throw new Error('Ledger entry amounts must be greater than zero.');
            }
            if (entry.direction === 'debit') totalDebit += entry.amount;
            else if (entry.direction === 'credit') totalCredit += entry.amount;
        }

        // JavaScript float precision handling
        const epsilon = 0.0001;
        if (Math.abs(totalDebit - totalCredit) > epsilon) {
            const errorMsg = `Transaction unbalanced: Debit (${totalDebit}) != Credit (${totalCredit})`;
            logger.error({ orderId, paymentSessionId, entries }, errorMsg);
            throw new Error(errorMsg);
        }

        try {
            // Using a transaction to ensure all entries are saved atomically
            await db.transaction(async (tx) => {
                const valuesToInsert = entries.map(entry => ({
                    id: uuidv4(),
                    orderId: orderId,
                    paymentSessionId: paymentSessionId,
                    account: entry.account,
                    direction: entry.direction,
                    amount: entry.amount,
                    currency: entry.currency || 'EGP',
                }));
                
                await tx.insert(ledgerEntries).values(valuesToInsert);
            });

            logger.info({ orderId, paymentSessionId, totalAmount: totalDebit }, 'Balanced ledger transaction recorded');
        } catch (error: any) {
            logger.error({ error, orderId, paymentSessionId }, 'Failed to record ledger transaction');
            throw error;
        }
    }
}
