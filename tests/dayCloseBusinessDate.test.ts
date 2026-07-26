import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { branches, users, userSessions } from '../src/db/schema';

let app: any;
let db: typeof import('../server/db')['db'];

const authHeader = (userId: string, sessionId: string, tokenId: string) => `Bearer ${jwt.sign({
    sub: userId,
    id: userId,
    role: 'SUPER_ADMIN',
    permissions: ['*'],
    sid: sessionId,
    jti: tokenId,
}, process.env.JWT_SECRET || 'test-jwt-secret-for-day-close-date')}`;

describe('day close business date guard', () => {
    beforeEach(async () => {
        if (!app || !db) {
            app = (await import('../server/app')).default;
            db = (await import('../server/db')).db;
        }
    });

    it('rejects closing a non-active date and allows an explicit safe date change', async () => {
        const suffix = Date.now();
        const branchId = `test-day-close-date-branch-${suffix}`;
        const userId = `test-day-close-date-user-${suffix}`;
        const sessionId = `test-day-close-date-session-${suffix}`;
        const tokenId = `test-day-close-date-token-${suffix}`;
        const activeDate = '2026-07-10';
        const requestedDate = '2026-07-09';

        await db.insert(branches).values({ id: branchId, name: 'Day Close Date Branch', businessDate: activeDate, isActive: true });
        await db.insert(users).values({
            id: userId,
            name: 'Day Close Date Manager',
            email: `${userId}@restoflow.local`,
            role: 'SUPER_ADMIN',
            permissions: ['*'],
            assignedBranchId: branchId,
            isActive: true,
        });
        await db.insert(userSessions).values({
            id: sessionId,
            userId,
            tokenId,
            isActive: true,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        });
        const auth = authHeader(userId, sessionId, tokenId);

        const wrongDateClose = await request(app)
            .post(`/api/day-close/${branchId}/${requestedDate}/close`)
            .set('Authorization', auth)
            .send({ enforceShiftsClosed: true });
        expect(wrongDateClose.status).toBe(409);
        expect(wrongDateClose.body.code).toBe('BUSINESS_DATE_MISMATCH');
        expect(wrongDateClose.body.details?.businessDate).toBe(activeDate);

        const dateChange = await request(app)
            .put(`/api/day-close/${branchId}/business-date`)
            .set('Authorization', auth)
            .send({ businessDate: requestedDate });
        expect(dateChange.status).toBe(200);
        expect(dateChange.body.businessDate).toBe(requestedDate);

        const futureChange = await request(app)
            .put(`/api/day-close/${branchId}/business-date`)
            .set('Authorization', auth)
            .send({ businessDate: '2999-01-01' });
        expect(futureChange.status).toBe(400);
        expect(futureChange.body.code).toBe('FUTURE_BUSINESS_DATE_NOT_ALLOWED');
    });
});
