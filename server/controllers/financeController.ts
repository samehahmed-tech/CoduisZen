import { Request, Response } from 'express';
import { db } from '../db';
import { chartOfAccounts, journalEntries, journalLines, financeExceptions, managerApprovals, costCenters, postingRules } from '../../src/db/schema';
import { GLService } from '../services/glService';
import { financeEngine } from '../services/financeEngine';
import { financialStatements } from '../services/financialStatements';
import { eq, sql, desc, or, and, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { COASeedService } from '../services/coaSeedService';
import { createSignedAuditLog } from '../services/auditService';
import { PostingRuleEngine } from '../services/postingRuleEngine';
import { writeDbError } from '../utils/dbErrors';

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

// Keyboards with Arabic layouts emit Eastern Arabic-Indic (٠-٩) or Persian
// (۰-۹) digits; normalize them so account codes validate correctly.
const normalizeDigitInput = (value: unknown): string =>
    String(value ?? '')
        .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
        .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));

let defaultChartEnsured = false;
let defaultChartEnsurePromise: Promise<void> | null = null;

const ensureDefaultChartOfAccounts = async () => {
    if (defaultChartEnsured) return;
    if (defaultChartEnsurePromise) return defaultChartEnsurePromise;
    defaultChartEnsurePromise = (async () => {
    const existingRows = await db.select().from(chartOfAccounts);
    if (existingRows.length === 0) {
        await COASeedService.seed();
            defaultChartEnsured = true;
        return;
    }
        const hasActiveAccounts = existingRows.some(row => row.isActive !== false);
        if (!hasActiveAccounts) {
            defaultChartEnsured = true;
            return;
        }
    // Repair the old starter chart's conflicting codes without touching
    // user-created names or balances.
    const repairs = [
        { oldCode: '5000', oldName: 'Operating Expenses', newCode: '6000' },
        { oldCode: '5110', oldName: 'Utilities', newCode: '6200' },
        { oldCode: '5140', oldName: 'Transport', newCode: '6500' },
    ];
    for (const repair of repairs) {
        const current = existingRows.find(row => row.code === repair.oldCode && row.name === repair.oldName);
        const replacementExists = existingRows.some(row => row.code === repair.newCode);
        if (current && !replacementExists) await db.update(chartOfAccounts).set({ code: repair.newCode }).where(eq(chartOfAccounts.id, current.id));
    }
    await COASeedService.seed();
        defaultChartEnsured = true;
    })().finally(() => {
        defaultChartEnsurePromise = null;
    });
    return defaultChartEnsurePromise;
};

const getRealAccountBalance = async (accountCode: string, branchId?: string) => {
    const rows = await db.select({
        normalBalance: chartOfAccounts.normalBalance,
        debit: sql<number>`coalesce(sum(${journalLines.debit}), 0)`,
        credit: sql<number>`coalesce(sum(${journalLines.credit}), 0)`,
    })
        .from(chartOfAccounts)
        .leftJoin(journalLines, eq(journalLines.accountId, chartOfAccounts.id))
        .leftJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
        .leftJoin(costCenters, eq(costCenters.id, journalLines.costCenterId))
        .where(and(
            eq(chartOfAccounts.code, accountCode),
            eq(journalEntries.status, 'POSTED'),
            branchId ? eq(costCenters.branchId, branchId) : undefined,
        ))
        .groupBy(chartOfAccounts.normalBalance);
    const row = rows[0];
    if (!row) return 0;
    const debit = Number(row.debit || 0);
    const credit = Number(row.credit || 0);
    return row.normalBalance === 'DEBIT' ? debit - credit : credit - debit;
};

