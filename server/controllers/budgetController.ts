/**
 * Budget Controller — CRUD + Budget vs Actual comparison
 * Manages budgets per period, with line items mapped to GL accounts.
 */

import { Request, Response } from 'express';
import { db } from '../db';
import { budgets, budgetLines, chartOfAccounts, journalEntries, journalLines } from '../../src/db/schema';
import { eq, and, gte, lte, sql, desc, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// ============================================================================
// CRUD
// ============================================================================

export const getBudgets = async (req: Request, res: Response) => {
    try {
        const branchId = req.query.branchId as string | undefined;
        const status = req.query.status as string | undefined;

        const conditions: any[] = [];
        if (branchId && branchId !== 'undefined') conditions.push(eq(budgets.branchId, branchId));
        if (status && status !== 'undefined') conditions.push(eq(budgets.status, status));

        const rows = conditions.length > 0
            ? await db.select().from(budgets).where(and(...conditions)).orderBy(desc(budgets.createdAt))
            : await db.select().from(budgets).orderBy(desc(budgets.createdAt));

        res.json(rows);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getBudgetById = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id || '');
        const [budget] = await db.select().from(budgets).where(eq(budgets.id, id));
        if (!budget) return res.status(404).json({ error: 'Budget not found' });

        const lines = await db.select({
            id: budgetLines.id,
            accountId: budgetLines.accountId,
            accountCode: chartOfAccounts.code,
            accountName: chartOfAccounts.name,
            accountType: chartOfAccounts.type,
            plannedAmount: budgetLines.plannedAmount,
            description: budgetLines.description,
        }).from(budgetLines)
            .innerJoin(chartOfAccounts, eq(budgetLines.accountId, chartOfAccounts.id))
            .where(eq(budgetLines.budgetId, id as string))
            .orderBy(chartOfAccounts.code);

        res.json({ ...budget, lines });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createBudget = async (req: Request, res: Response) => {
    try {
        const { name, branchId, periodStart, periodEnd, notes, lines } = req.body;
        if (!name || !periodStart || !periodEnd) {
            return res.status(400).json({ error: 'name, periodStart, and periodEnd are required' });
        }

        const budgetId = `BDG-${nanoid(8)}`;
        const userId = (req as any).user?.id || req.body.createdBy || 'system';

        const [created] = await db.insert(budgets).values({
            id: budgetId,
            name,
            branchId: branchId || null,
            periodStart: new Date(periodStart),
            periodEnd: new Date(periodEnd),
            status: 'DRAFT',
            notes: notes || null,
            createdBy: userId,
        }).returning();

        // Insert budget lines if provided
        if (Array.isArray(lines) && lines.length > 0) {
            await db.insert(budgetLines).values(
                lines.map((line: any) => ({
                    budgetId,
                    accountId: line.accountId,
                    plannedAmount: String(line.plannedAmount || 0),
                    description: line.description || null,
                }))
            );
        }

        res.status(201).json(created);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateBudget = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id || '');
        const { name, branchId, periodStart, periodEnd, notes, status, lines } = req.body;

        const updates: any = { updatedAt: new Date() };
        if (name !== undefined) updates.name = name;
        if (branchId !== undefined) updates.branchId = branchId || null;
        if (periodStart !== undefined) updates.periodStart = new Date(periodStart);
        if (periodEnd !== undefined) updates.periodEnd = new Date(periodEnd);
        if (notes !== undefined) updates.notes = notes;
        if (status !== undefined) updates.status = status;

        const [updated] = await db.update(budgets).set(updates).where(eq(budgets.id, id)).returning();
        if (!updated) return res.status(404).json({ error: 'Budget not found' });

        // Replace lines if provided
        if (Array.isArray(lines)) {
            await db.delete(budgetLines).where(eq(budgetLines.budgetId, id));
            if (lines.length > 0) {
                await db.insert(budgetLines).values(
                    lines.map((line: any) => ({
                        budgetId: id,
                        accountId: line.accountId,
                        plannedAmount: String(line.plannedAmount || 0),
                        description: line.description || null,
                    }))
                );
            }
        }

        res.json(updated);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteBudget = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id || '');
        // budget_lines cascade on delete
        await db.delete(budgets).where(eq(budgets.id, id));
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================================================
// BUDGET VS ACTUAL COMPARISON
// ============================================================================

export const getBudgetVsActual = async (req: Request, res: Response) => {
    try {
        const budgetId = String(req.params.id || req.query.budgetId || '');
        if (!budgetId) return res.status(400).json({ error: 'Budget ID is required' });

        // Get the budget with its period
        const [budget] = await db.select().from(budgets).where(eq(budgets.id, budgetId));
        if (!budget) return res.status(404).json({ error: 'Budget not found' });

        // Get all budget lines with account info
        const lines = await db.select({
            accountId: budgetLines.accountId,
            accountCode: chartOfAccounts.code,
            accountName: chartOfAccounts.name,
            accountType: chartOfAccounts.type,
            normalBalance: chartOfAccounts.normalBalance,
            plannedAmount: budgetLines.plannedAmount,
            description: budgetLines.description,
        }).from(budgetLines)
            .innerJoin(chartOfAccounts, eq(budgetLines.accountId, chartOfAccounts.id))
            .where(eq(budgetLines.budgetId, budgetId as string))
            .orderBy(chartOfAccounts.code);

        // Get actual amounts from journal lines for the same period and accounts
        const accountIds = lines.map(l => l.accountId);
        if (accountIds.length === 0) {
            return res.json({
                budget: { id: budget.id, name: budget.name, periodStart: budget.periodStart, periodEnd: budget.periodEnd, status: budget.status },
                lines: [],
                summary: { totalPlanned: 0, totalActual: 0, totalVariance: 0, variancePercent: 0 },
            });
        }

        // Aggregate actual journal entries within the budget period
        const actualRows = await db.select({
            accountId: journalLines.accountId,
            totalDebit: sql<number>`coalesce(sum(${journalLines.debit}), 0)`,
            totalCredit: sql<number>`coalesce(sum(${journalLines.credit}), 0)`,
        }).from(journalLines)
            .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
            .where(and(
                gte(journalEntries.date, budget.periodStart),
                lte(journalEntries.date, budget.periodEnd),
                eq(journalEntries.status, 'POSTED'),
                inArray(journalLines.accountId, accountIds),
            ))
            .groupBy(journalLines.accountId);

        const actualMap = new Map(actualRows.map(r => [r.accountId, {
            totalDebit: Number(r.totalDebit),
            totalCredit: Number(r.totalCredit),
        }]));

        // Build comparison
        let totalPlanned = 0;
        let totalActual = 0;

        const comparison = lines.map(line => {
            const planned = Number(line.plannedAmount || 0);
            const actual = actualMap.get(line.accountId);

            // For EXPENSE/ASSET: actual = debits - credits (debit-normal)
            // For REVENUE/LIABILITY/EQUITY: actual = credits - debits (credit-normal)
            let actualAmount = 0;
            if (actual) {
                actualAmount = line.normalBalance === 'DEBIT'
                    ? actual.totalDebit - actual.totalCredit
                    : actual.totalCredit - actual.totalDebit;
            }

            const variance = actualAmount - planned;
            const variancePercent = planned !== 0 ? Number(((variance / Math.abs(planned)) * 100).toFixed(1)) : 0;

            // For expenses: over budget is negative (variance > 0 means overspending)
            // For revenue: under budget is negative (variance < 0 means underperformance)
            const isOverBudget = line.accountType === 'EXPENSE' || line.accountType === 'ASSET'
                ? variance > 0 // expenses: actual > planned = over budget
                : variance < 0; // revenue: actual < planned = under budget

            totalPlanned += Math.abs(planned);
            totalActual += Math.abs(actualAmount);

            return {
                accountId: line.accountId,
                accountCode: line.accountCode,
                accountName: line.accountName,
                accountType: line.accountType,
                description: line.description,
                planned: Number(planned.toFixed(2)),
                actual: Number(actualAmount.toFixed(2)),
                variance: Number(variance.toFixed(2)),
                variancePercent,
                isOverBudget,
            };
        });

        const totalVariance = totalActual - totalPlanned;
        const totalVariancePercent = totalPlanned > 0
            ? Number(((totalVariance / totalPlanned) * 100).toFixed(1))
            : 0;

        res.json({
            budget: {
                id: budget.id,
                name: budget.name,
                branchId: budget.branchId,
                periodStart: budget.periodStart,
                periodEnd: budget.periodEnd,
                status: budget.status,
            },
            lines: comparison,
            summary: {
                totalPlanned: Number(totalPlanned.toFixed(2)),
                totalActual: Number(totalActual.toFixed(2)),
                totalVariance: Number(totalVariance.toFixed(2)),
                variancePercent: totalVariancePercent,
            },
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
