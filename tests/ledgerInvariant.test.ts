import { describe, expect, it } from 'vitest';
import { validateJournalLines, validateLedgerEntries } from '../server/utils/ledgerInvariant';

describe('ledger invariants', () => {
    it('balances decimal values using minor units', () => {
        expect(validateJournalLines([
            { accountCode: '1110', debit: 10.005, credit: 0 },
            { accountCode: '4100', debit: 0, credit: 10.004 },
        ])).toEqual({
            ok: false,
            reason: 'UNBALANCED_LINES|DebitMinor:1001|CreditMinor:1000',
        });

        expect(validateJournalLines([
            { accountCode: '1110', debit: 10.005, credit: 0 },
            { accountCode: '4100', debit: 0, credit: 10.005 },
        ])).toEqual({ ok: true, totalMinorUnits: 1001 });
    });

    it('rejects invalid line shapes and mixed-sided lines', () => {
        expect(validateJournalLines([
            { accountCode: '1110', debit: -1, credit: 0 },
            { accountCode: '4100', debit: 0, credit: 1 },
        ])).toEqual({ ok: false, reason: 'INVALID_JOURNAL_LINES' });

        expect(validateJournalLines([
            { accountCode: '1110', debit: 1, credit: 1 },
            { accountCode: '4100', debit: 0, credit: 2 },
        ])).toEqual({ ok: false, reason: 'LINE_HAS_BOTH_DEBIT_AND_CREDIT' });
    });

    it('applies the same invariant to the legacy ledger engine shape', () => {
        expect(validateLedgerEntries([
            { account: 'cash', direction: 'debit', amount: 25.5 },
            { account: 'sales', direction: 'credit', amount: 25.5 },
        ])).toEqual({ ok: true, totalMinorUnits: 2550 });
    });
});
