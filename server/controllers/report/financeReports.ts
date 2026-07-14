import { Request, Response } from 'express';
import { eq, and, or, sql, gte, lte, desc } from 'drizzle-orm';
import { db } from '../../db';
import { journalEntries, journalLines, chartOfAccounts, costCenters, users, branches } from '../../../src/db/schema';
import { parseLocalDateRange, resolveScopedBranchId } from './reportUtils';

const branchJournalScope = (branchId?: string) => (
    branchId ? eq(costCenters.branchId, branchId) : undefined
);

export const getTrialBalance = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates required' });
        const { start, end } = parseLocalDateRange(startDate as string, endDate as string);

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
            .where(and(
                gte(journalEntries.date, start),
                lte(journalEntries.date, end),
                eq(journalEntries.status, 'POSTED')
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
            .groupBy(chartOfAccounts.type, chartOfAccounts.name)
            .orderBy(chartOfAccounts.type);

        const revenue = rows.filter(r => r.accountType === 'REVENUE').reduce((s, r) => s + Number(r.totalCredit) - Number(r.totalDebit), 0);
        const expenses = rows.filter(r => r.accountType === 'EXPENSE').reduce((s, r) => s + Number(r.totalDebit) - Number(r.totalCredit), 0);

        res.json({
            revenue,
            expenses,
            netProfit: revenue - expenses,
            details: rows.map(r => ({
                type: r.accountType,
                name: r.accountName,
                debit: Number(r.totalDebit),
                credit: Number(r.totalCredit),
                net: Number(r.totalCredit) - Number(r.totalDebit),
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
                eq(journalEntries.referenceType, 'EXPENSE'),
                eq(chartOfAccounts.type, 'EXPENSE'),
                branchJournalScope(branchId)
            ))
            .groupBy(chartOfAccounts.name)
            .orderBy(sql`sum(${journalLines.debit}) - sum(${journalLines.credit}) desc`)
            .limit(20);

        res.json(rows.map(r => ({ name: r.accountName, total: Number(r.total) })));
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

        const byCategory = new Map<string, { code: string; name: string; nameAr: string | null; total: number; count: number }>();
        const byDay = new Map<string, { day: string; total: number; count: number }>();
        let total = 0;

        for (const row of rows) {
            const amount = Number(row.amount || 0);
            total += amount;
            const category = byCategory.get(row.accountId) || {
                code: row.accountCode,
                name: row.accountName,
                nameAr: row.accountNameAr || null,
                total: 0,
                count: 0,
            };
            category.total += amount;
            category.count += 1;
            byCategory.set(row.accountId, category);

            const day = row.date ? new Date(row.date).toISOString().slice(0, 10) : 'Unknown';
            const dayRow = byDay.get(day) || { day, total: 0, count: 0 };
            dayRow.total += amount;
            dayRow.count += 1;
            byDay.set(day, dayRow);
        }

        res.json({
            summary: {
                total: Number(total.toFixed(2)),
                count: rows.length,
                totalCount: postedCount + pendingCount,
                postedCount,
                postedTotal: Number(postedTotal.toFixed(2)),
                pendingCount,
                pendingTotal: Number(pendingTotal.toFixed(2)),
                status: entryStatus,
                branchId: branchId || 'ALL',
                hasMore: rows.length >= pageLimit,
            },
            byCategory: Array.from(byCategory.values())
                .map(row => ({ ...row, total: Number(row.total.toFixed(2)) }))
                .sort((a, b) => b.total - a.total),
            byDay: Array.from(byDay.values())
                .map(row => ({ ...row, total: Number(row.total.toFixed(2)) }))
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
