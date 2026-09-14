import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { auditLogs, bonusPenaltyRecords, chartOfAccounts, employeeLoans, journalEntries, journalLines, loanInstallments, payrollCycles, payrollLocks, payrollRuns } from '../../src/db/schema';
import { createSignedAuditLog } from './auditService';
import { GLService } from './glService';

export const payrollReopenService = {
    async reopenCycle(input: { cycleId: string; reopenedBy: string; reason: string }) {
        const [cycle] = await db.select().top(1).from(payrollCycles).where(eq(payrollCycles.id, input.cycleId));
        if (!cycle) throw new Error('PAYROLL_CYCLE_NOT_FOUND');

        const [latestRun] = await db.select().from(payrollRuns)
            .where(eq(payrollRuns.cycleId, input.cycleId))
            .orderBy(payrollRuns.closedAt)
            .offset(0).fetch(1);

        if (!latestRun || latestRun.status !== 'CLOSED') {
            throw new Error('PAYROLL_RUN_NOT_CLOSED');
        }

        await db.transaction(async (tx) => {
            await tx.update(payrollRuns)
                .set({ status: 'REOPENED', updatedAt: new Date() })
                .where(eq(payrollRuns.id, latestRun.id));

            await tx.update(payrollCycles)
                .set({ status: 'REOPENED', updatedAt: new Date() })
                .where(eq(payrollCycles.id, input.cycleId));

            await tx.update(payrollLocks)
                .set({ lockedThrough: cycle.periodStart, updatedAt: new Date() })
                .where(eq(payrollLocks.branchId, cycle.branchId));

            // Restore loan installments deducted by this close back to PENDING.
            const branchLoans = await tx.select({ id: employeeLoans.id }).from(employeeLoans)
                .where(eq(employeeLoans.branchId, cycle.branchId));
            if (branchLoans.length) {
                await tx.update(loanInstallments)
                    .set({ status: 'PENDING', paidAt: null, payrollCycleId: null, updatedAt: new Date() })
                    .where(and(
                        eq(loanInstallments.payrollCycleId, input.cycleId),
                        eq(loanInstallments.status, 'DEDUCTED'),
                    ));
            }

            // Restore bonuses applied by this close back to APPROVED.
            await tx.update(bonusPenaltyRecords)
                .set({ status: 'APPROVED', updatedAt: new Date() })
                .where(and(
                    eq(bonusPenaltyRecords.payrollCycleId, input.cycleId),
                    eq(bonusPenaltyRecords.status, 'APPLIED'),
                ));
        });

        // Reverse the posted PAYROLL journal (best-effort, audited).
        try {
            const [posted] = await db.select({ id: journalEntries.id }).top(1).from(journalEntries)
                .where(and(
                    eq(journalEntries.reference, latestRun.id),
                    eq(journalEntries.referenceType, 'PAYROLL'),
                ));
            if (posted) {
                const [reversed] = await db.select({ id: journalEntries.id }).top(1).from(journalEntries)
                    .where(and(
                        eq(journalEntries.reference, latestRun.id),
                        eq(journalEntries.referenceType, 'PAYROLL_REVERSAL'),
                    ));
                if (!reversed) {
                    const lines = await db.select({
                        accountId: journalLines.accountId,
                        debit: journalLines.debit,
                        credit: journalLines.credit,
                    }).from(journalLines).where(eq(journalLines.journalEntryId, (posted as any).id));
                    const codeById = new Map<string, string>();
                    const ids = Array.from(new Set(lines.map((l: any) => String(l.accountId)).filter(Boolean)));
                    if (ids.length) {
                        const rows = await db.select({ id: chartOfAccounts.id, code: chartOfAccounts.code })
                            .from(chartOfAccounts).where(inArray(chartOfAccounts.id, ids));
                        for (const row of rows) codeById.set(String((row as any).id), String((row as any).code));
                    }
                    await GLService.postJournalEntry({
                        reference: latestRun.id,
                        referenceType: 'PAYROLL_REVERSAL' as any,
                        description: `Payroll reversal for reopened run ${latestRun.id} (${input.reason || 'no reason'})`,
                        createdBy: input.reopenedBy,
                        branchId: cycle.branchId,
                        lines: lines.map((l: any) => ({
                            accountCode: codeById.get(String(l.accountId)) || String(l.accountId),
                            debit: Number(l.credit || 0),
                            credit: Number(l.debit || 0),
                        })),
                    });
                }
            }
        } catch (error: any) {
            await createSignedAuditLog({
                eventType: 'PAYROLL_REVERSAL_FAILED',
                userId: input.reopenedBy,
                branchId: cycle.branchId,
                payload: { cycleId: input.cycleId, runId: latestRun.id, error: String(error?.message || error) },
            });
        }

        await createSignedAuditLog({
            eventType: 'PAYROLL_REOPENED',
            userId: input.reopenedBy,
            branchId: cycle.branchId,
            payload: {
                cycleId: input.cycleId,
                runId: latestRun.id,
                reason: input.reason,
            },
        });

        return {
            cycleId: input.cycleId,
            runId: latestRun.id,
            status: 'REOPENED',
        };
    },
};

export default payrollReopenService;
