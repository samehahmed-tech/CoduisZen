import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { branches, users, userSessions } from '../src/db/schema';
import { eq } from 'drizzle-orm';

let app: any;
let db: typeof import('../server/db')['db'];

const jwtSecret = () => process.env.JWT_SECRET || 'test-jwt-secret-for-user-delete-copy';

const createSession = async (input: { userId: string; branchId: string; role: string; permissions?: string[] }) => {
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
        sub: input.userId, id: input.userId, role: input.role,
        permissions: input.permissions || [], branchId: input.branchId, sid: sessionId, jti: tokenId,
    }, jwtSecret());
    return `Bearer ${token}`;
};

const makeUser = async (suffix: string, overrides: Record<string, any> = {}) => {
    const id = `test-delcopy-${suffix}`;
    await db.insert(users).values({
        id, name: id, email: `${id}@restoflow.local`, role: 'CASHIER',
        permissions: [], assignedBranchId: null, isActive: true, ...overrides,
    });
    return id;
};

describe('user hard delete and permission copy', () => {
    let branchId = '';

    beforeEach(async () => {
        if (!app || !db) {
            const appModule = await import('../server/app');
            app = appModule.default;
            const dbModule = await import('../server/db');
            db = dbModule.db;
        }
        if (!branchId) {
            branchId = `test-delcopy-branch-${Date.now()}`;
            await db.insert(branches).values({ id: branchId, name: 'DeleteCopy Branch', isActive: true });
        }
    });

    const freshAdmin = () => createSession({
        userId: `test-delcopy-admin-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        branchId, role: 'SUPER_ADMIN', permissions: ['*'],
    });

    it('hard-deletes a user with ?hard=true and revokes sessions', async () => {
        const adminAuth = await freshAdmin();
        const targetId = await makeUser(`hard${Date.now()}`);
        await db.insert(userSessions).values({
            id: `${targetId}-sess`, userId: targetId, tokenId: `${targetId}-tok`,
            isActive: true, expiresAt: new Date(Date.now() + 3600_000),
        });
        const res = await request(app).delete(`/api/users/${targetId}?hard=true`).set('Authorization', adminAuth);
        expect(res.status).toBe(200);
        expect(res.body.deleted).toBe(true);
        const gone = await request(app).get(`/api/users/${targetId}`).set('Authorization', adminAuth);
        expect(gone.status).toBe(404);
        const sessions = await db.select().from(userSessions).where(eq(userSessions.userId, targetId));
        expect(sessions.length).toBe(0);
    });

    it('refuses to hard-delete protected system owner', async () => {
        const adminAuth = await freshAdmin();
        const res = await request(app).delete('/api/users/user_sys_sameh_191224?hard=true').set('Authorization', adminAuth);
        expect(res.status).toBe(403);
    });

    it('bulk hard-deletes users and skips protected ids', async () => {
        const adminAuth = await freshAdmin();
        const stamp = Date.now();
        const a = await makeUser(`bulkA${stamp}`);
        const b = await makeUser(`bulkB${stamp}`);
        const res = await request(app).post('/api/users/bulk/delete')
            .set('Authorization', adminAuth)
            .send({ userIds: [a, b, 'user_sys_sameh_191224'], hard: true });
        expect(res.status).toBe(200);
        expect(res.body.deleted).toBe(2);
        expect(res.body.skipped).toBe(1);
        const checkA = await request(app).get(`/api/users/${a}`).set('Authorization', adminAuth);
        expect(checkA.status).toBe(404);
    });

    it('copies role and permissions from one user to another', async () => {
        const adminAuth = await freshAdmin();
        const stamp = Date.now();
        const source = await makeUser(`src${stamp}`, {
            role: 'BRANCH_MANAGER',
            permissions: ['OP_VOID_ORDER', 'DATA_VIEW_REPORTS'],
            customPermissions: JSON.stringify({ OP_REFUND: true }) as any,
        });
        const target = await makeUser(`dst${stamp}`, { role: 'CASHIER', permissions: [] });
        await db.insert(userSessions).values({
            id: `${target}-sess`, userId: target, tokenId: `${target}-tok`,
            isActive: true, expiresAt: new Date(Date.now() + 3600_000),
        });
        const res = await request(app).post(`/api/users/${target}/copy-permissions`)
            .set('Authorization', adminAuth)
            .send({ sourceUserId: source });
        expect(res.status).toBe(200);
        expect(res.body.role).toBe('BRANCH_MANAGER');
        expect(res.body.permissions).toEqual(['OP_VOID_ORDER', 'DATA_VIEW_REPORTS']);
        expect(res.body.customPermissions).toEqual({ OP_REFUND: true });
        const sessions = await db.select().from(userSessions).where(eq(userSessions.userId, target));
        expect(sessions.every((s) => !s.isActive)).toBe(true);
        await request(app).delete(`/api/users/${source}?hard=true`).set('Authorization', adminAuth);
        await request(app).delete(`/api/users/${target}?hard=true`).set('Authorization', adminAuth);
    });

    it('returns 404 when copy source does not exist', async () => {
        const adminAuth = await freshAdmin();
        const target = await makeUser(`nosrc${Date.now()}`);
        const res = await request(app).post(`/api/users/${target}/copy-permissions`)
            .set('Authorization', adminAuth)
            .send({ sourceUserId: 'test-delcopy-ghost' });
        expect(res.status).toBe(404);
        await request(app).delete(`/api/users/${target}?hard=true`).set('Authorization', adminAuth);
    });
});
