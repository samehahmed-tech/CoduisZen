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
import { tipPools, tipAllocations, shifts } from '../../src/db/schema';
import { and, eq, desc, inArray, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import logger from '../utils/logger';

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
    }) => {
        const [pool] = await db.select().from(tipPools).where(eq(tipPools.id, poolId));
        if (!pool) throw Object.assign(new Error('TIP_POOL_NOT_FOUND'), { status: 404, code: 'TIP_POOL_NOT_FOUND' });
        if (pool.status !== 'COLLECTED') {
            throw Object.assign(new Error('TIP_POOL_ALREADY_ALLOCATED'), { status: 400, code: 'TIP_POOL_ALREADY_ALLOCATED' });
        }
        if (input.employees.length === 0) {
            throw Object.assign(new Error('TIP_ALLOCATION_NO_EMPLOYEES'), { status: 400, code: 'TIP_ALLOCATION_NO_EMPLOYEES' });
        }

        const total = Number(pool.pooledAmount);
        const employees = input.employees.map(e => ({
            employeeId: e.employeeId,
            hours: Number(e.baseHours) || 0,
            weight: Number(e.roleWeight) || 1,
        }));

        const weights = employees.map(e => {
            if (input.distributionMethod === 'EQUAL') return 1;
            return (e.hours || 1) * (e.weight || 1);
        });
        const weightSum = weights.reduce((s, w) => s + w, 0);

        await db.delete(tipAllocations).where(eq(tipAllocations.tipPoolId, poolId));
        let remaining = total;
        for (let i = 0; i < employees.length; i++) {
            const share = i === employees.length - 1
                ? Math.round(remaining * 100) / 100 // last employee takes rounding dust
                : Math.round((total * weights[i] / weightSum) * 100) / 100;
            remaining -= share;
            await db.insert(tipAllocations).values({
                id: `tipal-${nanoid(8)}`,
                tipPoolId: poolId,
                employeeId: employees[i].employeeId,
                baseHours: employees[i].hours,
                roleWeight: String(employees[i].weight),
                allocatedAmount: String(share),
            });
        }

        await db.update(tipPools).set({
            distributionMethod: input.distributionMethod,
            status: 'ALLOCATED',
            updatedAt: new Date(),
        }).where(eq(tipPools.id, poolId));

        return db.select().from(tipAllocations).where(eq(tipAllocations.tipPoolId, poolId));
    },

    payOut: async (poolId: string, paidOutBy?: string) => {
        const [pool] = await db.select().from(tipPools).where(eq(tipPools.id, poolId));
        if (!pool) throw Object.assign(new Error('TIP_POOL_NOT_FOUND'), { status: 404, code: 'TIP_POOL_NOT_FOUND' });
        if (pool.status !== 'ALLOCATED') {
            throw Object.assign(new Error('TIP_POOL_NOT_ALLOCATED'), { status: 400, code: 'TIP_POOL_NOT_ALLOCATED' });
        }

        const now = new Date();
        await db.update(tipAllocations).set({ paidOut: true }).where(eq(tipAllocations.tipPoolId, poolId));
        await db.update(tipPools).set({ status: 'PAID_OUT', paidOutAt: now, updatedAt: now }).where(eq(tipPools.id, poolId));

        try {
            const glMod = await import('./glService');
            await glMod.GLService.postJournalEntry({
                reference: `TIP-${pool.id}`,
                referenceType: 'TIP_PAYOUT' as never,
                description: `Tip pool payout ${pool.pooledAmount} EGP`,
                branchId: pool.branchId,
                lines: [
                    { accountCode: '2300', debit: Number(pool.pooledAmount), credit: 0, description: 'Tips payable clearing' },
                    { accountCode: '1110', debit: 0, credit: Number(pool.pooledAmount), description: 'Cash paid out to staff' },
                ],
                createdBy: paidOutBy || pool.allocatedBy || undefined,
            }).catch(err => logger.warn({ err }, 'tips: GL posting for payout skipped'));
        } catch {
            logger.warn('tips: GL posting skipped (account unmapped)');
        }

        const [updated] = await db.select().from(tipPools).where(eq(tipPools.id, poolId));
        return updated;
    },

    listPools: async (branchId: string) => {
        return db.select().from(tipPools)
            .where(eq(tipPools.branchId, branchId))
            .orderBy(desc(tipPools.createdAt));
    },

    poolDetail: async (poolId: string) => {
        const [pool] = await db.select().from(tipPools).where(eq(tipPools.id, poolId));
        if (!pool) return null;
        const allocations = await db.select().from(tipAllocations).where(eq(tipAllocations.tipPoolId, poolId));
        return { pool, allocations };
    },
};

export default tipPoolService;
