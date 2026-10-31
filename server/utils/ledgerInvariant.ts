import { toMinorUnits } from './money';

export type JournalInvariantLine = {
    accountCode?: string;
    accountId?: string;
    debit: number;
    credit: number;
};

export type JournalInvariantResult =
    | { ok: true; totalMinorUnits: number }
    | { ok: false; reason: string };

/**
 * Validates the accounting invariants that must hold before a journal entry
 * reaches the database. Monetary equality is evaluated in minor units so
 * decimal representation cannot create or hide an imbalance.
 */
export const validateJournalLines = (lines: JournalInvariantLine[]): JournalInvariantResult => {
    if (!Array.isArray(lines) || lines.length < 2) {
        return { ok: false, reason: 'INVALID_JOURNAL_LINES' };
    }

    let totalDebitMinorUnits = 0;
    let totalCreditMinorUnits = 0;

    for (const line of lines) {
        if (!line.accountCode && !line.accountId) {
            return { ok: false, reason: 'MISSING_ACCOUNT_ID' };
        }

        if (!Number.isFinite(Number(line.debit)) || !Number.isFinite(Number(line.credit))) {
            return { ok: false, reason: 'INVALID_JOURNAL_LINES' };
        }

        if (Number(line.debit) < 0 || Number(line.credit) < 0) {
            return { ok: false, reason: 'INVALID_JOURNAL_LINES' };
        }

        if (Number(line.debit) > 0 && Number(line.credit) > 0) {
            return { ok: false, reason: 'LINE_HAS_BOTH_DEBIT_AND_CREDIT' };
        }

        try {
            totalDebitMinorUnits += toMinorUnits(Number(line.debit) || 0);
            totalCreditMinorUnits += toMinorUnits(Number(line.credit) || 0);
        } catch {
            return { ok: false, reason: 'INVALID_JOURNAL_LINES' };
        }
    }

    if (totalDebitMinorUnits <= 0 || totalCreditMinorUnits <= 0) {
        return { ok: false, reason: 'EMPTY_JOURNAL_TOTAL' };
    }

    if (totalDebitMinorUnits !== totalCreditMinorUnits) {
        return {
            ok: false,
            reason: `UNBALANCED_LINES|DebitMinor:${totalDebitMinorUnits}|CreditMinor:${totalCreditMinorUnits}`,
        };
    }

    return { ok: true, totalMinorUnits: totalDebitMinorUnits };
};

export type LedgerInvariantEntry = {
    account: string;
    direction: 'debit' | 'credit';
    amount: number;
};

export const validateLedgerEntries = (entries: LedgerInvariantEntry[]): JournalInvariantResult => {
    const lines = entries.map((entry) => ({
        accountId: entry.account,
        debit: entry.direction === 'debit' ? entry.amount : 0,
        credit: entry.direction === 'credit' ? entry.amount : 0,
    }));

    return validateJournalLines(lines);
};
