import { db } from '../db';
import { settings, chartOfAccounts } from '../../src/db/schema';
import { eq, and } from 'drizzle-orm';
import { GLService } from './glService';
import { resolveSystemAccountCode } from './financePostingService';

export type FinanceAccount = {
    id: string;
    code: string;
    name: string;
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
    balance: number;
    parentId?: string;
};

export type FinanceJournalEntry = {
    id: string;
    date: string;
    description: string;
    amount: number;
    debitAccountCode: string;
    creditAccountCode: string;
    referenceId?: string;
    source?: string;
    metadata?: any;
};

export type FinanceReconciliation = {
    id: string;
    accountCode: string;
    statementDate: string;
    statementBalance: number;
    bookBalance: number;
    difference: number;
    status: 'OPEN' | 'RESOLVED';
    notes?: string;
    resolvedAt?: string;
    resolvedBy?: string;
    branchId?: string;
};

export type FinancePeriodClose = {
    id: string;
    periodStart: string;
    periodEnd: string;
    closedAt: string;
    closedBy: string;
    trialBalance: { debit: number; credit: number; balanced: boolean };
};

const ACCOUNTS_KEY = 'finance_accounts_v1';
const JOURNAL_KEY = 'finance_journal_v1';
const RECONCILIATIONS_KEY = 'finance_reconciliations_v1';
const PERIOD_CLOSES_KEY = 'finance_period_closes_v1';
const LOCKED_THROUGH_KEY = 'finance_locked_through_v1';

const defaultAccounts = (): FinanceAccount[] => ([
    // === ASSETS (1xxx) ===
    { id: 'acc-1000', code: '1000', name: 'Assets', type: 'ASSET', balance: 0 },
    { id: 'acc-1100', code: '1100', name: 'Cash & Cash Equivalents', type: 'ASSET', balance: 0, parentId: 'acc-1000' },
    { id: 'acc-1110', code: '1110', name: 'Cashier Main', type: 'ASSET', balance: 0, parentId: 'acc-1100' },
    { id: 'acc-1120', code: '1120', name: 'Bank Account', type: 'ASSET', balance: 0, parentId: 'acc-1100' },
    { id: 'acc-1200', code: '1200', name: 'Inventory Stock', type: 'ASSET', balance: 0, parentId: 'acc-1000' },
    { id: 'acc-1210', code: '1210', name: 'Raw Materials', type: 'ASSET', balance: 0, parentId: 'acc-1200' },
    { id: 'acc-1220', code: '1220', name: 'Finished Goods', type: 'ASSET', balance: 0, parentId: 'acc-1200' },
    { id: 'acc-1300', code: '1300', name: 'Accounts Receivable', type: 'ASSET', balance: 0, parentId: 'acc-1000' },

    // === LIABILITIES (2xxx) ===
    { id: 'acc-2000', code: '2000', name: 'Liabilities', type: 'LIABILITY', balance: 0 },
    { id: 'acc-2100', code: '2100', name: 'Accounts Payable', type: 'LIABILITY', balance: 0, parentId: 'acc-2000' },
    { id: 'acc-2200', code: '2200', name: 'VAT Payable', type: 'LIABILITY', balance: 0, parentId: 'acc-2000' },
    { id: 'acc-2300', code: '2300', name: 'Service Charge Payable', type: 'LIABILITY', balance: 0, parentId: 'acc-2000' },

    // === EQUITY (3xxx) ===
    { id: 'acc-3000', code: '3000', name: 'Equity', type: 'EQUITY', balance: 0 },
    { id: 'acc-3100', code: '3100', name: 'Owner Equity', type: 'EQUITY', balance: 0, parentId: 'acc-3000' },
    { id: 'acc-3200', code: '3200', name: 'Retained Earnings', type: 'EQUITY', balance: 0, parentId: 'acc-3000' },

    // === REVENUE (4xxx) ===
    { id: 'acc-4000', code: '4000', name: 'Revenue', type: 'REVENUE', balance: 0 },
    { id: 'acc-4100', code: '4100', name: 'Sales', type: 'REVENUE', balance: 0, parentId: 'acc-4000' },
    { id: 'acc-4200', code: '4200', name: 'Other Revenue', type: 'REVENUE', balance: 0, parentId: 'acc-4000' },

    // === COST OF GOODS SOLD (51xx) ===
    { id: 'acc-5000', code: '5000', name: 'Expenses', type: 'EXPENSE', balance: 0 },
    { id: 'acc-5100', code: '5100', name: 'Cost of Goods Sold', type: 'EXPENSE', balance: 0, parentId: 'acc-5000' },
    { id: 'acc-5110', code: '5110', name: 'Inventory Cost', type: 'EXPENSE', balance: 0, parentId: 'acc-5100' },
    { id: 'acc-5120', code: '5120', name: 'Wastage Cost', type: 'EXPENSE', balance: 0, parentId: 'acc-5100' },
    { id: 'acc-5130', code: '5130', name: 'Production Cost', type: 'EXPENSE', balance: 0, parentId: 'acc-5100' },

    // === OPERATING EXPENSES (52xx) ===
    { id: 'acc-5200', code: '5200', name: 'Rent Expense', type: 'EXPENSE', balance: 0, parentId: 'acc-5000' },
    { id: 'acc-5210', code: '5210', name: 'Utilities Expense', type: 'EXPENSE', balance: 0, parentId: 'acc-5000' },
    { id: 'acc-5220', code: '5220', name: 'Salaries & Wages', type: 'EXPENSE', balance: 0, parentId: 'acc-5000' },
    { id: 'acc-5230', code: '5230', name: 'Marketing & Advertising', type: 'EXPENSE', balance: 0, parentId: 'acc-5000' },
    { id: 'acc-5240', code: '5240', name: 'Maintenance & Repairs', type: 'EXPENSE', balance: 0, parentId: 'acc-5000' },
    { id: 'acc-5250', code: '5250', name: 'Office Supplies', type: 'EXPENSE', balance: 0, parentId: 'acc-5000' },
    { id: 'acc-5260', code: '5260', name: 'Other Operating Expenses', type: 'EXPENSE', balance: 0, parentId: 'acc-5000' },

    // === OTHER EXPENSES (6xxx) ===
    { id: 'acc-6100', code: '6100', name: 'Bank Charges & Fees', type: 'EXPENSE', balance: 0 },
    { id: 'acc-6200', code: '6200', name: 'Depreciation', type: 'EXPENSE', balance: 0 },
]);

