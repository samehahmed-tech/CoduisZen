import { randomUUID } from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../server/db';
import payrollCloseService from '../server/services/payrollCloseService';
import {
    branches,
    domainEvents,
    employeeLoans,
    employees,
    loanInstallments,
    payrollCycles,
    payrollLocks,
    payrollProfiles,
    payrollRuns,
} from '../src/db/schema';

const id = (prefix: string) => `test-${prefix}-${randomUUID().slice(0, 8)}`;

let cleanupIds: {
    branchIds: string[];
    employeeIds: string[];
    loanIds: string[];
    cycleId: string;
    profileId: string;
} | null = null;

describe('payroll close isolation', () => {
    afterEach(async () => {
        if (!cleanupIds) return;
        await db.delete(domainEvents).where(eq(domainEvents.entityId, cleanupIds.cycleId));
        await db.delete(payrollLocks).where(inArray(payrollLocks.branchId, cleanupIds.branchIds));
        await db.delete(payrollRuns).where(eq(payrollRuns.cycleId, cleanupIds.cycleId));
        await db.delete(loanInstallments).where(inArray(loanInstallments.loanId, cleanupIds.loanIds));
        await db.delete(employeeLoans).where(inArray(employeeLoans.id, cleanupIds.loanIds));
        await db.delete(payrollCycles).where(eq(payrollCycles.id, cleanupIds.cycleId));
        await db.delete(payrollProfiles).where(eq(payrollProfiles.id, cleanupIds.profileId));
        await db.delete(employees).where(inArray(employees.id, cleanupIds.employeeIds));
        await db.delete(branches).where(inArray(branches.id, cleanupIds.branchIds));
        cleanupIds = null;
    });

    it('deducts only the closing branch installments and rejects a repeated close', async () => {
        const branchA = id('branch-a');
        const branchB = id('branch-b');
        const employeeA = id('employee-a');
        const employeeB = id('employee-b');
        const loanA = id('loan-a');
        const loanB = id('loan-b');
        const cycleId = id('cycle');
        const profileId = id('profile');
        const dueDate = new Date('2026-05-15T00:00:00.000Z');
        cleanupIds = {
            branchIds: [branchA, branchB],
            employeeIds: [employeeA, employeeB],
            loanIds: [loanA, loanB],
            cycleId,
            profileId,
        };

        await db.insert(branches).values([
            { id: branchA, name: 'Payroll Close A' },
            { id: branchB, name: 'Payroll Close B' },
        ]);
        await db.insert(employees).values([
            { id: employeeA, branchId: branchA, name: 'Inactive A', role: 'STAFF', isActive: false },
            { id: employeeB, branchId: branchB, name: 'Inactive B', role: 'STAFF', isActive: false },
        ]);
        await db.insert(payrollProfiles).values({
            id: profileId,
            branchId: branchA,
            name: 'No GL Test Profile',
            autoPostToGl: false,
            isDefault: true,
            isActive: true,
        });
        await db.insert(employeeLoans).values([
            { id: loanA, employeeId: employeeA, branchId: branchA, principalAmount: 100, outstandingAmount: 100 },
            { id: loanB, employeeId: employeeB, branchId: branchB, principalAmount: 100, outstandingAmount: 100 },
        ]);
        await db.insert(loanInstallments).values([
            { loanId: loanA, dueDate, amount: 100, status: 'PENDING' },
            { loanId: loanB, dueDate, amount: 100, status: 'PENDING' },
        ]);
        await db.insert(payrollCycles).values({
            id: cycleId,
            branchId: branchA,
            periodStart: new Date('2026-05-01T00:00:00.000Z'),
            periodEnd: new Date('2026-05-31T23:59:59.000Z'),
            status: 'DRAFT',
        });

        await payrollCloseService.closeCycle({ cycleId });

        const [installmentA] = await db.select().from(loanInstallments).where(eq(loanInstallments.loanId, loanA));
        const [installmentB] = await db.select().from(loanInstallments).where(eq(loanInstallments.loanId, loanB));
        expect(installmentA.status).toBe('DEDUCTED');
        expect(installmentB.status).toBe('PENDING');
        await expect(payrollCloseService.closeCycle({ cycleId })).rejects.toThrow('PAYROLL_CYCLE_ALREADY_CLOSED');
    });
});
