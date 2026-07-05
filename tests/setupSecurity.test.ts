import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { branches, users, userSessions } from '../src/db/schema';

let app: any;
let db: typeof import('../server/db')['db'];

const FIXTURES = {
    branchId: 'test-setup-security-branch',
    userId: 'test-setup-security-user',
    managerId: 'test-setup-security-manager',
    managerSessionId: 'test-setup-security-manager-session',
    managerTokenId: 'test-setup-security-manager-token',
    email: 'setup-security@restoflow.local',
    managerEmail: 'setup-security-manager@restoflow.local',
};

const getJwtSecret = () => process.env.JWT_SECRET || 'test-jwt-secret-for-setup-security';

const managerAuthHeader = () => {
    const token = jwt.sign({
        sub: FIXTURES.managerId,
        id: FIXTURES.managerId,
        role: 'BRANCH_MANAGER',
        permissions: [],
        branchId: FIXTURES.branchId,
        sid: FIXTURES.managerSessionId,
        jti: FIXTURES.managerTokenId,
    }, getJwtSecret());
    return `Bearer ${token}`;
};

describe('setup route security', () => {
    beforeEach(async () => {
        if (!app || !db) {
            const appModule = await import('../server/app');
            app = appModule.default;
            const dbModule = await import('../server/db');
            db = dbModule.db;
        }

        await db.insert(branches).values({
            id: FIXTURES.branchId,
            name: 'Setup Security Branch',
            isActive: true,
        }).onConflictDoNothing();

        await db.insert(users).values({
            id: FIXTURES.userId,
            name: 'Setup Security Admin',
            email: FIXTURES.email,
            role: 'SUPER_ADMIN',
            permissions: ['*'],
            assignedBranchId: FIXTURES.branchId,
            isActive: true,
        }).onConflictDoNothing();

        await db.insert(users).values({
            id: FIXTURES.managerId,
            name: 'Setup Security Manager',
            email: FIXTURES.managerEmail,
            role: 'BRANCH_MANAGER',
            permissions: [],
            assignedBranchId: FIXTURES.branchId,
            isActive: true,
        }).onConflictDoNothing();

        await db.insert(userSessions).values({
            id: FIXTURES.managerSessionId,
            userId: FIXTURES.managerId,
            tokenId: FIXTURES.managerTokenId,
            isActive: true,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        }).onConflictDoNothing();
    });

    it('keeps setup status public', async () => {
        const res = await request(app).get('/api/setup/status');

        expect(res.status).toBe(200);
        expect(res.body.needsSetup).toBe(false);
    });

    it('blocks anonymous chart-of-accounts seeding after initialization', async () => {
        const res = await request(app).post('/api/setup/seed-coa').send({});

        expect(res.status).toBe(401);
        expect(res.body.error || res.body.code).toBeTruthy();
    });

    it('blocks anonymous operational reset', async () => {
        const res = await request(app).post('/api/setup/reset-test-data').send({});

        expect(res.status).toBe(401);
    });

    it('blocks branch managers from operational reset', async () => {
        const res = await request(app)
            .post('/api/setup/reset-test-data')
            .set('Authorization', managerAuthHeader())
            .send({});

        expect(res.status).toBe(403);
    });
});
