import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../server/db';
import { financeExceptions, journalEntries } from '../../src/db/schema';
import { GLService } from '../../server/services/glService';

const reference = `TST-BRANCH-REQUIRED-${Date.now()}`;

afterAll(async () => {
    await db.delete(financeExceptions).where(eq(financeExceptions.reference, reference));
    await db.delete(journalEntries).where(eq(journalEntries.reference, reference));
});

describe('financial branch boundary', () => {
    it('routes wallet postings without branch to an exception instead of the GL', async () => {
        const result = await GLService.postJournalEntry({
            reference: reference,
            referenceType: 'WALLET_PAYMENT',
            description: 'Branch boundary regression',
            source: 'TEST',
            actorId: 'test',
            lines: [
                { accountCode: '1110', debit: 10, credit: 0 },
                { accountCode: '2410', debit: 0, credit: 10 },
            ],
        });

        expect(typeof result).toBe('string');
        expect(await db.select().from(journalEntries).where(eq(journalEntries.reference, reference))).toHaveLength(0);
        const [exception] = await db.select().from(financeExceptions).where(eq(financeExceptions.reference, reference));
        expect(exception?.reason).toBe('BRANCH_REQUIRED_FOR_OPERATIONAL_ENTRY');
    });
});
