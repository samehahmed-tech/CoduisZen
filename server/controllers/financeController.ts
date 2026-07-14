import { Request, Response } from 'express';
import { db } from '../db';
import { chartOfAccounts, journalEntries, journalLines, financeExceptions, managerApprovals } from '../../src/db/schema';
import { GLService } from '../services/glService';
import { financeEngine } from '../services/financeEngine';
import { financialStatements } from '../services/financialStatements';
import { eq, sql, desc, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const defaultChartOfAccounts = [
    { id: 'coa-assets', code: '1000', name: 'Assets', nameAr: 'الأصول', type: 'ASSET', normalBalance: 'DEBIT', parentId: null, isControlAccount: true, allowManualJournals: false },
    { id: 'coa-cash', code: '1110', name: 'Cash on Hand', nameAr: 'الصندوق', type: 'ASSET', normalBalance: 'DEBIT', parentId: 'coa-assets', isControlAccount: false, allowManualJournals: true },
    { id: 'coa-bank', code: '1120', name: 'Bank Account', nameAr: 'حساب البنك', type: 'ASSET', normalBalance: 'DEBIT', parentId: 'coa-assets', isControlAccount: false, allowManualJournals: true },
    { id: 'coa-wallet', code: '1130', name: 'Digital Wallet', nameAr: 'محفظة إلكترونية', type: 'ASSET', normalBalance: 'DEBIT', parentId: 'coa-assets', isControlAccount: false, allowManualJournals: true },
    { id: 'coa-expenses', code: '5000', name: 'Operating Expenses', nameAr: 'مصروفات التشغيل', type: 'EXPENSE', normalBalance: 'DEBIT', parentId: null, isControlAccount: true, allowManualJournals: false },
    { id: 'coa-exp-utilities', code: '5110', name: 'Utilities', nameAr: 'مرافق وكهرباء', type: 'EXPENSE', normalBalance: 'DEBIT', parentId: 'coa-expenses', isControlAccount: false, allowManualJournals: true },
    { id: 'coa-exp-maintenance', code: '5120', name: 'Maintenance', nameAr: 'صيانة', type: 'EXPENSE', normalBalance: 'DEBIT', parentId: 'coa-expenses', isControlAccount: false, allowManualJournals: true },
    { id: 'coa-exp-cleaning', code: '5130', name: 'Cleaning Supplies', nameAr: 'نظافة ومستلزمات', type: 'EXPENSE', normalBalance: 'DEBIT', parentId: 'coa-expenses', isControlAccount: false, allowManualJournals: true },
    { id: 'coa-exp-transport', code: '5140', name: 'Transport', nameAr: 'مواصلات وانتقالات', type: 'EXPENSE', normalBalance: 'DEBIT', parentId: 'coa-expenses', isControlAccount: false, allowManualJournals: true },
    { id: 'coa-exp-petty', code: '5150', name: 'Petty Cash Expenses', nameAr: 'نثريات', type: 'EXPENSE', normalBalance: 'DEBIT', parentId: 'coa-expenses', isControlAccount: false, allowManualJournals: true },
];

const ensureDefaultChartOfAccounts = async () => {
    for (const account of defaultChartOfAccounts) {
        const [existing] = await db.select().top(1).from(chartOfAccounts).where(eq(chartOfAccounts.code, account.code));
        if (!existing) {
            await db.insert(chartOfAccounts).values(account);
        }
    }
};

export const getAccounts = async (_req: Request, res: Response) => {
    try {
        await ensureDefaultChartOfAccounts();
        const rows = await db.select().from(chartOfAccounts).orderBy(chartOfAccounts.code);
        // Build a basic tree for the UI (same as financeEngine.getAccounts())
        const accountMap = new Map();
        rows.forEach(row => accountMap.set(row.id, { ...row, children: [] }));
        const rootAccounts: any[] = [];
        rows.forEach(row => {
            if (row.parentId) {
                const parent = accountMap.get(row.parentId);
                if (parent) parent.children.push(accountMap.get(row.id));
                else rootAccounts.push(accountMap.get(row.id));
            } else {
                rootAccounts.push(accountMap.get(row.id));
            }
        });
        res.json(rootAccounts);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createExpenseAccount = async (req: Request, res: Response) => {
    try {
        await ensureDefaultChartOfAccounts();
        const body = req.body || {};
        const name = String(body.name || '').trim();
        const nameAr = String(body.nameAr || body.name || '').trim();
        if (!name) return res.status(400).json({ error: 'ACCOUNT_NAME_REQUIRED' });

        const code = String(body.code || `5${Date.now().toString().slice(-5)}`).trim();
        const [created] = await db.insert(chartOfAccounts).output().values({
            id: `coa-exp-${nanoid(8)}`,
            code,
            name,
            nameAr: nameAr || name,
            type: 'EXPENSE',
            normalBalance: 'DEBIT',
            parentId: 'coa-expenses',
            isControlAccount: false,
            allowManualJournals: true,
        });

        res.status(201).json(created);
    } catch (error: any) {
        const message = String(error?.message || '');
        res.status(message.includes('unique') ? 409 : 400).json({ error: message || 'Failed to create expense account' });
    }
};

export const getJournal = async (req: Request, res: Response) => {
    try {
        const limit = Number(req.query.limit || 100);
        // The old UI expects { id, date, description, debitAccountId, creditAccountId, amount }
        // Let's reconstruct it simply for backward compatibility (2-line view)
        const entries = await db.select()
            .from(journalEntries)
            .orderBy(desc(journalEntries.date))
            .offset(0).fetch(limit);

        const allLines = entries.length
            ? await db.select()
                .from(journalLines)
                .where(or(...entries.map(e => eq(journalLines.journalEntryId, e.id))))
            : [];
        
        const accMapRows = await db.select().from(chartOfAccounts);
        const accMap = new Map(accMapRows.map(a => [a.id, a.code]));

        const formatted = entries.map(entry => {
            const entryLines = allLines.filter(l => l.journalEntryId === entry.id);
            const debitLine = entryLines.find(l => Number(l.debit) > 0);
            const creditLine = entryLines.find(l => Number(l.credit) > 0);
            return {
                id: entry.id,
                date: entry.date,
                description: entry.description,
                referenceId: entry.reference,
                referenceType: entry.referenceType,
                status: entry.status,
                amount: debitLine ? Number(debitLine.debit) : 0,
                debitAccountId: debitLine ? accMap.get(debitLine.accountId) : 'UNKNOWN',
                debitAccountCode: debitLine ? accMap.get(debitLine.accountId) : 'UNKNOWN',
                creditAccountId: creditLine ? accMap.get(creditLine.accountId) : 'UNKNOWN',
                creditAccountCode: creditLine ? accMap.get(creditLine.accountId) : 'UNKNOWN'
            };
        });

        res.json(formatted);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createJournalEntry = async (req: Request, res: Response) => {
    try {
        const body = req.body || {};
        
        // Support legacy format or new lines format
        let lines = body.lines;
        if (!lines && body.amount !== undefined) {
            lines = [
                { accountCode: body.debitAccountCode, debit: Number(body.amount || 0), credit: 0 },
                { accountCode: body.creditAccountCode, debit: 0, credit: Number(body.amount || 0) }
            ];
        }

        if (!lines || !Array.isArray(lines) || lines.length === 0) {
            return res.status(400).json({ error: 'Journal lines are required' });
        }

        const result = await GLService.postJournalEntry({
            reference: body.referenceId || `MANUAL-${Date.now()}`,
            referenceType: body.source || 'MANUAL',
            description: body.description || 'Manual Journal',
            createdBy: req.user?.id || 'system',
            lines: lines,
            status: 'PENDING_APPROVAL',
            date: body.date ? new Date(body.date) : undefined,
            branchId: req.effectiveBranchId,
        });

        const entryId = typeof result === 'object' && result && 'entryId' in result ? String(result.entryId) : '';
        const branchId = req.effectiveBranchId || req.user?.branchId || (req.user?.allowedBranches || [])[0];
        if (body.source === 'EXPENSE' && entryId && branchId && req.user?.id) {
            await db.insert(managerApprovals).values({
                managerId: req.user.id,
                branchId,
                actionType: 'EXPENSE',
                relatedId: entryId,
                reason: 'Expense pending approval',
                details: {
                    status: 'PENDING',
                    referenceId: body.referenceId,
                    description: body.description,
                    amount: Number(body.amount || 0),
                    debitAccountCode: body.debitAccountCode,
                    creditAccountCode: body.creditAccountCode,
                    requestedBy: req.user.id,
                    requestedAt: new Date().toISOString(),
                },
                createdAt: new Date(),
            });
        }

        res.status(201).json({ success: true, entryId, message: 'Journal entry submitted for approval' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const approveJournalEntry = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id);
        const entry = await db.select().top(1).from(journalEntries).where(eq(journalEntries.id, id));
        
        if (entry.length === 0) return res.status(404).json({ error: 'Entry not found' });
        if (entry[0].status !== 'PENDING_APPROVAL') return res.status(400).json({ error: 'Entry is not pending approval' });
        
        await db.update(journalEntries)
            .set({ status: 'POSTED' })
            .where(eq(journalEntries.id, id));
            
        res.json({ success: true, message: 'Journal entry approved and posted' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const reverseJournalEntry = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id || '');
        if (!id) return res.status(400).json({ error: 'JOURNAL_ENTRY_ID_REQUIRED' });
        const { reason } = req.body;
        const reversed = await GLService.reverseEntry(id, reason || `REV-${id}`, req.user?.id || 'system');
        res.json({ message: 'Journal reversed', id: reversed });
    } catch (error: any) {
        console.error('Reverse Error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const getTrialBalance = async (_req: Request, res: Response) => {
    try {
        const result = await db.execute(sql`
            SELECT SUM(debit) as total_debit, SUM(credit) as total_credit 
            FROM journal_lines jl
            JOIN journal_entries je ON jl.journal_entry_id = je.id
            WHERE je.status = 'POSTED'
        `);
        const totalDebit = Number(result[0]?.total_debit || 0);
        const totalCredit = Number(result[0]?.total_credit || 0);
        res.json({
            debit: totalDebit,
            credit: totalCredit,
            balanced: Math.abs(totalDebit - totalCredit) < 0.01
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getExceptions = async (_req: Request, res: Response) => {
    try {
        const exceptions = await db.select().from(financeExceptions).orderBy(desc(financeExceptions.createdAt));
        res.json(exceptions);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const resolveException = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id);
        const action = req.body.action; // 'RETRY' or 'DISMISS'
        const exception = await db.select().top(1).from(financeExceptions).where(eq(financeExceptions.id, id));
        if (exception.length === 0) return res.status(404).json({ error: 'Exception not found' });
        
        const exc = exception[0];

        if (action === 'DISMISS') {
            await db.update(financeExceptions)
                .set({ status: 'DISMISSED', resolvedBy: req.user?.id || 'system', resolvedAt: new Date() })
                .where(eq(financeExceptions.id, id));
            return res.json({ success: true, message: 'Exception dismissed' });
        }

        if (action === 'RETRY') {
            const payload = exc.payload as any;
            await GLService.postJournalEntry(payload);
            await db.update(financeExceptions)
                .set({ status: 'RESOLVED', resolvedBy: req.user?.id || 'system', resolvedAt: new Date() })
                .where(eq(financeExceptions.id, id));
            return res.json({ success: true, message: 'Exception resolved and posted' });
        }

        res.status(400).json({ error: 'Invalid action' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getReconciliations = async (_req: Request, res: Response) => {
    try {
        const rows = await financeEngine.getReconciliations();
        res.json(rows);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createReconciliation = async (req: Request, res: Response) => {
    try {
        const body = req.body || {};
        const created = await financeEngine.createReconciliation({
            accountCode: body.accountCode,
            statementDate: body.statementDate || new Date().toISOString(),
            statementBalance: Number(body.statementBalance || 0),
            notes: body.notes,
            updatedBy: req.user?.id || 'system',
        });
        res.status(201).json(created);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const resolveReconciliation = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id || '');
        if (!id) return res.status(400).json({ error: 'RECONCILIATION_ID_REQUIRED' });
        const body = req.body || {};
        const resolved = await financeEngine.resolveReconciliation({
            reconciliationId: id,
            adjustWithJournal: Boolean(body.adjustWithJournal),
            adjustmentAccountCode: body.adjustmentAccountCode,
            notes: body.notes,
            updatedBy: req.user?.id || 'system',
        });
        res.json(resolved);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getPeriodCloses = async (_req: Request, res: Response) => {
    try {
        const periods = await financeEngine.getPeriodCloses();
        res.json(periods);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const closePeriod = async (req: Request, res: Response) => {
    try {
        const body = req.body || {};
        const closed = await financeEngine.closePeriod({
            periodStart: body.periodStart,
            periodEnd: body.periodEnd,
            updatedBy: req.user?.id || 'system',
        });
        res.status(201).json(closed);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

// =============================================================================
// Financial Statements
// =============================================================================

export const getProfitAndLoss = async (req: Request, res: Response) => {
    try {
        const periodStart = String(req.query.start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
        const periodEnd = String(req.query.end || new Date().toISOString().split('T')[0]);
        const report = await financialStatements.profitAndLoss(periodStart, periodEnd);
        res.json(report);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getBalanceSheet = async (req: Request, res: Response) => {
    try {
        const asOfDate = req.query.date ? String(req.query.date) : undefined;
        const report = await financialStatements.balanceSheet(asOfDate);
        res.json(report);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getCashFlowStatement = async (req: Request, res: Response) => {
    try {
        const periodStart = String(req.query.start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
        const periodEnd = String(req.query.end || new Date().toISOString().split('T')[0]);
        const report = await financialStatements.cashFlowStatement(periodStart, periodEnd);
        res.json(report);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getAccountsReceivable = async (_req: Request, res: Response) => {
    try {
        const report = await financialStatements.accountsReceivable();
        res.json(report);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getAccountsPayable = async (_req: Request, res: Response) => {
    try {
        const report = await financialStatements.accountsPayable();
        res.json(report);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
