import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { auditLogs, payrollCycles, payrollLocks, payrollRuns } from '../../src/db/schema';
import { createSignedAuditLog } from './auditService';

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

        await db.update(payrollRuns)
            .set({ status: 'REOPENED', updatedAt: new Date() })
            .where(eq(payrollRuns.id, latestRun.id));

        await db.update(payrollCycles)
            .set({ status: 'REOPENED', updatedAt: new Date() })
            .where(eq(payrollCycles.id, input.cycleId));

        await db.update(payrollLocks)
            .set({ lockedThrough: cycle.periodStart, updatedAt: new Date() })
            .where(eq(payrollLocks.branchId, cycle.branchId));

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
