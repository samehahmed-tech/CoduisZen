import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import { orders, users } from '../src/db/schema';
import { parsePagination, parseCursorPagination } from '../server/middleware/pagination';

let app: any;
let db: typeof import('../server/db')['db'];
let token = '';

const BRANCH = 'b1';
const ids = Array.from({ length: 105 }, (_, i) => `test-page-order-${i}`);

describe('Phase-6 pagination policy', () => {
    beforeAll(async () => {
        const appModule = await import('../server/app');
        app = appModule.default;
        const dbModule = await import('../server/db');
        db = dbModule.db;
        await db.insert(users).values({
            id: 'test-page-admin',
            name: 'Page Test Admin',
            email: 'test-page-admin@restoflow.local',
            role: 'SUPER_ADMIN',
            permissions: ['*'],
            assignedBranchId: BRANCH,
            isActive: true,
        } as any).catch(() => undefined);
        const login = await request(app).post('/api/auth/pin-login').send({ pin: '202626' });
        expect(login.status).toBe(200);
        token = login.body.token;
        // Seed 105 minimal orders (boundary: 100 + 9).
        const rows = ids.map((id, i) => ({
            id,
            type: 'TAKEAWAY',
            branchId: BRANCH,
            status: 'PENDING',
            subtotal: 100,
            tax: 14,
            total: 100 + i,
            customerName: `PAGETEST-${i}`,
        }));
        for (let i = 0; i < rows.length; i += 25) {
            await db.insert(orders).values(rows.slice(i, i + 25) as any);
        }
    });

    afterAll(async () => {
        await db.delete(orders).where(inArray(orders.id, ids));
        await db.delete(users).where(eq(users.id, 'test-page-admin')).catch(() => undefined);
    });

    // Sessions can be revoked by concurrent housekeeping — enter each API
    // test with a fresh one instead of reusing a possibly stale token.
    const freshAuth = async () => {
        const login = await request(app).post('/api/auth/pin-login').send({ pin: '202626' });
        expect(login.status).toBe(200);
        token = login.body.token;
    };

    it('shared helper clamps page size to 100', () => {
        const fake = (q: any) => ({ query: q }) as any;
        expect(parsePagination(fake({ limit: '10000' })).limit).toBe(100);
        expect(parsePagination(fake({ limit: '500' })).limit).toBe(100);
        expect(parsePagination(fake({ limit: '25' })).limit).toBe(25);
        expect(parsePagination(fake({})).limit).toBe(50);
        expect(parseCursorPagination(fake({ limit: '999' }), 100).limit).toBe(100);
        expect(parsePagination(fake({ page: '-3', limit: '10' })).page).toBe(1);
    });

    it('legacy list never exceeds 100 records', async () => {
        await freshAuth();
        const res = await request(app)
            .get('/api/orders?branch_id=b1&limit=10000')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeLessThanOrEqual(100);
    });

    it('page mode returns exact totals across boundaries', async () => {
        await freshAuth();
        const p1: any = await request(app)
            .get('/api/orders?branch_id=b1&mode=page&page=1&limit=100')
            .set('Authorization', `Bearer ${token}`);
        expect(p1.status).toBe(200);
        expect(p1.body.data.length).toBe(100);
        const total = p1.body.pagination.total;
        expect(total).toBeGreaterThanOrEqual(105);
        expect(p1.body.pagination.totalPages).toBe(Math.ceil(total / 100));
        expect(p1.body.summary).toBeTruthy();

        const lastPage = p1.body.pagination.totalPages;
        const plast: any = await request(app)
            .get(`/api/orders?branch_id=b1&mode=page&page=${lastPage}&limit=100`)
            .set('Authorization', `Bearer ${token}`);
        expect(plast.status).toBe(200);
        expect(plast.body.data.length).toBe(total - (lastPage - 1) * 100);
        expect(plast.body.pagination.hasNext).toBe(false);
    });

    it('out-of-range page stays valid, search and sort work server-side', async () => {
        await freshAuth();
        const empty: any = await request(app)
            .get('/api/orders?branch_id=b1&mode=page&page=9999&limit=25')
            .set('Authorization', `Bearer ${token}`);
        expect(empty.status).toBe(200);
        expect(empty.body.data).toEqual([]);
        expect(empty.body.pagination.totalPages).toBeGreaterThanOrEqual(1);

        const q: any = await request(app)
            .get('/api/orders?branch_id=b1&mode=page&q=PAGETEST-42&limit=100')
            .set('Authorization', `Bearer ${token}`);
        expect(q.status).toBe(200);
        expect(q.body.data.length).toBeGreaterThanOrEqual(1);
        expect(q.body.data.every((o: any) => String(o.customerName || '').includes('PAGETEST'))).toBe(true);

        const hi: any = await request(app)
            .get('/api/orders?branch_id=b1&mode=page&sort=highest&limit=5')
            .set('Authorization', `Bearer ${token}`);
        expect(hi.status).toBe(200);
        const totals = hi.body.data.map((o: any) => Number(o.total || 0));
        const sorted = [...totals].sort((a, b) => b - a);
        expect(totals).toEqual(sorted);
    });
});
