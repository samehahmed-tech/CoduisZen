import { and, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { db } from '../db';
import { employees, payrollCycles, tipAllocations, tipPools } from '../../src/db/schema';
import { assertTipAllocationBalanced, sumTipAllocations } from '../utils/tipReconciliation';

export const payrollTipReconciliationService = {
    async reconcileCycle(cycleId: string, branchId?: string) {
        const [cycle] = await db.select().from(payrollCycles).where(eq(payrollCycles.id, cycleId)).top(1);
        if (!cycle) throw Object.assign(new Error('PAYROLL_CYCLE_NOT_FOUND'), { status: 404, code: 'PAYROLL_CYCLE_NOT_FOUND' });
        if (branchId && cycle.branchId !== branchId) throw Object.assign(new Error('FORBIDDEN_BRANCH_ACCESS'), { status: 403, code: 'FORBIDDEN_BRANCH_ACCESS' });

        const pools = await db.select().from(tipPools).where(and(
            eq(tipPools.branchId, cycle.branchId),
            gte(tipPools.createdAt, cycle.periodStart),
            lte(tipPools.createdAt, cycle.periodEnd),
            inArray(tipPools.status, ['ALLOCATED', 'PAID_OUT']),
            or(isNull(tipPools.payrollCycleId), eq(tipPools.payrollCycleId, cycle.id)),
        ));
        const poolIds = pools.map((pool) => pool.id);
        const allocations = poolIds.length
            ? await db.select().from(tipAllocations).where(inArray(tipAllocations.tipPoolId, poolIds))
            : [];
        const employeeIds = [...new Set(allocations.map((allocation) => allocation.employeeId))];
        const branchEmployees = employeeIds.length
            ? await db.select({ id: employees.id, name: employees.name }).from(employees)
                .where(and(eq(employees.branchId, cycle.branchId), inArray(employees.id, employeeIds)))
            : [];
        const branchEmployeeIds = new Set(branchEmployees.map((employee) => employee.id));

        const poolRows = pools.map((pool) => {
            const poolAllocations = allocations.filter((allocation) => allocation.tipPoolId === pool.id);
            const pooledAmount = Math.round((Number(pool.pooledAmount || 0) || 0) * 100) / 100;
            const allocatedAmount = sumTipAllocations(poolAllocations.map((allocation) => allocation.allocatedAmount || 0));
            let balanced = false;
            try {
                assertTipAllocationBalanced(pooledAmount, poolAllocations.map((allocation) => allocation.allocatedAmount || 0));
                balanced = true;
            } catch {
                balanced = false;
            }
            const branchSafe = poolAllocations.every((allocation) => branchEmployeeIds.has(allocation.employeeId));
            return {
                poolId: pool.id,
                status: pool.status,
                pooledAmount,
                allocatedAmount,
                balanced: balanced && branchSafe,
                eligibleForPayroll: pool.status === 'ALLOCATED' && balanced && branchSafe,
                allocationCount: poolAllocations.length,
            };
        });

        const byEmployee = branchEmployees.map((employee) => ({
            employeeId: employee.id,
            employeeName: employee.name,
            allocatedAmount: Math.round(allocations
                .filter((allocation) => allocation.employeeId === employee.id)
                .reduce((sum, allocation) => sum + Number(allocation.allocatedAmount || 0), 0) * 100) / 100,
        })).filter((row) => row.allocatedAmount > 0);

        return {
            cycleId: cycle.id,
            branchId: cycle.branchId,
            periodStart: cycle.periodStart,
            periodEnd: cycle.periodEnd,
            pools: poolRows,
            byEmployee,
            totalAllocated: Math.round(poolRows.filter((pool) => pool.eligibleForPayroll).reduce((sum, pool) => sum + pool.allocatedAmount, 0) * 100) / 100,
            readyForPayrollPosting: poolRows.every((pool) => pool.balanced) && poolRows.some((pool) => pool.eligibleForPayroll),
        };
    },
};

export default payrollTipReconciliationService;
