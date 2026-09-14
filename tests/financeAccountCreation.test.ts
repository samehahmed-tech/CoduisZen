import { describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { users, userSessions } from '../src/db/schema';

let app: any;
let db: typeof import('../server/db')['db'];

const jwtSecret = () => process.env.JWT_SECRET || 'test-jwt-secret-for-coa-probe';

const createAuth = async (suffix: string) => {
    const userId = `test-coa-user-${suffix}`;
    const sessionId = `${userId}-session`;
    const tokenId = `${userId}-token`;
    await db.insert(users).values({
        id: userId,
        name: 'COA Tester',
        email: `${userId}@restoflow.local`,
        role: 'SUPER_ADMIN',
        permissions: ['*'],
        isActive: true,
    });
    await db.insert(userSessions).values({
        id: sessionId,
        userId,
        tokenId,
        isActive: true,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const token = jwt.sign({ sub: userId, id: userId, role: 'SUPER_ADMIN', permissions: ['*'], sid: sessionId, jti: tokenId }, jwtSecret());
    return `Bearer ${token}`;
};

describe('chart of accounts add-account', () => {
    it('accepts Arabic/Persian digit codes and reports precise validation errors', async () => {
        if (!app || !db) {
            const appModule = await import('../server/app');
            app = appModule.default;
            const dbModule = await import('../server/db');
            db = dbModule.db;
        }
        const suffix = Date.now().toString();
        const auth = await createAuth(suffix);

        const payload = {
            name: 'Test Account',
            nameAr: 'حساب تجريبي',
            type: 'EXPENSE',
            normalBalance: 'DEBIT',
            parentId: '',
            allowManualJournals: true,
        };
        const unique = Math.floor(100000 + Math.random() * 900000).toString();

        const normal = await request(app)
            .post('/api/finance/accounts')
            .set('Authorization', auth)
            .send({ ...payload, code: `67${unique}` });
        expect(normal.status).toBe(201);

        // Eastern Arabic-Indic digits (٦٧) typed on an Arabic keyboard must be normalized
        const arabicDigits = await request(app)
            .post('/api/finance/accounts')
            .set('Authorization', auth)
            .send({ ...payload, code: '٦٧' + unique.slice(-2) });
        expect(arabicDigits.status).toBe(201);
        expect(arabicDigits.body?.code).toBe('67' + unique.slice(-2));

        // Persian digits (۶۸) must be normalized too
        const persianDigits = await request(app)
            .post('/api/finance/accounts')
            .set('Authorization', auth)
            .send({ ...payload, code: '۶۸' + unique.slice(-2) });
        expect(persianDigits.status).toBe(201);
        expect(persianDigits.body?.code).toBe('68' + unique.slice(-2));

        const missingName = await request(app)
            .post('/api/finance/accounts')
            .set('Authorization', auth)
            .send({ ...payload, code: `69${unique}`, name: '' });
        expect(missingName.status).toBe(400);
        expect(missingName.body?.code).toBe('ACCOUNT_NAME_REQUIRED');

        const badCode = await request(app)
            .post('/api/finance/accounts')
            .set('Authorization', auth)
            .send({ ...payload, code: 'AB12', name: 'X' });
        expect(badCode.status).toBe(400);
        expect(badCode.body?.code).toBe('ACCOUNT_CODE_INVALID');
    });
});