export const getAccounts = async (req: Request, res: Response) => {
    try {
        await ensureDefaultChartOfAccounts();
        const rows = (await db.select().from(chartOfAccounts).orderBy(chartOfAccounts.code))
            .filter(row => row.isActive !== false);
        const balanceRows = await db.select({
            accountId: journalLines.accountId,
            debit: sql<number>`coalesce(sum(${journalLines.debit}), 0)`,
            credit: sql<number>`coalesce(sum(${journalLines.credit}), 0)`,
        })
            .from(journalLines)
            .innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
            .leftJoin(costCenters, eq(costCenters.id, journalLines.costCenterId))
            .where(and(eq(journalEntries.status, 'POSTED'), req.effectiveBranchId ? eq(costCenters.branchId, req.effectiveBranchId) : undefined))
            .groupBy(journalLines.accountId);
        const balanceMap = new Map(balanceRows.map(row => [row.accountId, row]));
        const rowsWithBalances = rows.map(row => {
            const balance = balanceMap.get(row.id);
            const debit = Number(balance?.debit || 0);
            const credit = Number(balance?.credit || 0);
            return { ...row, balance: row.normalBalance === 'DEBIT' ? debit - credit : credit - debit };
        });
        // Build a basic tree for the UI (same as financeEngine.getAccounts())
        const accountMap = new Map();
        rowsWithBalances.forEach(row => accountMap.set(row.id, { ...row, children: [] }));
        const rootAccounts: any[] = [];
        rowsWithBalances.forEach(row => {
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

export const getArchivedAccounts = async (_req: Request, res: Response) => {
    try {
        const rows = await db.select().from(chartOfAccounts)
            .where(eq(chartOfAccounts.isActive, false))
            .orderBy(chartOfAccounts.code);
        res.json(rows);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

const validateAccountHierarchy = async (accountId: string | null, parentId: string | null) => {
    if (!parentId) return;
    if (accountId && accountId === parentId) throw new Error('ACCOUNT_CANNOT_BE_ITS_OWN_PARENT');
    let cursor: string | null = parentId;
    const visited = new Set<string>();
    for (let depth = 0; cursor && depth < 100; depth += 1) {
        if (accountId && cursor === accountId) throw new Error('ACCOUNT_HIERARCHY_CYCLE');
        if (visited.has(cursor)) throw new Error('ACCOUNT_HIERARCHY_CYCLE');
        visited.add(cursor);
        const [parent] = await db.select({ id: chartOfAccounts.id, parentId: chartOfAccounts.parentId, isActive: chartOfAccounts.isActive })
            .from(chartOfAccounts).where(eq(chartOfAccounts.id, cursor)).top(1);
        if (!parent) throw new Error('PARENT_ACCOUNT_NOT_FOUND');
        if (parent.isActive === false) throw new Error('PARENT_ACCOUNT_INACTIVE');
        cursor = parent.parentId || null;
    }
    if (cursor) throw new Error('ACCOUNT_HIERARCHY_TOO_DEEP');
};

export const createExpenseAccount = async (req: Request, res: Response) => {
    try {
        await ensureDefaultChartOfAccounts();
        const body = req.body || {};
        const name = String(body.name || '').trim();
        const nameAr = String(body.nameAr || body.name || '').trim();
        if (!name) return res.status(400).json({ error: 'ACCOUNT_NAME_REQUIRED' });

        const code = normalizeDigitInput(body.code).trim() || `6${Date.now().toString().slice(-5)}`;
        // The starter chart used a fixed id for the expense root, while the
        // current seed uses generated ids. Resolve the parent by its stable
        // account code so this endpoint works with either chart generation.
        const [expenseRoot] = await db.select({ id: chartOfAccounts.id })
            .from(chartOfAccounts)
            .where(and(
                eq(chartOfAccounts.type, 'EXPENSE'),
                eq(chartOfAccounts.isActive, true),
                isNull(chartOfAccounts.parentId),
            ))
            .orderBy(chartOfAccounts.code)
            .top(1);
        if (!expenseRoot) return res.status(400).json({ error: 'EXPENSE_ROOT_ACCOUNT_NOT_FOUND' });
        const [created] = await db.insert(chartOfAccounts).output().values({
            id: `coa-exp-${nanoid(8)}`,
            code,
            name,
            nameAr: nameAr || name,
            type: 'EXPENSE',
            normalBalance: 'DEBIT',
            parentId: expenseRoot.id,
            isControlAccount: false,
            allowManualJournals: true,
        });

        res.status(201).json(created);
    } catch (error: any) {
        const message = String(error?.message || '');
        res.status(message.includes('unique') ? 409 : 400).json({ error: message || 'Failed to create expense account' });
    }
};

/** Full, safe account-tree management for finance administrators. */
export const createAccount = async (req: Request, res: Response) => {
    try {
        await ensureDefaultChartOfAccounts();
        const body = req.body || {};
        const code = normalizeDigitInput(body.code).trim();
        const name = String(body.name || '').trim();
        const type = String(body.type || '').toUpperCase();
        const normalBalance = String(body.normalBalance || (['LIABILITY', 'EQUITY', 'REVENUE'].includes(type) ? 'CREDIT' : 'DEBIT')).toUpperCase();
        if (!code && !name) return res.status(400).json({ error: 'ACCOUNT_CODE_AND_NAME_REQUIRED' });
        if (!name) return res.status(400).json({ error: 'ACCOUNT_NAME_REQUIRED', messageAr: 'اسم الحساب مطلوب.' });
        if (!/^\d{3,12}$/.test(code)) {
            return res.status(400).json({
                error: 'ACCOUNT_CODE_INVALID',
                messageAr: `كود الحساب لازم يكون أرقام من 3 لـ 12 خانة${body.code && String(body.code) !== code ? ' (تم تصحيح الأرقام العربية تلقائياً — راجع الكود)' : ''}`,
            });
        }
        if (!['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].includes(type)) return res.status(400).json({ error: 'ACCOUNT_TYPE_INVALID' });
        await validateAccountHierarchy(null, body.parentId ? String(body.parentId) : null);
        const [created] = await db.insert(chartOfAccounts).output().values({
            id: `coa-${nanoid(12)}`,
            code,
            name,
            nameAr: String(body.nameAr || name).trim(),
            type,
            normalBalance,
            parentId: body.parentId ? String(body.parentId) : null,
            isControlAccount: Boolean(body.isControlAccount),
            allowManualJournals: body.allowManualJournals !== false,
            isActive: true,
        });
        await createSignedAuditLog({
            eventType: 'CHART_ACCOUNT_CREATED', userId: req.user?.id || 'system', branchId: null,
            payload: { accountId: created.id, code: created.code, name: created.name, type: created.type, parentId: created.parentId },
            reason: 'Chart of accounts account created by finance administrator',
            sourceDevice: req.headers['user-agent'] || 'unknown', requestId: req.headers['x-request-id'] as string || `req-${Date.now()}`,
        });
        res.status(201).json(created);
    } catch (error: any) {
        const message = String(error?.message || 'ACCOUNT_CREATE_FAILED');
        if (message.toLowerCase().includes('unique')) {
            return res.status(409).json({ error: 'ACCOUNT_CODE_ALREADY_EXISTS', messageAr: 'كود الحساب مستخدم بالفعل لحساب آخر.' });
        }
        res.status(400).json({ error: message });
    }
};

export const updateAccount = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id || '');
        const current = await db.select().top(1).from(chartOfAccounts).where(eq(chartOfAccounts.id, id));
        if (!current.length) return res.status(404).json({ error: 'ACCOUNT_NOT_FOUND' });
        const body = req.body || {};
        await validateAccountHierarchy(id, body.parentId ? String(body.parentId) : null);
        const patch: any = {};
        for (const key of ['name', 'nameAr', 'parentId', 'allowManualJournals', 'isActive']) {
            if (body[key] !== undefined) patch[key] = key === 'parentId' && !body[key] ? null : body[key];
        }
        if (body.code !== undefined) {
            const code = normalizeDigitInput(body.code).trim();
            if (!/^\d{3,12}$/.test(code)) {
                return res.status(400).json({ error: 'ACCOUNT_CODE_INVALID', messageAr: 'كود الحساب لازم يكون أرقام من 3 لـ 12 خانة.' });
            }
            patch.code = code;
        }
        await db.update(chartOfAccounts).set(patch).where(eq(chartOfAccounts.id, id));
        if (patch.code && patch.code !== current[0].code) {
            await db.update(postingRules)
                .set({ accountCode: patch.code, updatedAt: new Date() })
                .where(eq(postingRules.accountCode, current[0].code));
            await PostingRuleEngine.invalidateCache();
        }
        const [updated] = await db.select().top(1).from(chartOfAccounts).where(eq(chartOfAccounts.id, id));
        await createSignedAuditLog({
            eventType: 'CHART_ACCOUNT_UPDATED', userId: req.user?.id || 'system', branchId: null,
            payload: { accountId: id, before: current[0], after: updated },
            reason: 'Chart of accounts account updated by finance administrator',
            sourceDevice: req.headers['user-agent'] || 'unknown', requestId: req.headers['x-request-id'] as string || `req-${Date.now()}`,
        });
        res.json(updated);
    } catch (error: any) {
        const message = String(error?.message || 'ACCOUNT_UPDATE_FAILED');
        if (message.toLowerCase().includes('unique')) {
            return res.status(409).json({ error: 'ACCOUNT_CODE_ALREADY_EXISTS', messageAr: 'كود الحساب مستخدم بالفعل لحساب آخر.' });
        }
        res.status(400).json({ error: message });
    }
};

export const deactivateAccount = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id || '');
        if (!id) return res.status(400).json({ error: 'ACCOUNT_ID_REQUIRED' });
        const [current] = await db.select().top(1).from(chartOfAccounts).where(eq(chartOfAccounts.id, id));
        if (!current) return res.status(404).json({ error: 'ACCOUNT_NOT_FOUND' });
        if (current.isActive === false) return res.json({ success: true, alreadyArchived: true, account: current });
        const children = await db.select({ id: chartOfAccounts.id }).from(chartOfAccounts).where(eq(chartOfAccounts.parentId, id));
        if (children.length) return res.status(409).json({ error: 'ACCOUNT_HAS_CHILDREN_MOVE_OR_DEACTIVATE_CHILDREN_FIRST' });
        await db.update(chartOfAccounts).set({ isActive: false, allowManualJournals: false }).where(eq(chartOfAccounts.id, id));
        await createSignedAuditLog({
            eventType: 'CHART_ACCOUNT_ARCHIVED',
            userId: (req as any).user?.id || 'system',
            branchId: null,
            payload: { accountId: id, code: current.code, name: current.name },
            reason: 'Chart of accounts leaf archived by finance administrator',
            sourceDevice: req.headers['user-agent'] || 'unknown',
            requestId: req.headers['x-request-id'] as string || `req-${Date.now()}`,
        });
        res.json({ success: true, account: { ...current, isActive: false } });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const restoreAccount = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id || '');
        const [current] = await db.select().top(1).from(chartOfAccounts).where(eq(chartOfAccounts.id, id));
        if (!current) return res.status(404).json({ error: 'ACCOUNT_NOT_FOUND' });
        if (current.isActive !== false) return res.json({ success: true, alreadyActive: true, account: current });
        await validateAccountHierarchy(id, current.parentId || null);
        await db.update(chartOfAccounts).set({ isActive: true, allowManualJournals: current.allowManualJournals !== false }).where(eq(chartOfAccounts.id, id));
        const [restored] = await db.select().top(1).from(chartOfAccounts).where(eq(chartOfAccounts.id, id));
        await createSignedAuditLog({
            eventType: 'CHART_ACCOUNT_RESTORED',
            userId: (req as any).user?.id || 'system', branchId: null,
            payload: { accountId: id, code: current.code, name: current.name },
            reason: 'Chart of accounts leaf restored by finance administrator',
            sourceDevice: req.headers['user-agent'] || 'unknown',
            requestId: req.headers['x-request-id'] as string || `req-${Date.now()}`,
        });
        res.json({ success: true, account: restored });
    } catch (error: any) {
        res.status(400).json({ error: error.message || 'ACCOUNT_RESTORE_FAILED' });
    }
};

/**
 * Starts a new chart without destroying the old ledger. Historical journal
 * lines keep their account IDs; operational posting rules are paused until
 * the finance user maps them to the new active accounts.
 */
export const resetChartOfAccounts = async (req: Request, res: Response) => {
    try {
        if (req.body?.confirmation !== 'RESET_CHART_OF_ACCOUNTS') {
            return res.status(400).json({ error: 'CHART_RESET_CONFIRMATION_REQUIRED' });
        }
        const accounts = await db.select().from(chartOfAccounts);
        const activeAccounts = accounts.filter(account => account.isActive !== false);
        if (!activeAccounts.length) return res.json({ success: true, archivedCount: 0, preservedHistory: true, disabledPostingRules: 0 });

        const activePostingRules = await db.select({ id: postingRules.id })
            .from(postingRules)
            .where(eq(postingRules.isActive, true));

        await db.transaction(async (tx) => {
            await tx.update(chartOfAccounts)
                .set({ isActive: false, allowManualJournals: false })
                .where(eq(chartOfAccounts.isActive, true));
            await tx.update(postingRules)
                .set({ isActive: false, updatedAt: new Date() })
                .where(eq(postingRules.isActive, true));
        });

        await createSignedAuditLog({
            eventType: 'CHART_OF_ACCOUNTS_RESET',
            userId: (req as any).user?.id || 'system',
            branchId: null,
            payload: {
                archivedCount: activeAccounts.length,
                disabledPostingRules: activePostingRules.length,
                preservedHistory: true,
                mappingRequired: true,
            },
            reason: 'Existing chart archived before customer chart replacement',
            sourceDevice: req.headers['user-agent'] || 'unknown',
            requestId: req.headers['x-request-id'] as string || `req-${Date.now()}`,
        });

        res.json({
            success: true,
            archivedCount: activeAccounts.length,
            disabledPostingRules: activePostingRules.length,
            preservedHistory: true,
            mappingRequired: true,
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message || 'CHART_RESET_FAILED' });
    }
};

export const getJournal = async (req: Request, res: Response) => {
    try {
        const limit = Number(req.query.limit || 100);
        // The old UI expects { id, date, description, debitAccountId, creditAccountId, amount }
        // Let's reconstruct it simply for backward compatibility (2-line view)
        const branchId = req.effectiveBranchId;
        const entryConditions: any[] = [];
        if (branchId) entryConditions.push(eq(costCenters.branchId, branchId));
        const entryQuery = db.selectDistinct({ entry: journalEntries })
            .from(journalEntries)
            .innerJoin(journalLines, eq(journalLines.journalEntryId, journalEntries.id))
            .leftJoin(costCenters, eq(journalLines.costCenterId, costCenters.id));
        const scopedEntries = entryConditions.length
            ? await entryQuery.where(and(...entryConditions)).orderBy(desc(journalEntries.date)).offset(0).fetch(limit)
            : await entryQuery.orderBy(desc(journalEntries.date)).offset(0).fetch(limit);
        const entries = scopedEntries.map(row => row.entry);

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
        if (entry[0].createdBy && entry[0].createdBy === req.user?.id) {
            return res.status(403).json({ error: 'MAKER_CANNOT_APPROVE_OWN_ENTRY' });
        }
        if (req.effectiveBranchId) {
            const scoped = await db.select({ id: journalEntries.id })
                .from(journalEntries)
                .innerJoin(journalLines, eq(journalLines.journalEntryId, journalEntries.id))
                .innerJoin(costCenters, eq(journalLines.costCenterId, costCenters.id))
                .where(and(eq(journalEntries.id, id), eq(costCenters.branchId, req.effectiveBranchId)))
                .top(1);
            if (!scoped.length) return res.status(403).json({ error: 'ENTRY_OUTSIDE_BRANCH_SCOPE' });
        }
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

export const getTrialBalance = async (req: Request, res: Response) => {
    try {
        const result: any = await db.execute(sql`
            SELECT SUM(debit) as total_debit, SUM(credit) as total_credit 
            FROM journal_lines jl
            JOIN journal_entries je ON jl.journal_entry_id = je.id
            WHERE je.status = 'POSTED'
            ${req.effectiveBranchId ? sql`AND EXISTS (SELECT 1 FROM cost_centers cc WHERE cc.id = jl.cost_center_id AND cc.branch_id = ${req.effectiveBranchId})` : sql``}
        `);
        const tbRow = Array.isArray(result)
            ? result[0]
            : (result?.recordset?.[0] ?? result?.rows?.[0]);
        const totalDebit = Number(tbRow?.total_debit || 0);
        const totalCredit = Number(tbRow?.total_credit || 0);
        res.json({
            debit: totalDebit,
            credit: totalCredit,
            balanced: Math.abs(totalDebit - totalCredit) < 0.01
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getExceptions = async (req: Request, res: Response) => {
    try {
        // Finance exceptions are stored without a branch_id column.  Do not
        // build a branch predicate from a non-existent schema field: on SQL
        // Server that turns the query into an invalid `and` expression and
        // makes the whole finance page fail before it can render accounts.
        const exceptions = await db.select().from(financeExceptions)
            .orderBy(desc(financeExceptions.createdAt));
        res.json(exceptions);
    } catch (error: any) {
        return writeDbError(res, error);
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

export const getReconciliations = async (req: Request, res: Response) => {
    try {
        const rows = await financeEngine.getReconciliations(req.effectiveBranchId);
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
            branchId: req.effectiveBranchId,
            bookBalance: await getRealAccountBalance(String(body.accountCode || ''), req.effectiveBranchId),
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
            branchId: req.effectiveBranchId,
        });
        const realBookBalance = await getRealAccountBalance(resolved.accountCode, req.effectiveBranchId);
        resolved.bookBalance = realBookBalance;
        resolved.difference = Number(resolved.statementBalance || 0) - realBookBalance;
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
        const trialRows = await db.execute(sql`
            SELECT SUM(jl.debit) as total_debit, SUM(jl.credit) as total_credit
            FROM journal_lines jl
            JOIN journal_entries je ON jl.journal_entry_id = je.id
            LEFT JOIN cost_centers cc ON cc.id = jl.cost_center_id
            WHERE je.status = 'POSTED'
            ${req.effectiveBranchId ? sql`AND cc.branch_id = ${req.effectiveBranchId}` : sql``}
        `);
        const debit = Number(trialRows[0]?.total_debit || 0);
        const credit = Number(trialRows[0]?.total_credit || 0);
        const closed = await financeEngine.closePeriod({
            periodStart: body.periodStart,
            periodEnd: body.periodEnd,
            updatedBy: req.user?.id || 'system',
            trialBalance: { debit, credit, balanced: Math.abs(debit - credit) < 0.01 },
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
        const report = await financialStatements.profitAndLoss(periodStart, periodEnd, req.effectiveBranchId);
        res.json(report);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getBalanceSheet = async (req: Request, res: Response) => {
    try {
        const asOfDate = req.query.date ? String(req.query.date) : undefined;
        const report = await financialStatements.balanceSheet(asOfDate, req.effectiveBranchId);
        res.json(report);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getCashFlowStatement = async (req: Request, res: Response) => {
    try {
        const periodStart = String(req.query.start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
        const periodEnd = String(req.query.end || new Date().toISOString().split('T')[0]);
        const report = await financialStatements.cashFlowStatement(periodStart, periodEnd, req.effectiveBranchId);
        res.json(report);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getAccountsReceivable = async (req: Request, res: Response) => {
    try {
        const report = await financialStatements.accountsReceivable(req.effectiveBranchId);
        res.json(report);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getAccountsPayable = async (req: Request, res: Response) => {
    try {
        const report = await financialStatements.accountsPayable(req.effectiveBranchId);
        res.json(report);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
