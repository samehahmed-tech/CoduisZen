import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createUser } from '../server/controllers/userController';
import { db } from '../server/db';
import { branches, employees, users } from '../src/db/schema';

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

describe('HR employee account creation', () => {
    it('creates the login and linked employee in one request', async () => {
        const suffix = randomUUID().slice(0, 8);
        const branchId = `test-employee-account-branch-${suffix}`;
        const email = `employee-${suffix}@example.com`;
        await db.insert(branches).values({ id: branchId, name: 'Employee Account Branch' });

        const req: any = {
            body: {
                name: 'Linked Employee',
                email,
                role: 'CASHIER',
                assignedBranchId: branchId,
                allowedBranches: [branchId],
                createEmployeeRecord: true,
                employeeCode: `EMP-${suffix}`,
                basicSalary: 6500,
            },
            headers: {},
            user: { id: 'system' },
        };
        const res = response();

        try {
            await createUser(req, res);

            expect(res.statusCode).toBe(201);
            const [employee] = await db.select().from(employees).where(eq(employees.userId, res.body.id));
            expect(employee).toMatchObject({
                branchId,
                email,
                employeeCode: `EMP-${suffix}`,
                basicSalary: 6500,
            });
        } finally {
            await db.delete(employees).where(eq(employees.email, email));
            await db.delete(users).where(eq(users.email, email));
            await db.delete(branches).where(eq(branches.id, branchId));
        }
    });
});
