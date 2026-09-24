import { Request, Response } from 'express';
import { eq, and, or, sql, gte, lte, desc, isNull } from 'drizzle-orm';
import { db } from '../../db';
import { journalEntries, journalLines, chartOfAccounts, costCenters, users, branches } from '../../../src/db/schema';
import { parseLocalDateRange, resolveScopedBranchId } from './reportUtils';

// Branch comes only from the line's cost center — and costCenterId is
// NULLABLE. A plain eq() on the LEFT-joined costCenters acts as an inner
// join and silently drops every line without a cost center when a branch is
// selected. Keep NULL-cost-center lines in scope.
const branchJournalScope = (branchId?: string) => (
    branchId
        ? or(eq(costCenters.branchId, branchId), isNull(journalLines.costCenterId))
        : undefined
);

export const getTrialBalance = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId: rawBranchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const branchId = resolveScopedBranchId(req, rawBranchId as string | undefined);

        const rows = await db.select({
            accountId: journalLines.accountId,
            accountCode: chartOfAccounts.code,
            accountName: chartOfAccounts.name,
            accountType: chartOfAccounts.type,
            totalDebit: sql<number>`coalesce(sum(${journalLines.debit}), 0)`,
            totalCredit: sql<number>`coalesce(sum(${journalLines.credit}), 0)`,
        })
            .from(journalLines)
            .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
            .innerJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
            .leftJoin(costCenters, eq(journalLines.costCenterId, costCenters.id))
            .where(and(
                gte(journalEntries.date, start),
                lte(journalEntries.date, end),
                eq(journalEntries.status, 'POSTED'),
                branchJournalScope(branchId)
            ))
            .groupBy(journalLines.accountId, chartOfAccounts.code, chartOfAccounts.name, chartOfAccounts.type)
            .orderBy(chartOfAccounts.code);

        const result = rows.map(r => ({
            ...r,
            totalDebit: Number(r.totalDebit),
            totalCredit: Number(r.totalCredit),
            balance: Number(r.totalDebit) - Number(r.totalCredit),
        }));

        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getProfitAndLoss = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId: rawBranchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates required' });
        const branchId = resolveScopedBranchId(req, rawBranchId as string | undefined);
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);

        const conditions = [
            gte(journalEntries.date, start),
            lte(journalEntries.date, end),
            eq(journalEntries.status, 'POSTED'),
            branchJournalScope(branchId),
        ];

        const rows = await db.select({
            accountCode: chartOfAccounts.code,
            accountType: chartOfAccounts.type,
            accountName: chartOfAccounts.name,
            totalDebit: sql<number>`coalesce(sum(${journalLines.debit}), 0)`,
            totalCredit: sql<number>`coalesce(sum(${journalLines.credit}), 0)`,
        })
            .from(journalLines)
            .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
            .innerJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
            .leftJoin(costCenters, eq(journalLines.costCenterId, costCenters.id))
            .where(and(...conditions))
            .groupBy(chartOfAccounts.code, chartOfAccounts.type, chartOfAccounts.name)
            .orderBy(chartOfAccounts.type, chartOfAccounts.code);

        const revenue = rows.filter(r => r.accountType === 'REVENUE').reduce((s, r) => s + Number(r.totalCredit) - Number(r.totalDebit), 0);
        const expenses = rows.filter(r => r.accountType === 'EXPENSE').reduce((s, r) => s + Number(r.totalDebit) - Number(r.totalCredit), 0);

        res.json({
            revenue,
            expenses,
            netProfit: revenue - expenses,
            // GL truth only: revenue/expenses come from POSTED journal lines
            // (COGS counts only if journalized). For order-level gross profit
            // see the sales profit-summary report.
            basis: 'GL_POSTED_ONLY',
            // Detail sign matches the header: revenue positive as credit-debit,
            // expenses positive as debit-credit (a cost, not a negative number).
            details: rows.map(r => ({
                code: r.accountCode,
                type: r.accountType,
                name: r.accountName,
                debit: Number(r.totalDebit),
                credit: Number(r.totalCredit),
                net: r.accountType === 'EXPENSE'
                    ? Number(r.totalDebit) - Number(r.totalCredit)
                    : Number(r.totalCredit) - Number(r.totalDebit),
            })),
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getTopExpenses = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId: rawBranchId } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates required' });
        const branchId = resolveScopedBranchId(req, rawBranchId as string | undefined);
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);

        const rows = await db.select({
            accountName: chartOfAccounts.name,
            total: sql<number>`coalesce(sum(${journalLines.debit}) - sum(${journalLines.credit}), 0)`,
        })
            .from(journalLines)
            .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
            .innerJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
            .leftJoin(costCenters, eq(journalLines.costCenterId, costCenters.id))
            .where(and(
                gte(journalEntries.date, start),
                lte(journalEntries.date, end),
                eq(journalEntries.status, 'POSTED'),
                // Operating expenses only: stock COGS journals (referenceType
                // COGS) are tracked separately, never as opex.
                eq(journalEntries.referenceType, 'EXPENSE'),
                eq(chartOfAccounts.type, 'EXPENSE'),
                branchJournalScope(branchId)
            ))
            .groupBy(chartOfAccounts.name)
            .orderBy(sql`sum(${journalLines.debit}) - sum(${journalLines.credit}) desc`)
            .limit(20);

        // Grand operating-expense total (same filters, no limit) so % shares
        // are against ALL expenses — not 100% within the top-20 list.
        const [grand] = await db.select({
            total: sql<number>`coalesce(sum(${journalLines.debit}) - sum(${journalLines.credit}), 0)`,
        })
            .from(journalLines)
            .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
            .innerJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
            .leftJoin(costCenters, eq(journalLines.costCenterId, costCenters.id))
            .where(and(
                gte(journalEntries.date, start),
                lte(journalEntries.date, end),
                eq(journalEntries.status, 'POSTED'),
                eq(journalEntries.referenceType, 'EXPENSE'),
                eq(chartOfAccounts.type, 'EXPENSE'),
                branchJournalScope(branchId)
            ));

        res.json({
            items: rows.map(r => ({ name: r.accountName, total: Number(r.total) })),
            grandTotal: Number(grand?.total || 0),
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getExpenseReport = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, branchId: rawBranchId, status, limit, offset } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates required' });
        const branchId = resolveScopedBranchId(req, rawBranchId as string | undefined);
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);
        const entryStatus = String(status || 'ALL').toUpperCase();
        const pageLimit = Math.min(Math.max(Number(limit) || 100, 1), 1000);
        const pageOffset = Math.max(Number(offset) || 0, 0);

        // Status filter: ALL means both POSTED and PENDING_APPROVAL
        const allowedStatuses: string[] = entryStatus === 'ALL'
            ? ['POSTED', 'PENDING_APPROVAL']
            : (entryStatus === 'POSTED' || entryStatus === 'PENDING_APPROVAL' ? [entryStatus] : ['POSTED', 'PENDING_APPROVAL']);

        const statusCondition = allowedStatuses.length === 1
            ? eq(journalEntries.status, allowedStatuses[0])
            : or(eq(journalEntries.status, 'POSTED'), eq(journalEntries.status, 'PENDING_APPROVAL'));

        const conditions = [
            gte(journalEntries.date, start),
            lte(journalEntries.date, end),
            statusCondition,
            eq(journalEntries.referenceType, 'EXPENSE'),
            eq(chartOfAccounts.type, 'EXPENSE'),
            branchJournalScope(branchId),
        ];

        const rows = await db.select({
            entryId: journalEntries.id,
            entryNumber: journalEntries.entryNumber,
            date: journalEntries.date,
            reference: journalEntries.reference,
            referenceType: journalEntries.referenceType,
            description: journalEntries.description,
            status: journalEntries.status,
            createdBy: journalEntries.createdBy,
            createdByName: users.name,
            accountId: chartOfAccounts.id,
            accountCode: chartOfAccounts.code,
            accountName: chartOfAccounts.name,
            accountNameAr: chartOfAccounts.nameAr,
            costCenterId: costCenters.id,
            costCenterName: costCenters.name,
            branchId: costCenters.branchId,
            branchName: branches.name,
            amount: sql<number>`coalesce(${journalLines.debit} - ${journalLines.credit}, 0)`,
        })
            .from(journalLines)
            .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
            .innerJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
            .leftJoin(costCenters, eq(journalLines.costCenterId, costCenters.id))
            .leftJoin(users, eq(journalEntries.createdBy, users.id))
            .leftJoin(branches, eq(costCenters.branchId, branches.id))
            .where(and(...conditions))
            .orderBy(desc(journalEntries.date), desc(journalLines.id))
            .offset(pageOffset)
            .fetch(pageLimit);

        // Also get counts for both statuses
        const countConditions = [
            gte(journalEntries.date, start),
            lte(journalEntries.date, end),
            eq(journalEntries.referenceType, 'EXPENSE'),
            eq(chartOfAccounts.type, 'EXPENSE'),
            branchJournalScope(branchId),
        ];
        const countRows = await db.select({
            status: journalEntries.status,
            count: sql<number>`count(*)`,
            total: sql<number>`coalesce(sum(${journalLines.debit} - ${journalLines.credit}), 0)`,
        })
            .from(journalLines)
            .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
            .innerJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
            .leftJoin(costCenters, eq(journalLines.costCenterId, costCenters.id))
            .where(and(...countConditions))
            .groupBy(journalEntries.status);

        let postedCount = 0, postedTotal = 0, pendingCount = 0, pendingTotal = 0;
        for (const c of countRows) {
            if (c.status === 'POSTED') { postedCount = Number(c.count); postedTotal = Number(c.total); }
            else if (c.status === 'PENDING_APPROVAL') { pendingCount = Number(c.count); pendingTotal = Number(c.total); }
        }

        // Summaries MUST aggregate the full filtered set in SQL — the page
        // above is limited/offset, so JS-side aggregation over `rows` would
        // under-report totals whenever pagination kicks in.
        const [fullTotal] = await db.select({
            total: sql<number>`coalesce(sum(${journalLines.debit} - ${journalLines.credit}), 0)`,
            count: sql<number>`count(*)`,
        })
            .from(journalLines)
            .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
            .innerJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
            .leftJoin(costCenters, eq(journalLines.costCenterId, costCenters.id))
            .where(and(...conditions));

        const byCategoryRows = await db.select({
            accountId: chartOfAccounts.id,
            code: chartOfAccounts.code,
            name: chartOfAccounts.name,
            nameAr: chartOfAccounts.nameAr,
            total: sql<number>`coalesce(sum(${journalLines.debit} - ${journalLines.credit}), 0)`,
            count: sql<number>`count(*)`,
        })
            .from(journalLines)
            .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
            .innerJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
            .leftJoin(costCenters, eq(journalLines.costCenterId, costCenters.id))
            .where(and(...conditions))
            .groupBy(chartOfAccounts.id, chartOfAccounts.code, chartOfAccounts.name, chartOfAccounts.nameAr);

        const byDayRows = await db.select({
            day: sql<string>`format(${journalEntries.date}, 'yyyy-MM-dd')`,
            total: sql<number>`coalesce(sum(${journalLines.debit} - ${journalLines.credit}), 0)`,
            count: sql<number>`count(*)`,
        })
            .from(journalLines)
            .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
            .innerJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
            .leftJoin(costCenters, eq(journalLines.costCenterId, costCenters.id))
            .where(and(...conditions))
            .groupBy(sql`format(${journalEntries.date}, 'yyyy-MM-dd')`);

        res.json({
            summary: {
                total: Number(Number(fullTotal?.total || 0).toFixed(2)),
                count: Number(fullTotal?.count || 0),
                totalCount: postedCount + pendingCount,
                postedCount,
                postedTotal: Number(postedTotal.toFixed(2)),
                pendingCount,
                pendingTotal: Number(pendingTotal.toFixed(2)),
                status: entryStatus,
                branchId: branchId || 'ALL',
                hasMore: rows.length >= pageLimit,
            },
            byCategory: byCategoryRows
                .map(row => ({
                    code: row.code,
                    name: row.name,
                    nameAr: row.nameAr || null,
                    total: Number(Number(row.total || 0).toFixed(2)),
                    count: Number(row.count || 0),
                }))
                .sort((a, b) => b.total - a.total),
            byDay: byDayRows
                .map(row => ({
                    day: row.day || 'Unknown',
                    total: Number(Number(row.total || 0).toFixed(2)),
                    count: Number(row.count || 0),
                }))
                .sort((a, b) => a.day.localeCompare(b.day)),
            rows: rows.map(row => ({
                ...row,
                amount: Number(Number(row.amount || 0).toFixed(2)),
            })),
        });
    } catch (error: any) {
        const message = error?.message || 'Failed to load expense report';
        if (message === 'AUTH_REQUIRED') return res.status(401).json({ error: message });
        if (message === 'FORBIDDEN_BRANCH_SCOPE' || message === 'BRANCH_SCOPE_REQUIRED') return res.status(403).json({ error: message });
        res.status(400).json({ error: message });
    }
};
