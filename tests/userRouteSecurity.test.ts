import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { branches, users, userSessions } from '../src/db/schema';

let app: any;
let db: typeof import('../server/db')['db'];

const jwtSecret = () => process.env.JWT_SECRET || 'test-jwt-secret-for-user-route-security';

const createSession = async (input: {
    userId: string;
    branchId: string;
    role: string;
    permissions?: string[];
}) => {
    const sessionId = `${input.userId}-session`;
    const tokenId = `${input.userId}-token`;

    await db.insert(users).values({
        id: input.userId,
        name: input.userId,
        email: `${input.userId}@restoflow.local`,
        role: input.role,
        permissions: input.permissions || [],
        assignedBranchId: input.branchId,
        isActive: true,
    });

    await db.insert(userSessions).values({
        id: sessionId,
        userId: input.userId,
        tokenId,
        isActive: true,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const token = jwt.sign({
        sub: input.userId,
        id: input.userId,
        role: input.role,
        permissions: input.permissions || [],
        branchId: input.branchId,
        sid: sessionId,
        jti: tokenId,
    }, jwtSecret());

    return `Bearer ${token}`;
};

describe('user route role boundaries', () => {
    beforeEach(async () => {
        if (!app || !db) {
            const appModule = await import('../server/app');
            app = appModule.default;
            const dbModule = await import('../server/db');
            db = dbModule.db;
        }
    });

    it('keeps owner accounts out of admin-only user management unless explicitly permitted', async () => {
        const suffix = Date.now();
        const branchId = `test-user-route-branch-${suffix}`;
        await db.insert(branches).values({
            id: branchId,
            name: 'User Route Security Branch',
            isActive: true,
        });

        const ownerAuth = await createSession({
            userId: `test-owner-no-admin-${suffix}`,
            branchId,
            role: 'OWNER',
        });

        const permittedOwnerAuth = await createSession({
            userId: `test-owner-users-permission-${suffix}`,
            branchId,
            role: 'OWNER',
            permissions: ['CFG_MANAGE_USERS'],
        });

        const ownerUsersRes = await request(app)
            .get('/api/users')
            .set('Authorization', ownerAuth);

        expect(ownerUsersRes.status).toBe(403);

        const ownerSeedCoaRes = await request(app)
            .post('/api/setup/seed-coa')
            .set('Authorization', ownerAuth)
            .send({});

        expect(ownerSeedCoaRes.status).toBe(403);

        const permittedUsersRes = await request(app)
            .get('/api/users')
            .set('Authorization', permittedOwnerAuth);

        expect(permittedUsersRes.status).toBe(200);
    });

    it('rejects user creation without a valid email', async () => {
        const suffix = Date.now();
        const branchId = `test-user-validation-branch-${suffix}`;
        await db.insert(branches).values({
            id: branchId,
            name: 'User Validation Branch',
            isActive: true,
        });

        const auth = await createSession({
            userId: `test-user-validation-admin-${suffix}`,
            branchId,
            role: 'SUPER_ADMIN',
            permissions: ['*'],
        });

        const missingEmail = await request(app)
            .post('/api/users')
            .set('Authorization', auth)
            .send({ name: 'No Email', role: 'CASHIER' });

        expect(missingEmail.status).toBe(400);

        const invalidEmail = await request(app)
            .post('/api/users')
            .set('Authorization', auth)
            .send({ name: 'Bad Email', email: 'bad-email', role: 'CASHIER' });

        expect(invalidEmail.status).toBe(400);
    });
});