const readSetting = async <T>(key: string, fallback: T): Promise<T> => {
    const [row] = await db.select().from(settings).where(eq(settings.key, key));
    return (row?.value as T) || fallback;
};

const writeSetting = async (key: string, value: any, updatedBy?: string) => {
    const [existing] = await db.select().from(settings).where(eq(settings.key, key));
    if (existing) {
        await db.update(settings)
            .set({ value, category: 'finance', updatedBy: updatedBy || 'system', updatedAt: new Date() })
            .where(eq(settings.key, key));
    } else {
        await db.insert(settings).values({
            key,
            value,
            category: 'finance',
            updatedBy: updatedBy || 'system',
            updatedAt: new Date(),
        } as any);
    }
};

export const financeEngine = {
    async ensureChart() {
        const accounts = await readSetting<FinanceAccount[]>(ACCOUNTS_KEY, []);
        if (accounts.length === 0) {
            const init = defaultAccounts();
            await writeSetting(ACCOUNTS_KEY, init, 'system');
            return init;
        }

        const defaults = defaultAccounts();
        const byCode = new Map(accounts.map((a) => [a.code, a]));
        let changed = false;
        for (const def of defaults) {
            if (!byCode.has(def.code)) {
                accounts.push({ ...def });
                changed = true;
            }
        }
        if (changed) {
            await writeSetting(ACCOUNTS_KEY, accounts, 'system');
        }
        return accounts;
    },

    async getAccounts() {
        return this.ensureChart();
    },

    async getJournal() {
        return readSetting<FinanceJournalEntry[]>(JOURNAL_KEY, []);
    },

    async getLockedThroughDate() {
        const value = await readSetting<string | null>(LOCKED_THROUGH_KEY, null);
        return value ? new Date(value) : null;
    },

    async setLockedThroughDate(dateIso: string, updatedBy?: string) {
        await writeSetting(LOCKED_THROUGH_KEY, dateIso, updatedBy || 'system');
    },

    async postDoubleEntry(entry: Omit<FinanceJournalEntry, 'id' | 'date'> & { updatedBy?: string; branchId?: string }) {
        const result = await GLService.postJournalEntry({
            reference: entry.referenceId || `MANUAL-${Date.now()}`,
            referenceType: 'RECONCILIATION',
            description: entry.description,
            createdBy: entry.updatedBy || 'system',
            branchId: entry.branchId,
            lines: [
                { accountCode: entry.debitAccountCode, debit: Number(entry.amount || 0), credit: 0 },
                { accountCode: entry.creditAccountCode, debit: 0, credit: Number(entry.amount || 0) },
            ],
        });
        if (typeof result === 'string' || !(result as any)?.entryId) throw new Error('FINANCE_POSTING_FAILED');
        return result;
    },

    async trialBalance() {
        const accounts = await this.ensureChart();
        const totals = {
            debit: 0,
            credit: 0,
        };
        accounts.forEach(acc => {
            if (acc.balance >= 0) totals.debit += acc.balance;
            else totals.credit += Math.abs(acc.balance);
        });
        return {
            accounts,
            totals,
            balanced: Math.abs(totals.debit - totals.credit) < 0.0001,
        };
    },

    async getReconciliations(branchId?: string) {
        const rows = await readSetting<FinanceReconciliation[]>(RECONCILIATIONS_KEY, []);
        return rows
            .filter(row => !branchId || row.branchId === branchId)
            .sort((a, b) => new Date(b.statementDate).getTime() - new Date(a.statementDate).getTime());
    },

    async createReconciliation(input: {
        accountCode: string;
        statementDate: string;
        statementBalance: number;
        notes?: string;
        updatedBy?: string;
        branchId?: string;
        bookBalance?: number;
    }) {
        const rows = await this.getReconciliations(input.branchId);
        const [account] = await db.select({ code: chartOfAccounts.code, isActive: chartOfAccounts.isActive })
            .from(chartOfAccounts)
            .where(and(eq(chartOfAccounts.code, input.accountCode), eq(chartOfAccounts.isActive, true)))
            .top(1);
        if (!account) throw new Error('Invalid account code');

        const statementBalance = Number(input.statementBalance || 0);
        const bookBalance = input.bookBalance !== undefined ? Number(input.bookBalance) : 0;
        const rec: FinanceReconciliation = {
            id: `REC-${Date.now()}`,
            accountCode: input.accountCode,
            statementDate: input.statementDate,
            statementBalance,
            bookBalance,
            difference: statementBalance - bookBalance,
            status: Math.abs(statementBalance - bookBalance) < 0.0001 ? 'RESOLVED' : 'OPEN',
            notes: input.notes,
            resolvedAt: Math.abs(statementBalance - bookBalance) < 0.0001 ? new Date().toISOString() : undefined,
            resolvedBy: Math.abs(statementBalance - bookBalance) < 0.0001 ? (input.updatedBy || 'system') : undefined,
            branchId: input.branchId,
        };
        await writeSetting(RECONCILIATIONS_KEY, [rec, ...rows], input.updatedBy || 'system');
        return rec;
    },

    async resolveReconciliation(input: {
        reconciliationId: string;
        adjustWithJournal?: boolean;
        adjustmentAccountCode?: string;
        notes?: string;
        updatedBy?: string;
        branchId?: string;
    }) {
        const rows = await this.getReconciliations(input.branchId);
        const idx = rows.findIndex(r => r.id === input.reconciliationId);
        if (idx === -1) throw new Error('Reconciliation not found');
        const rec = rows[idx];
        if (rec.status === 'RESOLVED') return rec;

        if (input.adjustWithJournal) {
            const abs = Math.abs(Number(rec.difference || 0));
            if (abs > 0) {
                const offset = input.adjustmentAccountCode || await resolveSystemAccountCode('INVENTORY_ADJUSTMENT_DECREASE', 'DEBIT', '5110');
                if (rec.difference > 0) {
                    await this.postDoubleEntry({
                        description: `Reconciliation adjustment ${rec.id}`,
                        amount: abs,
                        debitAccountCode: rec.accountCode,
                        creditAccountCode: offset,
                        referenceId: rec.id,
                        source: 'RECONCILIATION_ADJUSTMENT',
                        metadata: { notes: input.notes || null },
                        updatedBy: input.updatedBy || 'system',
                        branchId: input.branchId,
                    });
                } else {
                    await this.postDoubleEntry({
                        description: `Reconciliation adjustment ${rec.id}`,
                        amount: abs,
                        debitAccountCode: offset,
                        creditAccountCode: rec.accountCode,
                        referenceId: rec.id,
                        source: 'RECONCILIATION_ADJUSTMENT',
                        metadata: { notes: input.notes || null },
                        updatedBy: input.updatedBy || 'system',
                        branchId: input.branchId,
                    });
                }
            }
        }

        const refreshedAccounts = await this.ensureChart();
        const refreshed = refreshedAccounts.find(a => a.code === rec.accountCode);
        const next: FinanceReconciliation = {
            ...rec,
            bookBalance: Number(refreshed?.balance || rec.bookBalance),
            difference: Number(rec.statementBalance || 0) - Number(refreshed?.balance || rec.bookBalance),
            status: 'RESOLVED',
            resolvedAt: new Date().toISOString(),
            resolvedBy: input.updatedBy || 'system',
            notes: input.notes || rec.notes,
        };
        rows[idx] = next;
        await writeSetting(RECONCILIATIONS_KEY, rows, input.updatedBy || 'system');
        return next;
    },

    async getPeriodCloses() {
        const periods = await readSetting<FinancePeriodClose[]>(PERIOD_CLOSES_KEY, []);
        return periods.sort((a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime());
    },

    async closePeriod(input: { periodStart: string; periodEnd: string; updatedBy?: string; trialBalance?: { debit: number; credit: number; balanced: boolean } }) {
        const start = new Date(input.periodStart);
        const end = new Date(input.periodEnd);
        if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
            throw new Error('Invalid period dates');
        }
        if (start > end) throw new Error('periodStart must be before periodEnd');

        const periods = await this.getPeriodCloses();
        const overlap = periods.find(p => !(new Date(p.periodEnd) < start || new Date(p.periodStart) > end));
        if (overlap) throw new Error('Period overlaps with an existing closed period');

        const tb = input.trialBalance
            ? { totals: { debit: input.trialBalance.debit, credit: input.trialBalance.credit }, balanced: input.trialBalance.balanced }
            : await this.trialBalance();
        const closed: FinancePeriodClose = {
            id: `PER-${Date.now()}`,
            periodStart: start.toISOString(),
            periodEnd: end.toISOString(),
            closedAt: new Date().toISOString(),
            closedBy: input.updatedBy || 'system',
            trialBalance: {
                debit: Number(tb.totals.debit || 0),
                credit: Number(tb.totals.credit || 0),
                balanced: Boolean(tb.balanced),
            },
        };
        await writeSetting(PERIOD_CLOSES_KEY, [closed, ...periods], input.updatedBy || 'system');
        await this.setLockedThroughDate(end.toISOString(), input.updatedBy || 'system');

        // Item 26: Also lock the actual fiscal_periods table used by GL engine.
        // Any period whose date range falls within the closed range gets status=CLOSED.
        try {
            const { fiscalPeriods } = await import('../../src/db/schema');
            const { and: andOp, lte, gte } = await import('drizzle-orm');
            await db.update(fiscalPeriods)
                .set({
                    status: 'CLOSED',
                    closedBy: input.updatedBy || 'system',
                    closedAt: new Date(),
                })
                .where(andOp(
                    gte(fiscalPeriods.startDate, start),
                    lte(fiscalPeriods.endDate, end),
                    eq(fiscalPeriods.status, 'OPEN')
                ));
        } catch (err) {
            // Non-blocking: if fiscalPeriods table update fails, the settings-based lock still works
        }

        return closed;
    },
};
