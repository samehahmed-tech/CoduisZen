/**
 * Tip Pooling Service — P1 Financial Backbone (Toast-style tip management)
 *
 * Shifts collect tips (cash or card). At end-of-shift a manager allocates the
 * pool to staff using one of three distribution methods:
 * - EQUAL          : split evenly across all included employees
 * - HOURS_WORKED   : weighted by each employee's hours in the shift
 * - ROLE_WEIGHTS   : weighted by hours × role weight (waiter 1.2, runner 1.0, ...)
 *
 * Payout marks allocations paid_out and optionally posts to the GL.
 */

import { db } from '../db';
import { employees, tipPools, tipAllocations, shifts } from '../../src/db/schema';
import { and, eq, desc, inArray, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { assertTipAllocationBalanced } from '../utils/tipReconciliation';

export const tipPoolService = {
    createPool: async (input: { branchId: string; shiftId?: string; pooledAmount: number; paymentMethod?: string; createdBy?: string }) => {
        const amount = Number(input.pooledAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
            throw Object.assign(new Error('INVALID_TIP_AMOUNT'), { status: 400, code: 'INVALID_TIP_AMOUNT' });
        }
        const id = `pool-${nanoid(8)}`;
        await db.insert(tipPools).values({
            id,
            branchId: input.branchId,
            shiftId: input.shiftId || null,
            pooledAmount: String(amount),
            paymentMethod: input.paymentMethod || 'CASH',
            status: 'COLLECTED',
            createdBy: input.createdBy,
        });
        const [pool] = await db.select().from(tipPools).where(eq(tipPools.id, id));
        return pool;
    },

    /**
     * Allocate the pool to employees according to the distribution method.
     * Replaces any previous allocation (idempotent re-allocations).
     */
    allocatePool: async (poolId: string, input: {
        distributionMethod: 'EQUAL' | 'HOURS_WORKED' | 'ROLE_WEIGHTS';
        employees: { employeeId: string; baseHours?: number; roleWeight?: number }[];
        allocatedBy?: string;
    }, branchId?: string) => {
        const [pool] = await db.select().from(tipPools).where(eq(tipPools.id, poolId));
        if (!pool) throw Object.assign(new Error('TIP_POOL_NOT_FOUND'), { status: 404, code: 'TIP_POOL_NOT_FOUND' });
        if (branchId && pool.branchId !== branchId) throw Object.assign(new Error('FORBIDDEN_BRANCH_ACCESS'), { status: 403, code: 'FORBIDDEN_BRANCH_ACCESS' });
        if (pool.status !== 'COLLECTED') {
            throw Object.assign(new Error('TIP_POOL_ALREADY_ALLOCATED'), { status: 400, code: 'TIP_POOL_ALREADY_ALLOCATED' });
        }
        if (input.employees.length === 0) {
            throw Object.assign(new Error('TIP_ALLOCATION_NO_EMPLOYEES'), { status: 400, code: 'TIP_ALLOCATION_NO_EMPLOYEES' });
        }
        const employeeIds = input.employees.map((employee) => employee.employeeId);
        if (new Set(employeeIds).size !== employeeIds.length) {
            throw Object.assign(new Error('TIP_ALLOCATION_DUPLICATE_EMPLOYEE'), { status: 400, code: 'TIP_ALLOCATION_DUPLICATE_EMPLOYEE' });
        }
        const branchEmployees = await db.select({ id: employees.id }).from(employees)
            .where(and(eq(employees.branchId, pool.branchId), inArray(employees.id, employeeIds)));
        if (branchEmployees.length !== employeeIds.length) {
            throw Object.assign(new Error('TIP_ALLOCATION_EMPLOYEE_BRANCH_MISMATCH'), { status: 403, code: 'TIP_ALLOCATION_EMPLOYEE_BRANCH_MISMATCH' });
        }

        const total = Number(pool.pooledAmount);
        const allocationEmployees = input.employees.map(e => ({
            employeeId: e.employeeId,
            hours: Number(e.baseHours) || 0,
            weight: Number(e.roleWeight) || 1,
        }));

        const weights = allocationEmployees.map(e => {
            if (input.distributionMethod === 'EQUAL') return 1;
            return (e.hours || 1) * (e.weight || 1);
        });
        const weightSum = weights.reduce((s, w) => s + w, 0);

        const allocationRows: Array<{ id: string; tipPoolId: string; employeeId: string; baseHours: number; roleWeight: string; allocatedAmount: string }> = [];
        let remaining = total;
        for (let i = 0; i < allocationEmployees.length; i++) {
            const share = i === allocationEmployees.length - 1
                ? Math.round(remaining * 100) / 100 // last employee takes rounding dust
                : Math.round((total * weights[i] / weightSum) * 100) / 100;
            remaining -= share;
            allocationRows.push({
                id: `tipal-${nanoid(8)}`,
                tipPoolId: poolId,
                employeeId: allocationEmployees[i].employeeId,
                baseHours: allocationEmployees[i].hours,
                roleWeight: String(allocationEmployees[i].weight),
                allocatedAmount: String(share),
            });
        }

        assertTipAllocationBalanced(total, allocationRows.map((row) => row.allocatedAmount));

        await db.transaction(async (tx) => {
            await tx.delete(tipAllocations).where(eq(tipAllocations.tipPoolId, poolId));
            await tx.insert(tipAllocations).values(allocationRows);
            await tx.update(tipPools).set({
                distributionMethod: input.distributionMethod,
                status: 'ALLOCATED',
                allocatedBy: input.allocatedBy,
                updatedAt: new Date(),
            }).where(eq(tipPools.id, poolId));
        });

        return db.select().from(tipAllocations).where(eq(tipAllocations.tipPoolId, poolId));
    },

    payOut: async (poolId: string, paidOutBy?: string, branchId?: string) => {
        return db.transaction(async (tx) => {
            const [pool] = await tx.select().from(tipPools).where(eq(tipPools.id, poolId));
            if (!pool) throw Object.assign(new Error('TIP_POOL_NOT_FOUND'), { status: 404, code: 'TIP_POOL_NOT_FOUND' });
            if (branchId && pool.branchId !== branchId) throw Object.assign(new Error('FORBIDDEN_BRANCH_ACCESS'), { status: 403, code: 'FORBIDDEN_BRANCH_ACCESS' });
            if (pool.status !== 'ALLOCATED') {
                throw Object.assign(new Error('TIP_POOL_NOT_ALLOCATED'), { status: 400, code: 'TIP_POOL_NOT_ALLOCATED' });
            }

            const now = new Date();
            const [claimed] = await tx.update(tipPools).set({ status: 'PROCESSING', updatedAt: now })
                .output().where(and(eq(tipPools.id, poolId), eq(tipPools.status, 'ALLOCATED')));
            if (!claimed) throw Object.assign(new Error('TIP_POOL_NOT_ALLOCATED'), { status: 400, code: 'TIP_POOL_NOT_ALLOCATED' });

            const glMod = await import('./glService');
            const posting = await glMod.GLService.postJournalEntry({
                reference: `TIP-${pool.id}`,
                referenceType: 'TIP_PAYOUT' as never,
                description: `Tip pool payout ${pool.pooledAmount} EGP`,
                branchId: pool.branchId,
                lines: [
                    { accountCode: '2300', debit: Number(pool.pooledAmount), credit: 0, description: 'Tips payable clearing' },
                    { accountCode: '1110', debit: 0, credit: Number(pool.pooledAmount), description: 'Cash paid out to staff' },
                ],
                createdBy: paidOutBy || pool.allocatedBy || undefined,
                actorId: paidOutBy || pool.allocatedBy || 'system',
                source: 'TIP_PAYOUT',
                correlationId: `TIP_PAYOUT:${pool.id}`,
            }, tx);
            if (typeof posting === 'string' || !posting || !('entryId' in posting) || !posting.entryId) {
                throw Object.assign(new Error('TIP_GL_POSTING_FAILED'), { status: 409, code: 'TIP_GL_POSTING_FAILED' });
            }

            await tx.update(tipAllocations).set({ paidOut: true }).where(eq(tipAllocations.tipPoolId, poolId));
            await tx.update(tipPools).set({ status: 'PAID_OUT', paidOutAt: now, updatedAt: new Date() })
                .where(and(eq(tipPools.id, poolId), eq(tipPools.status, 'PROCESSING')));
            const [updated] = await tx.select().from(tipPools).where(eq(tipPools.id, poolId));
            return updated;
        });
    },

    listPools: async (branchId: string) => {
        return db.select().from(tipPools)
            .where(eq(tipPools.branchId, branchId))
            .orderBy(desc(tipPools.createdAt));
    },

    poolDetail: async (poolId: string, branchId?: string) => {
        const [pool] = await db.select().from(tipPools).where(eq(tipPools.id, poolId));
        if (!pool) return null;
        if (branchId && pool.branchId !== branchId) throw Object.assign(new Error('FORBIDDEN_BRANCH_ACCESS'), { status: 403, code: 'FORBIDDEN_BRANCH_ACCESS' });
        const allocations = await db.select().from(tipAllocations).where(eq(tipAllocations.tipPoolId, poolId));
        return { pool, allocations };
    },
};

export default tipPoolService;
