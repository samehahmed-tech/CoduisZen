import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { db } from '../server/db';
import { employees, branches } from '../src/db/schema';
import { getEmployees, payrollSummary } from '../server/controllers/hrController';

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
        await db.delete(employees).where(inArray(employees.id, [
            'test-hr-legacy-employee-a',
            'test-hr-legacy-employee-b',
        ]));
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
});
