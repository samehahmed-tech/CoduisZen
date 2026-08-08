import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../server/db';
import { departments, employees, leaveBalances, leaveTypes, branches } from '../src/db/schema';
import { getEmployees, payrollSummary, upsertEmployee } from '../server/controllers/hrController';
import { hrExtendedService } from '../server/services/hrExtendedService';

const branchA = 'test-hr-legacy-branch-a';
const branchB = 'test-hr-legacy-branch-b';

const response = () => {
    const res: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(body: unknown) {
            this.body = body;
            return this;
        },
    };
    return res;
};

describe('legacy HR branch isolation', () => {
    afterEach(async () => {
        await db.delete(leaveBalances).where(inArray(leaveBalances.employeeId, [
            'test-hr-legacy-employee-a',
            'test-hr-legacy-employee-b',
        ]));
        await db.delete(leaveTypes).where(eq(leaveTypes.id, 'TEST-ANNUAL'));
        await db.delete(employees).where(inArray(employees.id, [
            'test-hr-legacy-employee-a',
            'test-hr-legacy-employee-b',
            'test-hr-invalid-employee',
        ]));
        await db.delete(departments).where(eq(departments.id, 'test-hr-department-b'));
        await db.delete(branches).where(inArray(branches.id, [branchA, branchB]));
    });

    beforeEach(async () => {
        await db.insert(branches).values([
            { id: branchA, name: 'HR Legacy A' },
            { id: branchB, name: 'HR Legacy B' },
        ]).onConflictDoNothing();
        await db.insert(employees).values([
            {
                id: 'test-hr-legacy-employee-a',
                branchId: branchA,
                name: 'Employee A',
                employeeCode: 'TEST-HR-A',
                role: 'STAFF',
                basicSalary: 1000,
                isActive: true,
            },
            {
                id: 'test-hr-legacy-employee-b',
                branchId: branchB,
                name: 'Employee B',
                employeeCode: 'TEST-HR-B',
                role: 'STAFF',
                basicSalary: 2000,
                isActive: true,
            },
        ]).onConflictDoNothing();
        await db.insert(departments).values({
            id: 'test-hr-department-b',
            branchId: branchB,
            name: 'Foreign Department',
        }).onConflictDoNothing();
        await db.insert(leaveTypes).values({
            id: 'TEST-ANNUAL',
            name: 'Annual Test Leave',
            daysPerYear: 21,
        }).onConflictDoNothing();
        await db.insert(leaveBalances).values([
            { id: 'test-hr-leave-a', employeeId: 'test-hr-legacy-employee-a', leaveTypeId: 'TEST-ANNUAL', year: 2026, entitledDays: 21 },
            { id: 'test-hr-leave-b', employeeId: 'test-hr-legacy-employee-b', leaveTypeId: 'TEST-ANNUAL', year: 2026, entitledDays: 30 },
        ]).onConflictDoNothing();
    });

    it('lists only employees from the effective branch', async () => {
        const req: any = { query: {}, effectiveBranchId: branchA };
        const res = response();

        await getEmployees(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.map((employee: any) => employee.id)).toEqual(['test-hr-legacy-employee-a']);
    });

    it('does not expose another branch employee payroll summary', async () => {
        const req: any = {
            query: { employeeId: 'test-hr-legacy-employee-b' },
            effectiveBranchId: branchA,
        };
        const res = response();

        await payrollSummary(req, res);

        expect(res.statusCode).toBe(404);
        expect(res.body).toEqual({ error: 'Employee not found' });
    });

    it('rejects assigning an employee to another branch department', async () => {
        const req: any = {
            body: {
                id: 'test-hr-invalid-employee',
                name: 'Invalid Employee',
                departmentId: 'test-hr-department-b',
            },
            effectiveBranchId: branchA,
        };
        const res = response();

        await upsertEmployee(req, res);

        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'INVALID_EMPLOYEE_DEPARTMENT' });
    });

    it('lists leave balances only for the requested branch', async () => {
        const balances = await hrExtendedService.getPersistedLeaveBalances(undefined, 2026, branchA);

        expect(balances.map((balance) => balance.employeeId)).toEqual(['test-hr-legacy-employee-a']);
    });

    it('creates a leave balance with the installed schema identifier type', async () => {
        const balance = await hrExtendedService.upsertLeaveBalance({
            employeeId: 'test-hr-legacy-employee-a',
            leaveTypeId: 'TEST-ANNUAL',
            year: 2027,
            entitledDays: 21,
        });

        expect(balance?.id).toMatch(/^LB-/);
    });
});
