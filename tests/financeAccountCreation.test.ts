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
        // Keep all generated codes within the 12-digit API limit while making
        // repeated runs collision-resistant in the persistent integration DB.
        const unique = `${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`;

        const normal = await request(app)
            .post('/api/finance/accounts')
            .set('Authorization', auth)
            // Keep the baseline code outside the normalized Arabic/Persian
            // two-digit ranges below; otherwise a random suffix can collide.
            .send({ ...payload, code: `65${unique}` });
        expect(normal.status).toBe(201);

        // Eastern Arabic-Indic digits (٦٧) typed on an Arabic keyboard must be normalized
        const arabicDigits = await request(app)
            .post('/api/finance/accounts')
            .set('Authorization', auth)
            .send({ ...payload, code: '٦٧' + unique });
        expect(arabicDigits.status).toBe(201);
        expect(arabicDigits.body?.code).toBe('67' + unique);

        // Persian digits (۶۸) must be normalized too
        const persianDigits = await request(app)
            .post('/api/finance/accounts')
            .set('Authorization', auth)
            .send({ ...payload, code: '۶۸' + unique });
        expect(persianDigits.status).toBe(201);
        expect(persianDigits.body?.code).toBe('68' + unique);

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
    }, 15_000);
});
